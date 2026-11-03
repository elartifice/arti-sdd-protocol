import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { git,writeJson,repoInfo } from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
import { planSetup,applySetup } from '../.agents/skills/arti-sdd-protocol/scripts/setup.mjs';
import { lintTickets,verifyTicket,closeout,reopen,status } from '../.agents/skills/arti-sdd-protocol/scripts/workflow.mjs';
import { repo,config,seedTicket,mapping } from './harness.mjs';
import { acquireClaim,releaseClaim,landingLock } from '../.agents/skills/arti-sdd-protocol/scripts/claim.mjs';
import { runReview } from '../.agents/skills/arti-sdd-protocol/scripts/review.mjs';
import {spawnSync} from 'node:child_process';
test('unavailable optional modules are refused before any installation changes',t=>{
 const dir=repo(t);for(const [key,value]of [['qa','recorded'],['board','visual']]){const c=config();c.decisions[key]=value;assert.throws(()=>planSetup(dir,c),/optional module/);assert.equal(fs.existsSync(path.join(dir,'AGENTS.md')),false);}
 const c=config({deferred:{recorder:'later',backup:'later'}});applySetup(planSetup(dir,c));assert.equal(fs.existsSync(path.join(dir,'qa_artifacts')),false);assert.equal(fs.existsSync(path.join(dir,'cases/golden-prompts.md')),false);
});
test('dependency lint rejects missing prerequisites and real cycles',t=>{
 const dir=repo(t);seedTicket(dir);seedTicket(dir,'T002',['other/**']);const f=path.join(dir,'arti_sdd/tickets/T001.md');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('depends_on: []','depends_on: ["T999"]'));assert.throws(()=>lintTickets(dir),/Missing dependency/);
 fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('T999','T002'));const g=path.join(dir,'arti_sdd/tickets/T002.md');fs.writeFileSync(g,fs.readFileSync(g,'utf8').replace('depends_on: []','depends_on: ["T001"]'));assert.throws(()=>lintTickets(dir),/cycle/);
});
test('manual landing cannot close before merge; verified close-out is idempotent and reopening ignores old completion',t=>{
 const dir=repo(t);applySetup(planSetup(dir,config()));seedTicket(dir,'T001',['src/**']);seedTicket(dir,'T002',['other/**']);const next=path.join(dir,'arti_sdd/tickets/T002.md');fs.writeFileSync(next,fs.readFileSync(next,'utf8').replace('depends_on: []','depends_on: ["T001"]'));const ticket=path.join(dir,'arti_sdd/tickets/T001.md');fs.writeFileSync(ticket,fs.readFileSync(ticket,'utf8').replace('territory:','checks: [["node", "--test", "src/app.test.cjs"]]\nterritory:').replace('- [ ] Behavior passes','- [x] Behavior passes — checked by node --test src/app.test.cjs'));
 fs.mkdirSync(path.join(dir,'src'));fs.writeFileSync(path.join(dir,'src/app.cjs'),'exports.value=1;\n');fs.writeFileSync(path.join(dir,'src/app.test.cjs'),"require('node:assert/strict').equal(require('./app.cjs').value,2);\n");git(dir,'add','.');git(dir,'commit','-qm','setup');git(dir,'branch','base');git(dir,'switch','-qc','t/T001-change');fs.writeFileSync(path.join(dir,'src/app.cjs'),'exports.value=2;\n');git(dir,'add','src/app.cjs');git(dir,'commit','-qm','candidate');
 verifyTicket(dir,'T001','base');assert.throws(()=>closeout(dir,'T001',{}),/Merge confirmation/);assert.throws(()=>closeout(dir,'T001',{merge:'HEAD'}),/not present/);assert.throws(()=>closeout(dir,'T001',{merge:'HEAD',defaultBranch:'t/T001-change'}),/configured Git integration/);
 acquireClaim(dir,'T001','owner');landingLock(dir,'acquire','T001','owner');const head=git(dir,'rev-parse','HEAD');git(dir,'branch','-f','main',head);const closed=closeout(dir,'T001',{merge:head,session:'owner',onCleanup:()=>{const race=spawnSync(process.execPath,[path.resolve('.agents/skills/arti-sdd-protocol/scripts/claim.mjs'),'claim','--repo',dir,'--ticket','T001','--session','racer'],{encoding:'utf8'});assert.notEqual(race.status,0);assert.match(race.stderr,/cleanup is pending/);assert.throws(()=>acquireClaim(dir,'T002','next'),/not done/);}});assert.equal(closed.status,'done');assert.equal(closed.lock,'released');assert.equal(closed.claim,'released');assert.equal(closeout(dir,'T001',{merge:head}).status,'done');assert.equal(status(dir)[0].status,'done');
 assert.throws(()=>acquireClaim(dir,'T001','new'),/Reopen/);assert.equal(acquireClaim(dir,'T002','next').status,'active');releaseClaim(dir,'T002','next');
 reopen(dir,'T001');assert.equal(status(dir)[0].status,'open');
});
test('a pre-revert merge cannot close a new generation that has not landed',t=>{
 const dir=repo(t);applySetup(planSetup(dir,config()));seedTicket(dir);const file=path.join(dir,'arti_sdd/tickets/T001.md');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('territory:','checks: [["node","--test","src/a.test.cjs"]]\nterritory:').replace('- [ ] Behavior passes','- [x] Behavior passes'));
 fs.mkdirSync(path.join(dir,'src'));fs.writeFileSync(path.join(dir,'src/a.cjs'),"exports.value='A';\n");fs.writeFileSync(path.join(dir,'src/a.test.cjs'),"require('node:assert/strict').equal(require('./a.cjs').value,'B');\n");git(dir,'add','.');git(dir,'commit','-qm','approved');git(dir,'switch','-qc','t/T001-first');fs.writeFileSync(path.join(dir,'src/a.cjs'),"exports.value='B';\n");git(dir,'add','.');git(dir,'commit','-qm','first');const original=git(dir,'rev-parse','HEAD');git(dir,'branch','-f','main',original);git(dir,'switch','main');fs.writeFileSync(path.join(dir,'src/a.cjs'),"exports.value='A';\n");reopen(dir,'T001');git(dir,'add','.');git(dir,'commit','-qm','revert and approve generation 2');git(dir,'switch','-qc','t/T001-second');fs.writeFileSync(path.join(dir,'src/a.cjs'),"exports.value='B';\n");git(dir,'add','.');git(dir,'commit','-qm','second');verifyTicket(dir,'T001','main');assert.throws(()=>closeout(dir,'T001',{merge:original}),/predates|another ticket generation/);assert.equal(fs.existsSync(path.join(repoInfo(dir).state,'closeout/T001.json')),false);
});
test('risk-required closeout refuses another ticket exemption and advancing main does not widen scope',async t=>{
 const dir=repo(t),c=config();c.decisions.team='custom';c.decisions.review='risk';c.decisions.review_risks=['security'];applySetup(planSetup(dir,c,{team:mapping()}));seedTicket(dir);seedTicket(dir,'T002',['other/**']);const file=path.join(dir,'arti_sdd/tickets/T001.md');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('territory:','risks: ["security"]\nchecks: [["node", "-e", "process.exit(0)"]]\nterritory:').replace('- [ ] Behavior passes','- [x] Behavior passes'));
 fs.mkdirSync(path.join(dir,'src'));fs.writeFileSync(path.join(dir,'src/app.js'),'a');git(dir,'add','.');git(dir,'commit','-qm','base');git(dir,'branch','base');git(dir,'switch','-qc','t/T001-change');fs.writeFileSync(path.join(dir,'src/app.js'),'b');git(dir,'add','src');git(dir,'commit','-qm','candidate');
 const main=path.join(repo(t),'main');git(dir,'worktree','add',main,'main');fs.writeFileSync(path.join(main,'README.md'),'Unrelated advancing main');git(main,'add','README.md');git(main,'commit','-qm','unrelated');assert.equal(verifyTicket(dir,'T001','main').status,'passed');
 const exempt=await runReview({repo:dir,ticket:'T002',author:'claude',base:'base'});assert.equal(exempt.status,'not-required');const head=git(dir,'rev-parse','HEAD');git(main,'merge','--no-edit',head);const merged=git(main,'rev-parse','HEAD');
 assert.throws(()=>closeout(dir,'T001',{merge:merged,review:exempt}),/Required review receipt/);
});
