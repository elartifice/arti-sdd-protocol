import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { repo,config } from './harness.mjs';
import { planSetup,applySetup } from '../.agents/skills/arti-sdd-protocol/scripts/setup.mjs';
import { git,command } from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
test('a real fresh clone runs committed helpers and safely upgrades owner rules',t=>{
 const source=repo(t),destination=path.join(repo(t),'fresh-clone');applySetup(planSetup(source,config()));git(source,'add','.');git(source,'commit','-qm','protocol installed');git(source,'clone','--no-hardlinks','-q',source,destination);
 const script=name=>path.join(destination,`.agents/skills/arti-sdd-protocol/scripts/${name}.mjs`);
 let r=command('node',[script('check'),'--repo',destination]);assert.equal(r.code,0,r.stderr);assert.equal(JSON.parse(r.stdout).status,'configured');
 assert.equal(fs.existsSync(path.join(destination,'.git/arti-sdd')),false,'Runtime state must not be cloned');
 fs.appendFileSync(path.join(destination,'AGENTS.md'),'\nFresh owner decision: preserve this line.\n');
 r=command('node',[script('setup'),'apply','--repo',destination,'--config',path.join(destination,'arti_sdd/config.json')]);assert.equal(r.code,0,r.stderr);
 const rules=fs.readFileSync(path.join(destination,'AGENTS.md'),'utf8');assert.match(rules,/Fresh owner decision/);assert.equal(rules.split('<!-- arti-sdd:start -->').length,2);
 assert.equal(fs.realpathSync(path.join(destination,'.claude/skills/arti-start')),fs.realpathSync(path.join(destination,'.agents/skills/arti-start')));
 r=command('/bin/sh',['-c',JSON.parse(fs.readFileSync(path.join(destination,'.codex/hooks.json'))).hooks.PreToolUse[0].hooks[0].command],{cwd:destination,input:JSON.stringify({cwd:destination,session_id:'fresh',tool_name:'Write',tool_input:{path:'README.md'}})});
 assert.equal(r.code,0,r.stderr);assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision,'deny');
});
