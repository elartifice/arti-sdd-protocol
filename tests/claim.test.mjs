import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn,spawnSync } from 'node:child_process';
import { git,command,repoInfo,readJson } from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
import { acquireClaim,releaseClaim,landingLock } from '../.agents/skills/arti-sdd-protocol/scripts/claim.mjs';
import { repo,temp,packageRoot,seedTicket,commitPlanning } from './harness.mjs';
test('another session cannot take, release or refresh a live claim/lock',t=>{
 const dir=repo(t);seedTicket(dir);commitPlanning(dir);acquireClaim(dir,'T001','one');
 assert.throws(()=>acquireClaim(dir,'T001','two'),/another session/);
 assert.throws(()=>releaseClaim(dir,'T001','two'),/another session/);
 landingLock(dir,'acquire','T001','one');
 for(const a of ['acquire','release','refresh','check'])assert.throws(()=>landingLock(dir,a,'T001','two'),/another session/);
 landingLock(dir,'release','T001','one');releaseClaim(dir,'T001','one');
 assert.equal(acquireClaim(dir,'T001','two').session,'two');
});
test('simultaneous non-overlapping claims both succeed after bounded coordination',async t=>{
 const dir=repo(t);seedTicket(dir);seedTicket(dir,'T002',['other/**']);commitPlanning(dir);
 const invoke=(id,s)=>new Promise(resolve=>{const p=spawn(process.execPath,[path.join(packageRoot,'scripts/claim.mjs'),'claim','--repo',dir,'--ticket',id,'--session',s],{stdio:'ignore'});p.on('close',resolve);});
 assert.deepEqual(await Promise.all([invoke('T001','one'),invoke('T002','two')]),[0,0]);
});
test('overlap uses frozen peer scope even when its working ticket is temporarily weakened',t=>{
 const dir=repo(t);seedTicket(dir);seedTicket(dir,'T002',['src/**']);commitPlanning(dir);acquireClaim(dir,'T001','one');const file=path.join(dir,'arti_sdd/tickets/T001.md');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('["src/**"]','["docs/**"]'));assert.throws(()=>acquireClaim(dir,'T002','two'),/overlaps/);
});
test('reusing an existing owned lease needs no writes to protected runtime state',t=>{
 const dir=repo(t);seedTicket(dir);commitPlanning(dir);const first=acquireClaim(dir,'T001','owner'),state=repoInfo(dir).state;fs.chmodSync(state,0o500);try{assert.deepEqual(acquireClaim(dir,'T001','owner'),first);assert.throws(()=>acquireClaim(dir,'T001','another'),/another session/);}finally{fs.chmodSync(state,0o700);}
});
test('a killed remote acquisition retains intent and release recovers its mutex and remote ref',t=>{
 const dir=repo(t);seedTicket(dir);git(dir,'add','arti_sdd');git(dir,'commit','-qm','ticket');const remote=path.join(temp(t),'origin.git');git(dir,'init','--bare','-q',remote);git(dir,'remote','add','origin',remote);
 const code=`import {acquireClaim} from ${JSON.stringify(new URL('../.agents/skills/arti-sdd-protocol/scripts/claim.mjs',import.meta.url).href)};acquireClaim(${JSON.stringify(dir)},'T001','owner',{remote:'origin',onPhase:p=>{if(p==='remote-created')process.kill(process.pid,'SIGKILL');}});`;
 assert.equal(spawnSync(process.execPath,['--input-type=module','-e',code]).signal,'SIGKILL');const pending=readJson(path.join(repoInfo(dir).state,'claims/T001.json'));assert.equal(pending.status,'pending');assert.ok(pending.remote.oid);
 assert.equal(command('git',['ls-remote','--exit-code','origin','refs/heads/arti-claims/T001'],{cwd:dir}).code,0);releaseClaim(dir,'T001','owner');assert.equal(command('git',['ls-remote','--exit-code','origin','refs/heads/arti-claims/T001'],{cwd:dir}).code,2);assert.equal(acquireClaim(dir,'T001','new-owner').status,'active');
});
test('two real processes racing for a local claim yield exactly one owner',async t=>{
 const dir=repo(t);seedTicket(dir);commitPlanning(dir);
 const invoke=s=>new Promise(resolve=>{const p=spawn(process.execPath,[path.join(packageRoot,'scripts/claim.mjs'),'claim','--repo',dir,'--ticket','T001','--session',s],{stdio:'ignore'});p.on('close',resolve);});
 const results=await Promise.all([invoke('one'),invoke('two')]);assert.equal(results.filter(x=>x===0).length,1);
});
test('remote compare-and-create rejects the second clone even from an identical starting commit',t=>{
 const dir=repo(t);seedTicket(dir);git(dir,'add','arti_sdd');git(dir,'commit','-qm','ticket');
 const area=temp(t),remote=path.join(area,'origin.git'),a=path.join(area,'a'),b=path.join(area,'b');
 git(area,'init','--bare','-q','--initial-branch=main',remote);git(dir,'remote','add','origin',remote);git(dir,'push','-q','origin','main');git(area,'clone','-q',remote,a);git(area,'clone','-q',remote,b);
 for(const p of [a,b]){git(p,'config','user.name','Fixture');git(p,'config','user.email','fixture@example.invalid');git(p,'config','commit.gpgsign','false');}
 const first=acquireClaim(a,'T001','one',{remote:'origin'});assert.ok(first.remote.oid);
 assert.throws(()=>acquireClaim(b,'T001','two',{remote:'origin'}),/compare-and-create/);
 releaseClaim(a,'T001','one');assert.equal(acquireClaim(b,'T001','two',{remote:'origin'}).session,'two');
});
