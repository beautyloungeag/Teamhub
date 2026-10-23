// One durable row per message/device. No catch-up push for newly enrolled devices.
export function allowedPushEndpoint(endpoint: string) {
 try {
  const u=new URL(endpoint)
  if(u.protocol!=='https:'||u.username||u.password||u.port)return false
  return u.hostname==='push.apple.com'||u.hostname.endsWith('.push.apple.com')
   || (u.hostname==='fcm.googleapis.com'&&/^\/(fcm\/send|wp)\//.test(u.pathname))
   || u.hostname==='push.services.mozilla.com'||u.hostname.endsWith('.push.services.mozilla.com')
   || u.hostname==='notify.windows.com'||u.hostname.endsWith('.notify.windows.com')
 }catch{return false}
}
export function chatNotification(row:any) {
 const lang: 'DE'|'EN'|'FR'=row.lang==='EN'||row.lang==='FR'?row.lang:'DE'
 const texts={DE:{team:'Ganzes Team',studio:'Studio',chat:'Chat',message:'Neue Nachricht'},EN:{team:'Whole team',studio:'Studio',chat:'Chat',message:'New message'},FR:{team:'Toute l’équipe',studio:'Studio',chat:'Discussion',message:'Nouveau message'}}[lang]
 const room=row.room_kind==='team'?texts.team:row.room_kind==='studio'?`${texts.studio} ${row.room_title}`:row.room_title||texts.chat
 return {title:room.slice(0,90),body:`${row.sender_name?row.sender_name+': ':''}${[...row.message_body].slice(0,160).join('')}`,url:`/?open=chat:${row.room_id}`,tag:`chat-${row.message_id}`,badgeCount:row.badge_count,employeeId:row.employee_id}
}
export async function deliverChatPush(db:any,sendNotification:(sub:any,payload:string,options:any)=>Promise<unknown>) {
 const {data:rows,error}=await db.rpc('claim_chat_push',{p_limit:80})
 if(error)throw new Error('chat_push_claim_failed')
 const counts={sent:0,failed:0,removed:0,skipped:0}
 // Limit provider and database work; no unbounded Promise.all on a team-wide message.
 for(let i=0;i<(rows??[]).length;i+=8)await Promise.all(rows.slice(i,i+8).map(async(row:any)=>{
  let outcome='sent',err:string|null=null
  try{
   if(!allowedPushEndpoint(row.endpoint)){outcome='skipped';counts.skipped++}
   else {
    // A row may have been cancelled/read/reassigned since it was claimed.
    const {data:valid,error:checkError}=await db.rpc('chat_push_valid',{p_delivery:row.delivery_id,p_claim:row.claim_id})
    if(checkError)throw new Error('database_error')
    if(!valid){outcome='skipped';counts.skipped++}
    else {
    await sendNotification({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},JSON.stringify(chatNotification(row)),{TTL:86400,urgency:'high',timeout:5000})
    counts.sent++
    }
   }
  }catch(e:any){
   if(e?.statusCode===404||e?.statusCode===410){
    const {error:removeError}=await db.from('push_subscriptions').delete().eq('endpoint',row.endpoint)
    if(!removeError){counts.removed++;return}
   }
   outcome='retry';err=typeof e?.statusCode==='number'?`push_${e.statusCode}`:'push_unavailable';counts.failed++
  }
  const {error:finishError}=await db.rpc('finish_chat_push',{p_delivery:row.delivery_id,p_claim:row.claim_id,p_result:outcome,p_error:err})
  if(finishError)throw new Error('chat_push_ack_failed')
 }))
 return counts
}
