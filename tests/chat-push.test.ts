import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedPushEndpoint, chatNotification, deliverChatPush } from '../supabase/functions/notify/chat-push.ts'
const row={delivery_id:'delivery',claim_id:'claim',endpoint:'https://web.push.apple.com/qa',p256dh:'key',auth:'auth',employee_id:'recipient',lang:'DE',room_id:'room',room_kind:'studio',room_title:'QA',sender_name:'Test',message_body:'Neue Nachricht',message_id:'message',badge_count:2}
function harness(overrides:any={}){
 const calls:any[]=[],sends:any[]=[]
 const db={rpc:async(name:string,args:any)=>{
  calls.push([name,args])
  if(name==='claim_chat_push')return {data:[row],error:null}
  if(name==='chat_push_valid')return {data:overrides.valid!==false,error:null}
  return {error:null}
 },from:()=>({delete:()=>({eq:async()=>{calls.push(['remove']);return {error:null}}})})}
 const send=async(...args:any[])=>{sends.push(args);if(overrides.status)throw {statusCode:overrides.status}}
 return {db,calls,sends,send}
}
test('push URLs are browser providers, never arbitrary destinations',()=>{
 for(const url of ['https://web.push.apple.com/q','https://fcm.googleapis.com/fcm/send/q','https://fcm.googleapis.com/wp/q','https://updates.push.services.mozilla.com/wpush/v2/q','https://wns.notify.windows.com/q'])assert.equal(allowedPushEndpoint(url),true,url)
 for(const url of ['http://web.push.apple.com/q','https://web.push.apple.com.attacker.invalid/q','https://web.push.apple.com@attacker.invalid/q','https://127.0.0.1/q','https://fcm.googleapis.com/arbitrary','https://web.push.apple.com:444/q','not a url'])assert.equal(allowedPushEndpoint(url),false,url)
})
test('chat payload has the correct thread, per-message identity, recipient and bounded preview',()=>{
 const msg=chatNotification({...row,message_body:'🙂'.repeat(200)})
 assert.equal(msg.url,'/?open=chat:room');assert.equal(msg.tag,'chat-message');assert.equal(msg.employeeId,'recipient');assert.equal(msg.badgeCount,2)
 assert.equal([...msg.body.split(': ')[1]].length,160)
 assert.equal(chatNotification({...row,lang:'FR',room_kind:'team'}).title,'Toute l’équipe')
})
test('delivery checks current authorization, then acknowledges just this device claim',async()=>{
 const h=harness();assert.deepEqual(await deliverChatPush(h.db,h.send),{sent:1,failed:0,removed:0,skipped:0})
 assert.equal(h.calls[1][0],'chat_push_valid');assert.equal(h.sends.length,1);assert.equal(h.sends[0][2].urgency,'high')
 assert.deepEqual(h.calls.at(-1),['finish_chat_push',{p_delivery:'delivery',p_claim:'claim',p_result:'sent',p_error:null}])
})
test('read or revoked delivery is skipped, transient provider errors retry and expired endpoints are removed',async()=>{
 const no=harness({valid:false});assert.equal((await deliverChatPush(no.db,no.send)).skipped,1);assert.equal(no.sends.length,0)
 const retry=harness({status:503});assert.equal((await deliverChatPush(retry.db,retry.send)).failed,1);assert.equal(retry.calls.at(-1)[1].p_result,'retry')
 for(const status of [404,410]){const h=harness({status});assert.equal((await deliverChatPush(h.db,h.send)).removed,1);assert.equal(h.calls.at(-1)[0],'remove')}
})
