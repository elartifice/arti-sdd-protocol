import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateHook,hookCommand } from '../.agents/skills/arti-sdd-protocol/scripts/hooks.mjs';
import { planSetup,applySetup,checkSetup } from '../.agents/skills/arti-sdd-protocol/scripts/setup.mjs';
import { acquireClaim,landingLock } from '../.agents/skills/arti-sdd-protocol/scripts/claim.mjs';
import { command,git,repoInfo } from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
import { repo,config,seedTicket,temp,commitPlanning } from './harness.mjs';
test('host-compatible guard allows assigned writes and denies missing claim, bad paths and shell patches',t=>{
 const dir=repo(t);seedTicket(dir);const input={cwd:dir,session_id:'one',tool_name:'Write',tool_input:{file_path:'src/allowed.js'}};
 assert.equal(evaluateHook('pre',input).hookSpecificOutput.permissionDecision,'deny');
 commitPlanning(dir);acquireClaim(dir,'T001','one');assert.deepEqual(evaluateHook('pre',input),{});
 assert.equal(evaluateHook('pre',{...input,tool_input:{file_path:'README.md'}}).hookSpecificOutput.permissionDecision,'deny');
 assert.equal(evaluateHook('pre',{...input,tool_name:'apply_patch',tool_input:{command:'*** Begin Patch\n*** Add File: README.md\n*** End Patch'}}).hookSpecificOutput.permissionDecision,'deny');
 assert.equal(evaluateHook('pre',{...input,tool_name:'Bash',tool_input:{command:"apply_patch <<'PATCH'\n*** Begin Patch\n*** Add File: README.md\n*** End Patch\nPATCH"}}).hookSpecificOutput.permissionDecision,'deny');
 assert.deepEqual(evaluateHook('pre',{...input,tool_name:'Bash',tool_input:{command:'cat deploy.mjs'}}),{});
 fs.writeFileSync(path.join(dir,'arti_sdd/tickets/T001.md'),'broken');
 assert.equal(evaluateHook('pre',input).hookSpecificOutput.permissionDecision,'deny');
 assert.deepEqual(evaluateHook('pre',{...input,tool_input:{file_path:'arti_sdd/tickets/T001.md'}}),{});
});
test('native hook launcher records actual allow and deny calls without recording file content',t=>{
 const dir=repo(t);applySetup(planSetup(dir,config()));seedTicket(dir);commitPlanning(dir);acquireClaim(dir,'T001','owner');const audit=path.join(repoInfo(dir).state,'proof.jsonl'),env={ARTI_SESSION_ID:'owner',ARTI_HOOK_AUDIT_FILE:audit};
 for(const name of ['src/allowed.js','forbidden.js']){const r=command('/bin/sh',['-c',hookCommand('pre')],{cwd:dir,env,input:JSON.stringify({cwd:dir,session_id:'native-child',tool_name:'Write',tool_input:{file_path:name,content:'synthetic-private-content'}})});assert.equal(r.code,0,r.stderr);}
 const text=fs.readFileSync(audit,'utf8'),rows=text.trim().split('\n').map(JSON.parse);assert.equal(rows[0].decision,'allow');assert.equal(rows[1].decision,'deny');assert.match(rows[1].reason,/OUTSIDE_TERRITORY forbidden.js/);assert.equal(text.includes('synthetic-private-content'),false);
});
test('notebook writes obey ticket scope and native plan scratch has only a narrow exception',t=>{
 const dir=repo(t);seedTicket(dir);commitPlanning(dir);acquireClaim(dir,'T001','owner');const input={cwd:dir,session_id:'owner',tool_name:'NotebookEdit',tool_input:{notebook_path:'src/example.ipynb'}};
 assert.deepEqual(evaluateHook('pre',input,{}),{});assert.equal(evaluateHook('pre',{...input,tool_input:{notebook_path:'other.ipynb'}},{}).hookSpecificOutput.permissionDecision,'deny');
 const host=temp(t),plans=path.join(host,'plans');fs.mkdirSync(plans);const plan={cwd:dir,session_id:'owner',permission_mode:'plan',tool_name:'Write',tool_input:{file_path:path.join(plans,'native.md')}};
 assert.deepEqual(evaluateHook('pre',plan,{CLAUDE_CONFIG_DIR:host}),{});assert.equal(evaluateHook('pre',{...plan,permission_mode:'acceptEdits'},{CLAUDE_CONFIG_DIR:host}).hookSpecificOutput.permissionDecision,'deny');assert.equal(evaluateHook('pre',{...plan,tool_input:{file_path:path.join(host,'outside.md')}},{CLAUDE_CONFIG_DIR:host}).hookSpecificOutput.permissionDecision,'deny');
 fs.symlinkSync(path.join(host,'outside.md'),path.join(plans,'linked.md'));assert.equal(evaluateHook('pre',{...plan,tool_input:{file_path:path.join(plans,'linked.md')}},{CLAUDE_CONFIG_DIR:host}).hookSpecificOutput.permissionDecision,'deny');
 const cache=path.join(host,'projects',dir.replace(/[^A-Za-z0-9]/g,'-'),'memory');fs.mkdirSync(cache,{recursive:true});assert.deepEqual(evaluateHook('pre',{...plan,permission_mode:'acceptEdits',tool_input:{file_path:path.join(cache,'host-notes.md')}},{CLAUDE_CONFIG_DIR:host}),{});
});
test('malformed and unidentified Stop calls fail closed when landing state cannot be checked',t=>{
 const dir=repo(t);applySetup(planSetup(dir,config()));landingLock(dir,'acquire','T001','owner');
 for(const input of ['{','{}']){const r=command('/bin/sh',['-c',hookCommand('stop')],{cwd:dir,input});assert.equal(r.code,0);assert.equal(JSON.parse(r.stdout).decision,'block');}
});
test('native child identity uses explicit coordinator scope but cannot inherit another owner from a branch',t=>{
 const dir=repo(t);seedTicket(dir);commitPlanning(dir);git(dir,'switch','-qc','t/T001-test');const input={cwd:dir,session_id:'native-child',tool_name:'Write',tool_input:{path:'src/new.js'}};
 assert.match(evaluateHook('pre',input,{}).hookSpecificOutput.permissionDecisionReason,/NO_TICKET_CLAIMED/);
 acquireClaim(dir,'T001','coordinator');assert.match(evaluateHook('pre',input,{}).hookSpecificOutput.permissionDecisionReason,/another session/);
 assert.deepEqual(evaluateHook('pre',input,{ARTI_SESSION_ID:'coordinator'}),{});
});
test('startup lifecycle retains task and shared knowledge and headless runs skip only orientation',t=>{
 const dir=repo(t);applySetup(planSetup(dir,config()));fs.appendFileSync(path.join(dir,'.agents/memory/INDEX.md'),'\nUse idempotency key amber-42.\n');
 for(const source of ['startup','resume','compact','clear','unknown']) {
  const output=evaluateHook('start',{cwd:dir,source,session_id:'one'},{});assert.match(output.hookSpecificOutput.additionalContext,/amber-42/);assert.match(output.hookSpecificOutput.additionalContext,/preserve the task and prior approvals/);
 }
 assert.deepEqual(evaluateHook('start',{cwd:dir},{ARTI_HEADLESS_REVIEW:'1'}),{});
 assert.equal(evaluateHook('pre',{cwd:dir,session_id:'one',tool_name:'Write',tool_input:{path:'README.md'}},{ARTI_HEADLESS_REVIEW:'1'}).hookSpecificOutput.permissionDecision,'deny');
 landingLock(dir,'acquire','T001','one');assert.equal(evaluateHook('stop',{cwd:dir,session_id:'one'}).decision,'block');
 assert.deepEqual(evaluateHook('stop',{cwd:dir,session_id:'one',stop_hook_active:true}),{});
});
test('committed hook launcher works from a nested folder and denies when its module is missing',t=>{
 const dir=repo(t);applySetup(planSetup(dir,config()));fs.mkdirSync(path.join(dir,'src'));
 const input=JSON.stringify({cwd:dir,session_id:'one',tool_name:'Write',tool_input:{path:'README.md'}});
 let result=command('/bin/sh',['-c',hookCommand('pre')],{cwd:path.join(dir,'src'),input});assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,'deny');
 fs.unlinkSync(path.join(dir,'.agents/skills/arti-sdd-protocol/scripts/hooks.mjs'));
 result=command('/bin/sh',['-c',hookCommand('pre')],{cwd:dir,input});assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,'deny');
});
test('hook verification checks event and matcher while preserving unrelated hooks on reapply',t=>{
 const dir=repo(t);fs.mkdirSync(path.join(dir,'.claude'));fs.writeFileSync(path.join(dir,'.claude/settings.json'),JSON.stringify({hooks:{Stop:[{hooks:[{type:'command',command:'echo owner'}]}]}}));
 applySetup(planSetup(dir,config()));const file=path.join(dir,'.claude/settings.json'),obj=JSON.parse(fs.readFileSync(file));
 obj.hooks.Stop.push({hooks:[{type:'command',command:'echo another-owner'}]});fs.writeFileSync(file,JSON.stringify(obj));
 assert.equal(checkSetup(dir).status,'configured');applySetup(planSetup(dir,config()));assert.match(fs.readFileSync(file,'utf8'),/another-owner/);
 const broken=JSON.parse(fs.readFileSync(file));broken.hooks.PreToolUse[0].matcher='Read';fs.writeFileSync(file,JSON.stringify(broken));assert.throws(()=>checkSetup(dir),/drift/);assert.throws(()=>planSetup(dir,config()),/changed/);
});
