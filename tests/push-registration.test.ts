import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
function client(config:any={}){
 const state={permissionCalls:0,unsubscribed:0,bound:[] as any[],saved:0,badges:[] as number[]}
 const sub={endpoint:'https://web.push.apple.com/test',toJSON:()=>({endpoint:'https://web.push.apple.com/test',keys:{p256dh:'key',auth:'auth'}}),unsubscribe:async()=>{state.unsubscribed++;return true}}
 const reg={pushManager:{getSubscription:async()=>sub,subscribe:async()=>sub},getNotifications:async()=>[],active:{postMessage:(m:any,ports:any[])=>{state.bound.push(m.employeeId);ports[0].postMessage({ok:true})}}}
 const navigator={userAgent:config.ios?'iPhone':'Chrome',platform:'MacIntel',maxTouchPoints:config.ios?5:0,setAppBadge:async(n:number)=>{state.badges.push(n)},clearAppBadge:async()=>{state.badges.push(0)},serviceWorker:{getRegistration:async()=>reg,register:async()=>reg,ready:Promise.resolve(reg)}}
 const window={PushManager:{},Notification:{},matchMedia:()=>({matches:!!config.standalone}),addEventListener(){},dispatchEvent(){}}
 const Notification={permission:config.permission??'granted',requestPermission:async()=>{state.permissionCalls++;return config.permissionRequest ? await config.permissionRequest() : config.permission??'granted'}}
 const supabase={rpc:async(name:string)=>name==='my_chat_unread_count'&&config.badgeResult ? await config.badgeResult : ({data:{id:'me'},error:null}),from:()=>{
  const chain:any={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:config.linked===false?null:{endpoint:sub.endpoint},error:null}),single:async()=>({data:config.saveFails?null:{endpoint:sub.endpoint},error:config.saveFails?{code:'network'}:null}),upsert:()=>{state.saved++;return chain},delete:()=>({eq:async()=>({error:config.deleteFails?{}:null})})};return chain
 }}
 const source=fs.readFileSync(new URL('../src/lib/push.ts',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/^const VAPID = .*$/m,"const VAPID = 'BAAAA'")
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 const exports:any={};new Function('exports','supabase','navigator','window','Notification','MessageChannel','atob',js)(exports,supabase,navigator,window,Notification,MessageChannel,atob)
 return {api:exports,state}
}
test('iPhone browser requires Home Screen installation before permission is requested',async()=>{
 const h=client({ios:true});assert.equal(await h.api.pushState(),'needs-install');assert.equal(await h.api.enablePush('me'),'needs-install');assert.equal(h.state.permissionCalls,0)
})
test('browser permission alone is not a valid linked device; failed database registration never reports on',async()=>{
 const h=client({linked:false,saveFails:true});assert.equal(await h.api.pushState(),'off');await assert.rejects(h.api.enablePush('me'),/registration_failed/);assert.ok(h.state.bound.every(x=>x===null))
})
test('a successful registration binds the exact account after server confirmation',async()=>{
 const h=client();assert.equal(await h.api.enablePush('me'),'on');assert.equal(h.state.bound.at(-1),'me');assert.equal(h.state.saved,1)
})
test('logout clears push identity and unsubscribes even when server deletion fails',async()=>{
 const h=client({deleteFails:true});await assert.rejects(h.api.disablePush(),/disconnect_incomplete/);assert.equal(h.state.bound[0],null);assert.equal(h.state.unsubscribed,1)
})

test('a delayed permission decision cannot register push for an obsolete session',async()=>{
 let resolve:any; const pending=new Promise<string>(r=>{resolve=r}); const h=client({permissionRequest:()=>pending});
 h.api.syncPushAccount('same-employee:session-one'); const work=h.api.enablePush('me');
 h.api.syncPushAccount('same-employee:session-two'); resolve('granted');
 await assert.rejects(work,/account_changed/); assert.equal(h.state.saved,0); assert.ok(h.state.bound.every(x=>x===null));
})
test('a delayed unread badge cannot cross an account boundary',async()=>{
 let resolve:any; const pending=new Promise(r=>{resolve=r}); const h=client({badgeResult:pending});
 h.api.syncPushAccount('account-a'); const work=h.api.refreshChatBadge(); h.api.syncPushAccount('account-b');
 resolve({data:42,error:null}); await work; assert.ok(!h.state.badges.includes(42));
})
