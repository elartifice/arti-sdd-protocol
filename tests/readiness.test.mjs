import test from 'node:test';
import assert from 'node:assert/strict';
import {repo,seedTicket,commitPlanning} from './harness.mjs';
import {acquireClaim} from '../.agents/skills/arti-sdd-protocol/scripts/claim.mjs';
import {status} from '../.agents/skills/arti-sdd-protocol/scripts/workflow.mjs';
test('readiness distinguishes prerequisite readiness and live territory availability without globally serializing tickets',t=>{
 const dir=repo(t);seedTicket(dir,'T001',['src/**']);seedTicket(dir,'T002',['src/**']);seedTicket(dir,'T003',['docs/**']);commitPlanning(dir);
 acquireClaim(dir,'T001','one');let list=status(dir);const blocked=list.find(t=>t.id==='T002');assert.equal(blocked.dependency_ready,true);assert.equal(blocked.claim_available,false);assert.equal(blocked.blockers[0].kind,'territory');
 assert.equal(list.find(t=>t.id==='T003').claim_available,true);acquireClaim(dir,'T003','two');list=status(dir);assert.equal(list.filter(t=>t.status==='claimed').length,2);
});
