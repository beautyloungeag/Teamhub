import test from 'node:test'
import assert from 'node:assert/strict'
import { slotFor, syncSlot } from '../supabase/functions/phorest-events/sync.ts'
const ev={id:'ev',title:'Training',starts_at:'2099-01-10T09:00:00Z',ends_at:'2099-01-10T10:00:00Z',phorest_paid:true}
const slot=slotFor(ev,'me','staff')
function provider(){
 const rows:any[]=[], appts:any[]=[], writes:any[]=[], saves:any[]=[]
 const ph=async(path:string,method='GET',data?:any)=>{
  if(method==='POST'){writes.push(method);const row={...data,breakId:'break',version:1};rows.push(row);return row}
  if(method==='PUT'){writes.push(method);Object.assign(rows[0],data,{version:rows[0].version+1});return rows[0]}
  if(method==='DELETE'){writes.push(method);rows.length=0;return null}
  if(path.includes('/appointment?'))return {_embedded:{appointments:appts},page:{totalPages:1}}
  if(path.includes('/break?'))return {_embedded:{breaks:rows},page:{totalPages:1}}
  if(!rows.length)throw new Error('phorest_404')
  return structuredClone(rows[0])
 }
 return {rows,appts,writes,saves,ph,save:async(r:any)=>{saves.push(structuredClone(r))}}
}
test('Swiss time conversion includes DST and rejects midnight-spanning slots',()=>{
 assert.equal(slot.startTime,'10:00:00')
 assert.equal(slotFor({...ev,starts_at:'2099-07-10T09:00:00Z',ends_at:'2099-07-10T10:00:00Z'},'me','staff').startTime,'11:00:00')
 assert.throws(()=>slotFor({...ev,ends_at:'2099-01-11T10:00:00Z'},'me','staff'),/single_day/)
})
test('create/readback/retry/update/cancel affect only the owned internal break',async()=>{
 const p=provider();await syncSlot(p.ph,'branch',slot,null,p.save)
 let link=p.saves.at(-1);await syncSlot(p.ph,'branch',slot,link,p.save);assert.deepEqual(p.writes,['POST'])
 const changed={...slot,endTime:'12:00:00'};await syncSlot(p.ph,'branch',changed,link,p.save)
 link=p.saves.at(-1);await syncSlot(p.ph,'branch',null,link,p.save)
 assert.deepEqual(p.writes,['POST','PUT','DELETE']);assert.equal(p.rows.length,0)
})
test('uncertain create/update responses recover without duplicates',async()=>{
 const p=provider();p.rows.push({...slot,breakId:'break',version:1})
 await syncSlot(p.ph,'branch',slot,{break_id:null},p.save);assert.equal(p.writes.length,0)
 const link=p.saves.at(-1);p.rows[0].endTime='12:00:00'
 await syncSlot(p.ph,'branch',{...slot,endTime:'12:00:00'},link,p.save);assert.equal(p.writes.length,0)
})
test('manual edits and scheduling conflicts are preserved',async()=>{
 const p=provider();const remote={...slot,breakId:'break',version:1};p.rows.push({...remote,label:'Manual edit'})
 await assert.rejects(syncSlot(p.ph,'branch',null,{break_id:'break',snapshot:remote},p.save),/changed_manually/)
 p.rows.length=0;p.appts.push({staffId:'staff',startTime:'10:30:00',endTime:'11:30:00',activationState:'ACTIVE'})
 await assert.rejects(syncSlot(p.ph,'branch',slot,null,p.save),/calendar_conflict/);assert.equal(p.writes.length,0)
})
test('cancellation after an uncertain create uses durable intent to remove the orphan',async()=>{
 const p=provider();p.rows.push({...slot,startTime:slot.startTime+'.000',endTime:slot.endTime+'.000',breakId:'break',version:0})
 await syncSlot(p.ph,'branch',null,{break_id:null,intent:slot},p.save)
 assert.deepEqual(p.writes,['DELETE']);assert.equal(p.rows.length,0)
})
