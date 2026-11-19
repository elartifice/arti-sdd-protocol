import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {repo,seedTicket,commitPlanning} from './harness.mjs';
import {acquireClaim} from '../.agents/skills/arti-sdd-protocol/scripts/claim.mjs';
import {nameTicket} from '../.agents/skills/arti-sdd-protocol/scripts/naming.mjs';
test('naming binds the actual native chat, verifies metadata readback, and cannot mark unfinished work complete',async t=>{
 const dir=repo(t);seedTicket(dir);const file=path.join(dir,'arti_sdd/tickets/T001.md');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('title:', 'milestone: "M1"\ntitle:'));commitPlanning(dir);acquireClaim(dir,'T001','owner');
 const calls=[];let title='';const rpc=async(_repo,method,params)=>{calls.push(method);if(method==='thread/name/set'){title=params.name;return {};}return {thread:{id:'native',cwd:dir,name:title}};};
 const opts={host:'codex',nativeSession:'native',event:'claim',env:{CODEX_THREAD_ID:'native',ARTI_SESSION_ID:'owner'},rpc};
 assert.equal((await nameTicket(dir,'T001',opts)).status,'verified');assert.deepEqual(calls,['thread/read','thread/name/set','thread/read']);
 assert.ok(!title.startsWith('✅'));await assert.rejects(nameTicket(dir,'T001',{...opts,event:'land'}));
 await assert.rejects(nameTicket(dir,'T001',{...opts,nativeSession:'foreign'}),/identity/);
 const failed=await nameTicket(dir,'T001',{...opts,rpc:async()=>{throw Error('API unavailable');}});assert.equal(failed.status,'failed');assert.equal(failed.manual_user_task,false);
});
