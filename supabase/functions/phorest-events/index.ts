import { createClient } from 'jsr:@supabase/supabase-js@2.117.2'
import { slotFor, syncSlot, type Slot } from './sync.ts'
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-notify-secret','Access-Control-Allow-Methods':'POST, OPTIONS'}
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{...cors,'Content-Type':'application/json'}})
const safeError=(e:unknown)=> /^(phorest_\d+|end_required|single_day_required|phorest_changed_manually|duplicate_remote_entries|calendar_conflict|provider_response_incomplete|provider_readback_mismatch|provider_list_incomplete|missing_mapping|continue|superseded|database_error)$/.test((e as Error)?.message??'')?(e as Error).message:'sync_failed'
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:cors})
 if(req.method!=='POST') return json({ok:false,error:'method'},405)
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
 const body=await req.json().catch(()=>({}))
 const scheduled=!!Deno.env.get('NOTIFY_SECRET') && req.headers.get('x-notify-secret')===Deno.env.get('NOTIFY_SECRET')
 let eventId:string|null=null
 if(!scheduled){
  const user=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')??''}}})
  const {data:me}=await user.rpc('current_employee')
  if(!me?.id) return json({ok:false,error:'not_signed_in'},401)
  if(typeof body.event_id!=='string') return json({ok:false,error:'event_required'},400)
  const {data:event}=await user.from('events').select('id,created_by').eq('id',body.event_id).maybeSingle()
  if(!event || !(me.app_role==='buero'||(me.app_role==='filialleitung'&&event.created_by===me.id))) return json({ok:false,error:'forbidden'},403)
  eventId=event.id
  if(body.action==='inspect') {
   const {data:ev}=await db.from('events').select('*').eq('id',event.id).single()
   const {data:links}=await db.from('phorest_event_links').select('*').eq('event_id',event.id)
   const owned=[]
   for(const link of links??[]) {
    const slot=slotFor(ev,link.employee_id,link.staff_id)
    const auth=Deno.env.get('PHOREST_AUTH')!,bid=Deno.env.get('PHOREST_BUSINESS_ID')!
    const r=await fetch(`https://api-gateway-eu.phorest.com/third-party-api-server/api/business/${encodeURIComponent(bid)}/branch/${encodeURIComponent(link.phorest_branch_id)}/break?from_date=${slot.breakDate}&to_date=${slot.breakDate}&staff_id=${encodeURIComponent(link.staff_id)}&size=200`,{headers:{Authorization:auth,Accept:'application/json'},signal:AbortSignal.timeout(8000)})
    if(!r.ok)return json({ok:false,error:`phorest_${r.status}`})
    const result=await r.json()
    owned.push(...(result?._embedded?.breaks??[]).filter((b:any)=>[slot.label,link.snapshot?.label,link.intent?.label].filter(Boolean).includes(b.label)))
   }
   return json({ok:true,owned})
  }
  if(body.action==='retry') await db.from('phorest_event_jobs').update({next_at:new Date().toISOString(),dirty:true}).eq('event_id',eventId)
 }
 const {data:jobs,error}=await db.rpc('claim_phorest_events',{p_event:eventId})
 if(error) return json({ok:false,error:'database_error'},500)
 if(!jobs?.length) return json({ok:true,processed:0})
 const job=jobs[0], started=Date.now()
 const checked=async(p:PromiseLike<any>)=>{const r=await p;if(r.error)throw new Error('database_error');return r.data}
 const ensureClaim=async()=>{
  const row=await checked(db.from('phorest_event_jobs').select('claim,revision').eq('event_id',job.event_id).single())
  if(row.claim!==job.claim||row.revision!==job.revision) throw new Error('superseded')
 }
 const ph=async(path:string,method='GET',data?:unknown)=>{
  if(method!=='GET') await ensureClaim()
  const auth=Deno.env.get('PHOREST_AUTH'),bid=Deno.env.get('PHOREST_BUSINESS_ID')
  if(!auth||!bid)throw new Error('not_configured')
  const r=await fetch(`https://api-gateway-eu.phorest.com/third-party-api-server/api/business/${encodeURIComponent(bid)}${path}`,{method,headers:{Authorization:auth,Accept:'application/json','Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(8000)})
  if(!r.ok)throw new Error(`phorest_${r.status}`)
  return r.status===204?null:await r.json()
 }
 let problem:string|null=null, count=0
 try{
  const event=await checked(db.from('events').select('*').eq('id',job.event_id).maybeSingle())
  const links=await checked(db.from('phorest_event_links').select('*').eq('event_id',job.event_id))??[]
  // Preserve historical provider entries; this integration manages future calendar blocks.
  if(event && Date.parse(event.starts_at)<=Date.now()) throw new Error('past_event')
  const targets=new Map<string,any>()
  for(const link of links)targets.set(`${link.employee_id}:${link.branch_id}`,{link,desired:null})
  let missing=false
  if(event?.phorest_sync && !event.is_sample){
   const regs=await checked(db.from('event_registrations').select('employee_id').eq('event_id',event.id).eq('coming',true).eq('waitlist',false))??[]
   for(const reg of regs){
    const employee=await checked(db.from('employees').select('id,active').eq('id',reg.employee_id).maybeSingle())
    if(!employee?.active)continue
    const maps=await checked(db.from('employee_phorest').select('branch_id,staff_id').eq('employee_id',reg.employee_id))??[]
    if(!maps.length)missing=true
    for(const map of maps){
     const branch=await checked(db.from('branches').select('phorest_branch_id').eq('id',map.branch_id).single())
     if(!branch?.phorest_branch_id){missing=true;continue}
     const key=`${reg.employee_id}:${map.branch_id}`, old=targets.get(key)?.link
     const link=old??{event_id:event.id,employee_id:reg.employee_id,branch_id:map.branch_id,phorest_branch_id:branch.phorest_branch_id,staff_id:map.staff_id,break_id:null,snapshot:null}
     if(old&&(old.phorest_branch_id!==branch.phorest_branch_id||old.staff_id!==map.staff_id)){missing=true;targets.delete(key);continue}
     targets.set(key,{link,desired:slotFor(event,reg.employee_id,map.staff_id)})
    }
   }
  }
  for(const {link,desired} of targets.values() as Iterable<{link:any;desired:Slot|null}>){
   if(Date.now()-started>60000 || count>=25){problem??='continue';break}
   // Never remove a historical entry during cancellation/deletion.
   if(!desired && link.snapshot?.breakDate && link.snapshot.breakDate<new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich'}).format(new Date()))continue
   try{
    await ensureClaim()
    // Durable intent exists even when create succeeds but its response is lost.
    if(!link.break_id)await checked(db.from('phorest_event_links').upsert(link))
    await syncSlot(ph,link.phorest_branch_id,desired,link,async patch=>{
     await checked(db.from('phorest_event_links').update({...patch,updated_at:new Date().toISOString()}).match({event_id:link.event_id,employee_id:link.employee_id,branch_id:link.branch_id}))
    })
    count++
   }catch(e){problem??=safeError(e);if(problem==='superseded')break}
  }
  if(missing)problem??='missing_mapping'
 }catch(e){problem=(e as Error).message==='past_event'?null:safeError(e)}
 const {error:finishError}=await db.rpc('finish_phorest_event',{p_event:job.event_id,p_claim:job.claim,p_revision:job.revision,p_error:problem})
 return json({ok:!problem&&!finishError,processed:count,...(problem?{error:problem}:{})})
})
