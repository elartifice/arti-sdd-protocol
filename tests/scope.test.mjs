import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { git,sessionId } from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
import { checkPaths,extractPatch,matchGlob,activeTicket,loadTicket } from '../.agents/skills/arti-sdd-protocol/scripts/scope.mjs';
import { acquireClaim } from '../.agents/skills/arti-sdd-protocol/scripts/claim.mjs';
import { repo,seedTicket,temp,commitPlanning } from './harness.mjs';
test('literal scope rejects traversal, odd paths and symlink escapes while checking moves',t=>{
 const dir=repo(t);seedTicket(dir);fs.mkdirSync(path.join(dir,'src'));fs.writeFileSync(path.join(dir,'src/a.txt'),'allowed');
 assert.deepEqual(checkPaths(dir,'T001',['src/a.txt']),['src/a.txt']);
 for(const p of ['src/../README.md','src//a.txt','src\\a.txt',' src/a.txt','src/a.txt ','README.md'])assert.throws(()=>checkPaths(dir,'T001',[p]));
 fs.symlinkSync('../README.md',path.join(dir,'src/alias'));assert.throws(()=>checkPaths(dir,'T001',['src/alias']),/OUTSIDE/);
 const paths=extractPatch('*** Begin Patch\n*** Update File: src/a.txt\n*** Move to: README.md\n*** End Patch');
 assert.throws(()=>checkPaths(dir,'T001',paths),/OUTSIDE/);
 assert.throws(()=>extractPatch('*** Begin Patch\n*** Add File:    \n*** End Patch'),/LITERAL/);
 assert.ok(matchGlob('.agents/skills/arti-start/SKILL.md','.agents/skills/arti-*/**'));
 const outside=path.join(temp(t),'missing-target');fs.symlinkSync(outside,path.join(dir,'src/dangling'));
 assert.throws(()=>checkPaths(dir,'T001',['src/dangling']),/Dangling symlink/);assert.equal(fs.existsSync(outside),false);
 fs.symlinkSync(path.join(temp(t),'missing-dir'),path.join(dir,'src/dangling-dir'));assert.throws(()=>checkPaths(dir,'T001',['src/dangling-dir/new.txt']),/Dangling symlink/);
 fs.mkdirSync(path.join(dir,'src/[slug]'));fs.writeFileSync(path.join(dir,'src/[slug]/route.js'),'literal dynamic route');assert.deepEqual(checkPaths(dir,'T001',['src/[slug]/route.js']),['src/[slug]/route.js']);
 for(const p of ['src/*.txt','src/?.txt'])assert.throws(()=>checkPaths(dir,'T001',[p]),/NOT_LITERAL/);
});
test('a ticket branch cannot substitute for its live session ownership',t=>{
 const dir=repo(t);seedTicket(dir);commitPlanning(dir);git(dir,'switch','-qc','t/T001-test');assert.equal(activeTicket(dir,'owner'),null);
 acquireClaim(dir,'T001','owner');assert.equal(activeTicket(dir,'owner'),'T001');assert.throws(()=>activeTicket(dir,'intruder'),/another session/);
});
test('identity is stable and ambiguity blocks instead of using a mutable title',()=>{
 assert.throws(()=>sessionId(null,{CLAUDE_CODE_SESSION_ID:'a',CODEX_SESSION_ID:'b'}),/ambiguous/);
 assert.equal(sessionId('explicit',{CLAUDE_CODE_SESSION_ID:'a',CODEX_SESSION_ID:'b'}),'explicit');
 assert.throws(()=>sessionId(null,{}),/Missing/);
});
test('worktree-local ticket scope wins and another ticket worktree is protected',t=>{
 const dir=repo(t);seedTicket(dir);git(dir,'add','arti_sdd');git(dir,'commit','-qm','ticket');
 const wt=path.join(path.dirname(dir),path.basename(dir)+'-wt');t.after(()=>fs.rmSync(wt,{recursive:true,force:true}));git(dir,'worktree','add','-b','t/T001-fixture',wt);
 seedTicket(wt,'T001',['docs/**']);fs.mkdirSync(path.join(wt,'docs'));
 assert.deepEqual(checkPaths(dir,'T001',[path.join(wt,'docs/new.md')]),['docs/new.md']);
 assert.throws(()=>checkPaths(dir,'T002',[path.join(wt,'docs/new.md')]),/belongs to T001/);
 assert.throws(()=>checkPaths(dir,'T001',[path.join(wt,'src/a.txt')]),/OUTSIDE/);
 acquireClaim(dir,'T001','session');assert.equal(activeTicket(wt,'session'),'T001');
});
test('a prunable missing worktree does not break scope checks in a live checkout',t=>{
 const dir=repo(t);seedTicket(dir);git(dir,'add','.');git(dir,'commit','-qm','ticket');const gone=path.join(temp(t),'gone');git(dir,'worktree','add','-b','gone',gone);fs.rmSync(gone,{recursive:true});fs.mkdirSync(path.join(dir,'src'));assert.deepEqual(checkPaths(dir,'T001',['src/new.js']),['src/new.js']);
});
test('a copied ticket cannot claim a different ID through its filename',t=>{
 const dir=repo(t);seedTicket(dir,'T002');const file=path.join(dir,'arti_sdd/tickets/T002.md');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('id: "T002"','id: "T001"'));assert.throws(()=>loadTicket(dir,'T002'),/header ID/);
});
