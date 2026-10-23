import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
function worker(employeeId:string|null){
 const handlers:any={},shown:any[]=[],badges:any[]=[],opened:any[]=[],posted:any[]=[]
 const self:any={location:{origin:'https://app.example.invalid'},addEventListener:(k:string,fn:any)=>handlers[k]=fn,registration:{showNotification:async(...args:any[])=>{shown.push(args)}},clients:{matchAll:async()=>[],openWindow:async(url:string)=>opened.push(url)}}
 const cache={match:async()=>({json:async()=>({employeeId})}),put:async()=>{}}
 vm.runInNewContext(fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self,caches:{open:async()=>cache},navigator:{setAppBadge:async(n:number)=>badges.push(n),clearAppBadge:async()=>badges.push(0)},URL,Response})
 const push=async(payload:any)=>{let pending:any;handlers.push({data:{json:()=>payload},waitUntil:(p:any)=>pending=p});await pending}
 const click=async(url:string)=>{let pending:any;handlers.notificationclick({notification:{close(){},data:{url}},waitUntil:(p:any)=>pending=p});await pending}
 return {push,click,self,shown,badges,opened,posted}
}
test('an owned push displays and badges even when no page is open',async()=>{
 const h=worker('me');await h.push({employeeId:'me',title:'Studio',body:'Hello',url:'/?open=chat:room',badgeCount:3})
 assert.equal(h.shown[0][0],'Studio');assert.equal(h.shown[0][1].body,'Hello');assert.equal(h.badges[0],3)
 await h.click('/?open=chat:room');assert.equal(h.opened[0],'https://app.example.invalid/?open=chat:room')
})
test('delayed pushes after logout or account change show a generic visible notification',async()=>{
 for(const employee of [null,'other']){const h=worker(employee);await h.push({employeeId:'me',title:'Secret',body:'Private body',url:'/?open=chat:private',badgeCount:9});assert.equal(h.shown[0][0],'TeamHub');assert.equal(h.shown[0][1].data.url,'https://app.example.invalid/');assert.equal(h.badges.length,0)}
})
test('notification clicks focus a warm app with a deep link and reject external URLs',async()=>{
 const h=worker('me');h.self.clients.matchAll=async()=>[{url:'https://app.example.invalid/',focus:async()=>{},postMessage:(m:any)=>h.posted.push(m)}]
 await h.click('/?open=chat:room');assert.equal(h.posted[0].url,'https://app.example.invalid/?open=chat:room')
 h.self.clients.matchAll=async()=>[];await h.click('https://attacker.invalid/');assert.equal(h.opened[0],'https://app.example.invalid/')
})
