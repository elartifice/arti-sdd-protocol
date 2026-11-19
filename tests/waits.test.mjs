import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {repo,config,seedTicket,commitPlanning} from './harness.mjs';
import {writeJson,git,repoInfo} from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
import {acquireClaim} from '../.agents/skills/arti-sdd-protocol/scripts/claim.mjs';
import {registerWait,deliverWait,stopWait,inspectWait} from '../.agents/skills/arti-sdd-protocol/scripts/waits.mjs';
function fixture(t){const dir=repo(t);writeJson(path.join(dir,'arti_sdd/config.json'),config());seedTicket(dir);commitPlanning(dir);acquireClaim(dir,'T001','owner');return dir;}
const probe=async ({repo,host,nativeSession})=>({verified:true,host,native_session:nativeSession,repo_root:repo});
function spec(){return {ticket:'T001',session:'owner',host:'codex',nativeSession:'native-session',nativeOptions:{sandbox:'workspace-write',config:[]},condition:{kind:'time',at:new Date(Date.now()+500).toISOString()},authorization:'Owner authorized bounded fixture work',task:'Perform the approved check',verification:['node','--version'],expiresAt:new Date(Date.now()+60000).toISOString()};}
test('bounded waits reject false delivery, cancel durably and execute at most once',async t=>{
 const dir=fixture(t),r=await registerWait(dir,spec(),probe);let calls=0;
 assert.equal((await deliverWait(dir,r.id,()=>{calls++;},{now:Date.parse(r.condition.at)-1})).status,'registered');assert.equal(calls,0);
 const resume=async record=>{calls++;return {host:'codex',native_session:record.native_session,executed:true,verified_work:true,proof_sha256:'proof'};};
 assert.equal((await deliverWait(dir,r.id,resume,{now:Date.now()+1000})).status,'resumed');await deliverWait(dir,r.id,resume,{now:Date.now()+1000});assert.equal(calls,1);
 const cancelled=await registerWait(dir,spec(),probe);stopWait(dir,cancelled.id,'owner');await deliverWait(dir,cancelled.id,resume,{now:Date.now()+1000});assert.equal(calls,1);assert.equal(inspectWait(dir,cancelled.id).status,'cancelled');
 const failed=await registerWait(dir,spec(),probe);assert.equal((await deliverWait(dir,failed.id,async()=>({executed:true}),{now:Date.now()+1000})).status,'delivery-unverified');
 await deliverWait(dir,failed.id,resume,{now:Date.now()+1000});assert.equal(calls,1);
});
test('changed candidate, ownership, target and expiration never authorize a wake',async t=>{
 const dir=fixture(t);await assert.rejects(registerWait(dir,spec(),async()=>({verified:true})),/target/);
 const r=await registerWait(dir,spec(),probe);fs.writeFileSync(path.join(dir,'README.md'),'changed');await assert.rejects(deliverWait(dir,r.id,()=>assert.fail('must not deliver'),{now:Date.now()+1000}),/candidate changed/);git(dir,'restore','README.md');
 const claimFile=path.join(repoInfo(dir).state,'claims/T001.json'),claim=JSON.parse(fs.readFileSync(claimFile));writeJson(claimFile,{...claim,nonce:'different'});await assert.rejects(deliverWait(dir,r.id,()=>assert.fail('must not deliver'),{now:Date.now()+1000}),/ownership/);writeJson(claimFile,claim);
 assert.equal((await deliverWait(dir,r.id,()=>assert.fail('expired'),{now:Date.now()+120000})).status,'expired');
});
test('continuation permissions are explicit, bounded and frozen during registration',async t=>{
 const dir=fixture(t);const base=spec();delete base.nativeOptions;await assert.rejects(registerWait(dir,base,probe),/owner-selected/);
 await assert.rejects(registerWait(dir,{...spec(),nativeOptions:{sandbox:'danger-full-access',config:[]}},probe),/bounded/);
 await assert.rejects(registerWait(dir,{...spec(),host:'claude',nativeOptions:{permission_mode:'bypassPermissions',tools:['Bash']}},probe),/Unsupported/);
 await assert.rejects(registerWait(dir,{...spec(),nativeOptions:{sandbox:'workspace-write',config:['sandbox_mode="danger-full-access"']}},probe),/bounded/);
});
test('duplicate registrations reuse one intent and conflicting registrations cannot start another monitor',async t=>{
 const dir=fixture(t),request=spec();let probes=0;const checked=async input=>{probes++;return probe(input);};const first=await registerWait(dir,request,checked),again=await registerWait(dir,request,checked);assert.equal(first.id,again.id);assert.equal(probes,1);await assert.rejects(registerWait(dir,{...request,task:'Different continuation'},checked),/Active wait/);stopWait(dir,first.id,'owner');assert.notEqual((await registerWait(dir,{...request,task:'Replacement explicitly selected'},checked)).id,first.id);
});
test('explicit owner approval expiry blocks claims and cannot be extended by a wait',async t=>{
 const dir=fixture(t),file=path.join(dir,'arti_sdd/tickets/T001.md');const expiry=new Date(Date.now()+30000).toISOString();fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('territory:',`approval_expires_at: "${expiry}"\nterritory:`));await assert.rejects(registerWait(dir,spec(),probe),/contract changed|outlive/);
 const {assertApproval}=await import('../.agents/skills/arti-sdd-protocol/scripts/scope.mjs');assert.throws(()=>assertApproval({approval_expires_at:expiry},Date.parse(expiry)),/approval expired/);assert.doesNotThrow(()=>assertApproval({approval_expires_at:expiry},Date.parse(expiry)-1));
});
test('failed delivery is a failing CLI result',async t=>{
 const {command}=await import('../.agents/skills/arti-sdd-protocol/scripts/lib.mjs');const dir=fixture(t),request=spec(),r=await registerWait(dir,request,probe);const failed=await deliverWait(dir,r.id,async()=>({executed:true}),{now:Date.parse(r.condition.at)+1});assert.equal(failed.status,'delivery-unverified');const cli=command(process.execPath,[path.resolve('extras/continuation/native.mjs'),'watch','--repo',dir,'--id',r.id,'--session','owner']);assert.equal(cli.code,1);assert.equal(JSON.parse(cli.stdout).status,'delivery-unverified');
});
test('an already landed matching goal completes the wait without starting another native turn',async t=>{
 const {verifyTicket,closeout}=await import('../.agents/skills/arti-sdd-protocol/scripts/workflow.mjs');const dir=repo(t);writeJson(path.join(dir,'arti_sdd/config.json'),config());seedTicket(dir);const file=path.join(dir,'arti_sdd/tickets/T001.md');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('territory:','checks: [["node","--version"]]\nterritory:').replace('- [ ]','- [x]'));commitPlanning(dir);acquireClaim(dir,'T001','owner');const r=await registerWait(dir,spec(),probe);verifyTicket(dir,'T001','main');closeout(dir,'T001',{merge:'HEAD',session:'owner'});const done=await deliverWait(dir,r.id,()=>assert.fail('completed goal must not wake'));assert.equal(done.status,'completed');
});
test('a copied wait record cannot redirect delivery into another repository',async t=>{
 const dir=fixture(t),other=repo(t),r=await registerWait(dir,spec(),probe),file=path.join(repoInfo(dir).state,'waits',r.id+'.json');writeJson(file,{...r,repo_root:other});await assert.rejects(deliverWait(dir,r.id,()=>assert.fail('foreign target must not execute'),{now:Date.parse(r.condition.at)+1}),/another repository/);
});
