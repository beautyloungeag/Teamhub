// Phorest's documented internal calendar breaks, never customer bookings.
export type Slot = { breakDate: string; startTime: string; endTime: string; staffId: string; label: string; paidBreak: boolean }
export function slotFor(event: any, employeeId: string, staffId: string): Slot {
  if (!event.ends_at || Date.parse(event.ends_at) <= Date.parse(event.starts_at)) throw new Error('end_required')
  const parts = (iso: string) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(p => [p.type, p.value]))
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` }
  }
  const start = parts(event.starts_at), end = parts(event.ends_at)
  if (start.date !== end.date || end.time <= start.time) throw new Error('single_day_required')
  let marker=14695981039346656037n
  for (const c of `${event.id}:${employeeId}`) marker=BigInt.asUintN(64,(marker^BigInt(c.charCodeAt(0)))*1099511628211n)
  return { breakDate: start.date, startTime: start.time, endTime: end.time, staffId, label: `TeamHub · ${event.title.slice(0, 100)} [${marker.toString(16).padStart(16,'0')}]`, paidBreak: event.phorest_paid !== false }
}
export const sameSlot = (a: any, b: any) => a && b && ['breakDate','startTime','endTime','staffId','label','paidBreak','roomId','machineId'].every(k => {
  const canonical=(v:any)=>k==='startTime'||k==='endTime'?String(v??'').slice(0,8).padEnd(8,':00'):k==='roomId'||k==='machineId'?(v??''):v
  return canonical(a[k])===canonical(b[k])
})
export const overlaps = (start: string, end: string, other: any) => start < other.endTime && end > other.startTime
export type Ph = (path: string, method?: string, data?: unknown) => Promise<any>
export async function allPages(ph: Ph, path: string, key: string): Promise<any[]> {
 const out: any[]=[]
 for(let page=0;page<30;page++) {
  const result=await ph(`${path}&size=200&page=${page}`)
  if (!Array.isArray(result) && !Array.isArray(result?._embedded?.[key]) && result?.page?.totalElements !== 0) throw new Error('provider_response_incomplete')
  const rows=result?._embedded?.[key] ?? (Array.isArray(result) ? result : [])
  out.push(...rows)
  if (result?.page ? page+1 >= result.page.totalPages : rows.length<200) return out
 }
 throw new Error('provider_list_incomplete')
}
// A timeout after create is recovered by the unique label before any retry; direct changes
// in Phorest are detected and left untouched. Caller serializes the complete event.
export async function syncSlot(ph: Ph, branch: string, desired: Slot | null, link: any, save: (r: any) => Promise<void>) {
 const root=`/branch/${encodeURIComponent(branch)}/break`
 let current:any=null
 // Recover an acknowledged-or-unknown create before applying newer edits/cancellation.
 if (!link?.break_id && link?.intent) {
  const intent=link.intent
  const candidates=await allPages(ph,`${root}?from_date=${intent.breakDate}&to_date=${intent.breakDate}&staff_id=${encodeURIComponent(intent.staffId)}`,'breaks')
  const matches=candidates.filter(b=>b.label===intent.label)
  if(matches.length>1)throw new Error('duplicate_remote_entries')
  if(matches.length) {
   if(!sameSlot(matches[0],intent))throw new Error('phorest_changed_manually')
   link={...link,break_id:matches[0].breakId,snapshot:matches[0]}
   await save({break_id:link.break_id,snapshot:link.snapshot})
  }
 }
 if (link?.break_id) {
  try { current=await ph(`${root}/${encodeURIComponent(link.break_id)}`) }
  catch(e) { if ((e as Error).message!=='phorest_404') throw e }
  if (current && desired && sameSlot(current,desired)) { await save({break_id:current.breakId,snapshot:current}); return }
  if (current && !sameSlot(current,link.snapshot)) throw new Error('phorest_changed_manually')
 }
 if (!desired) {
  // Only a link we own and whose complete payload still matches may be deleted.
  if(current) await ph(`${root}/${encodeURIComponent(link.break_id)}`,'DELETE')
  await save({ break_id:null,snapshot:null }); return
 }
 if(current && sameSlot(current,desired)) return
 const query=`?from_date=${desired.breakDate}&to_date=${desired.breakDate}&staff_id=${encodeURIComponent(desired.staffId)}`
 const breaks=await allPages(ph,root+query,'breaks')
 if (!current) {
  const matches=breaks.filter(b=>b.label===desired.label)
  if(matches.length>1) throw new Error('duplicate_remote_entries')
  if(matches.length===1) {
   if(!sameSlot(matches[0],desired)) throw new Error('phorest_changed_manually')
   await save({break_id:matches[0].breakId,snapshot:matches[0]}); return
  }
 }
 const appts=await allPages(ph,`/branch/${encodeURIComponent(branch)}/appointment${query}&fetch_canceled=false`,'appointments')
 if(appts.some(a=>a.staffId===desired.staffId && !a.deleted && a.activationState!=='CANCELED' && overlaps(desired.startTime,desired.endTime,a))
   || breaks.some(b=>b.staffId===desired.staffId && b.breakId!==current?.breakId && overlaps(desired.startTime,desired.endTime,b))) throw new Error('calendar_conflict')
 await save({intent:desired})
 const result=await ph(current?`${root}/${encodeURIComponent(current.breakId)}`:root,current?'PUT':'POST',current?{...desired,breakId:current.breakId,version:current.version}:desired)
 if(!result?.breakId) throw new Error('provider_response_incomplete')
 // Persist the accepted payload. Some create responses only contain an ID/version.
 const accepted=await ph(`${root}/${encodeURIComponent(result.breakId)}`)
 await save({break_id:accepted.breakId,snapshot:accepted})
 if(!sameSlot(accepted,desired)) throw new Error('provider_readback_mismatch')
 await save({break_id:accepted.breakId,snapshot:accepted})
}
