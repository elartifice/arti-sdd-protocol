import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {repo,config,mapping,seedTicket} from './harness.mjs';
import {git,readJson} from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
import {planSetup,applySetup} from '../.agents/skills/arti-sdd-protocol/scripts/setup.mjs';
import {acquireClaim,releaseClaim} from '../.agents/skills/arti-sdd-protocol/scripts/claim.mjs';
import {checkPaths} from '../.agents/skills/arti-sdd-protocol/scripts/scope.mjs';
import {snapshot,runReview} from '../.agents/skills/arti-sdd-protocol/scripts/review.mjs';
import {verifyTicket} from '../.agents/skills/arti-sdd-protocol/scripts/workflow.mjs';
function fixture(t){const dir=repo(t),c=config();c.decisions.team='custom';c.decisions.review='risk';c.decisions.review_risks=['security'];applySetup(planSetup(dir,c,{team:mapping()}));seedTicket(dir);const file=path.join(dir,'arti_sdd/tickets/T001.md');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('territory:','risks: ["security"]\nchecks: [["node","-e","process.exit(0)"]]\nterritory:'));fs.mkdirSync(path.join(dir,'src'));fs.writeFileSync(path.join(dir,'src/a.js'),'a');git(dir,'add','.');git(dir,'commit','-qm','approved');git(dir,'branch','base');git(dir,'switch','-qc','t/T001-contract');return {dir,file};}
test('editing an owned ticket cannot silently widen its frozen territory',t=>{
 const {dir,file}=fixture(t);acquireClaim(dir,'T001','owner');const original=fs.readFileSync(file,'utf8');fs.writeFileSync(file,original.replace('["src/**"]','["**"]'));
 assert.deepEqual(checkPaths(dir,'T001',['arti_sdd/tickets/T001.md']),['arti_sdd/tickets/T001.md']);assert.throws(()=>checkPaths(dir,'T001',['README.md']),/contract changed/);fs.writeFileSync(file,original);assert.deepEqual(checkPaths(dir,'T001',['src/a.js']),['src/a.js']);
});
test('candidate ticket edits cannot weaken approved checks or remove required review risks',async t=>{
 const a=fixture(t);fs.writeFileSync(a.file,fs.readFileSync(a.file,'utf8').replace('[["node","-e","process.exit(0)"]]','[["true"]]'));git(a.dir,'add','.');git(a.dir,'commit','-qm','weaken checks');assert.throws(()=>verifyTicket(a.dir,'T001','base'),/contract changed/);
 const b=fixture(t);fs.writeFileSync(b.file,fs.readFileSync(b.file,'utf8').replace('risks: ["security"]','risks: []'));git(b.dir,'add','.');git(b.dir,'commit','-qm','remove risk');await assert.rejects(runReview({repo:b.dir,ticket:'T001',author:'claude',base:'base'}),/contract changed/);
});
test('changing the candidate review policy cannot turn a required gate into disabled',t=>{
 const {dir}=fixture(t),file=path.join(dir,'arti_sdd/config.json'),c=readJson(file);c.decisions.review='disabled';fs.writeFileSync(file,JSON.stringify(c));git(dir,'add','.');git(dir,'commit','-qm','disable review');assert.throws(()=>snapshot(dir,'T001','base'),/Approved setup decisions changed/);
});
test('DoD evidence may change while the approved execution contract remains fixed',t=>{
 const {dir,file}=fixture(t);acquireClaim(dir,'T001','owner');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('- [ ] Behavior passes','- [x] Behavior passes: actual evidence'));git(dir,'add','.');git(dir,'commit','-qm','evidence');assert.match(snapshot(dir,'T001','base').ticket.text,/actual evidence/);
});
test('an unsatisfiable required reviewer setup is refused before writing files',t=>{
 const dir=repo(t),c=config();c.decisions.review='required';assert.throws(()=>planSetup(dir,c),/reviewer mapping/);assert.equal(fs.existsSync(path.join(dir,'AGENTS.md')),false);
 c.decisions.team='custom';const team=mapping();delete team.bindings.codex.reviewer;assert.throws(()=>planSetup(dir,c,{team}),/Unresolved/);assert.equal(fs.existsSync(path.join(dir,'AGENTS.md')),false);
});
test('claiming or reclaiming a weakened working contract cannot approve it',t=>{
 for(const before of [true,false]){const {dir,file}=fixture(t);if(!before){acquireClaim(dir,'T001','owner');releaseClaim(dir,'T001','owner');}fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('risks: ["security"]','risks: []').replace('["src/**"]','["**"]'));git(dir,'add','.');git(dir,'commit','-qm','weaken candidate');assert.throws(()=>acquireClaim(dir,'T001','owner'),/approved integration planning/);assert.throws(()=>snapshot(dir,'T001','HEAD'),/approved integration revision/);}
 const {dir}=fixture(t),file=path.join(dir,'arti_sdd/config.json'),c=readJson(file);c.decisions.review='disabled';fs.writeFileSync(file,JSON.stringify(c));assert.throws(()=>acquireClaim(dir,'T001','owner'),/Setup decisions differ/);
});
