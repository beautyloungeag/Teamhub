import test from 'node:test'
import assert from 'node:assert/strict'
import { assignedToEvent } from '../src/lib/event-access.ts'
const person={id:'me',app_role:'mitarbeiterin',branch_id:'a',extra:['b'],skills:['nails']}
const event={audienceBranches:[],audienceSkills:[],audiencePeople:[]}
test('registration requires every assignment criterion, independently of visibility',()=>{
 assert.equal(assignedToEvent(person,event),true)
 assert.equal(assignedToEvent(person,{...event,audienceBranches:['b'],audienceSkills:['nails'],audiencePeople:['me']}),true)
 for(const e of [{...event,audienceBranches:['c']},{...event,audienceSkills:['skin']},{...event,audiencePeople:['other']}]) assert.equal(assignedToEvent(person,e),false)
 assert.equal(assignedToEvent({...person,app_role:'buero'},{...event,audiencePeople:['other']}),true)
})
