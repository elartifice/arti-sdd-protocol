import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {repo,config,seedTicket} from './harness.mjs';
import {git} from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
import {planSetup,applySetup} from '../.agents/skills/arti-sdd-protocol/scripts/setup.mjs';
import {verifyTicket} from '../.agents/skills/arti-sdd-protocol/scripts/workflow.mjs';
import {snapshot,checkCandidate} from '../.agents/skills/arti-sdd-protocol/scripts/review.mjs';

test('actual checks run on oversized candidates while model review still refuses incomplete coverage',t=>{
 const dir=repo(t);applySetup(planSetup(dir,config()));seedTicket(dir);
 const f=path.join(dir,'arti_sdd/tickets/T001.md');
 fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('territory:',`checks: [["node","-e","require('node:assert/strict').equal(require('node:fs').statSync('src/data.txt').size,500000)"]]\nterritory:`));
 fs.mkdirSync(path.join(dir,'src'));fs.writeFileSync(path.join(dir,'src/data.txt'),'old');git(dir,'add','.');git(dir,'commit','-qm','approved checks');git(dir,'branch','base');git(dir,'switch','-qc','t/T001-large');
 fs.writeFileSync(path.join(dir,'src/data.txt'),'x'.repeat(500000));git(dir,'add','src/data.txt');git(dir,'commit','-qm','large candidate');
 assert.throws(()=>snapshot(dir,'T001','base'),/complete-diff limit/);
 const candidate=checkCandidate(dir,'T001','base');assert.equal(candidate.coverage.complete,false);
 const receipt=verifyTicket(dir,'T001','base');assert.equal(receipt.status,'passed');assert.equal(receipt.results[0].exit,0);
 assert.throws(()=>snapshot(dir,'T001','base'),/complete-diff limit/);
 fs.writeFileSync(path.join(dir,'unexpected.txt'),'dirty');assert.throws(()=>checkCandidate(dir,'T001','base'),/dirty/);
});
