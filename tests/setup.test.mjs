import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { planSetup, applySetup,checkSetup,recoverSetup } from '../.agents/skills/arti-sdd-protocol/scripts/setup.mjs';
import { spawnSync } from 'node:child_process';
import { packageRoot } from './harness.mjs';
import { config,repo,mapping } from './harness.mjs';
import { git } from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
import { codexConfig } from '../.agents/skills/arti-sdd-protocol/scripts/hooks.mjs';
import { temp } from './harness.mjs';
import { acquireClaim } from '../.agents/skills/arti-sdd-protocol/scripts/claim.mjs';
test('linked CLI entry points execute setup and the installed Claude skill checker',t=>{
 const dir=repo(t),shared=path.join(temp(t),'shared-skill');fs.symlinkSync(packageRoot,shared,'dir');
 const input=path.join(temp(t),'config.json');fs.writeFileSync(input,JSON.stringify(config()));
 const applied=spawnSync(process.execPath,[path.join(shared,'scripts/setup.mjs'),'apply','--repo',dir,'--config',input],{encoding:'utf8'});assert.equal(applied.status,0,applied.stderr);assert.equal(JSON.parse(applied.stdout).status,'applied');assert.equal(checkSetup(dir).status,'configured');
 const checked=spawnSync(process.execPath,[path.join(dir,'.claude/skills/arti-sdd-protocol/scripts/setup.mjs'),'check','--repo',dir],{encoding:'utf8'});assert.equal(checked.status,0,checked.stderr);assert.equal(JSON.parse(checked.stdout).status,'configured');
 const imported=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(new URL('../.agents/skills/arti-sdd-protocol/scripts/setup.mjs',import.meta.url).href)})`,'not-a-file'],{encoding:'utf8'});assert.equal(imported.status,0,imported.stderr);assert.equal(imported.stdout,'');
});
test('shared install preserves owner rules and skills and is idempotent',t=>{
 const dir=repo(t);fs.writeFileSync(path.join(dir,'AGENTS.md'),'# Owner\nKeep project rule.\n');
 fs.writeFileSync(path.join(dir,'CLAUDE.md'),'# Claude owner\nKeep this too.\n');
 fs.mkdirSync(path.join(dir,'.claude/skills/user-owned'),{recursive:true});fs.writeFileSync(path.join(dir,'.claude/skills/user-owned/SKILL.md'),'owned');
 const plan=planSetup(dir,config()),installed=applySetup(plan);assert.ok(installed.codex_launch.argv.includes(path.join(dir,'.agents/memory')));assert.ok(installed.codex_launch.argv.includes(path.join(dir,'.git/arti-sdd')));
 assert.match(fs.readFileSync(path.join(dir,'AGENTS.md'),'utf8'),/Keep project rule/);
 assert.match(fs.readFileSync(path.join(dir,'CLAUDE.md'),'utf8'),/^@AGENTS.md/);
 assert.match(fs.readFileSync(path.join(dir,'CLAUDE.md'),'utf8'),/Keep this too/);
 assert.equal(fs.readFileSync(path.join(dir,'.claude/skills/user-owned/SKILL.md'),'utf8'),'owned');
 assert.equal(fs.realpathSync(path.join(dir,'.claude/skills/arti-start')),fs.realpathSync(path.join(dir,'.agents/skills/arti-start')));
 assert.equal(fs.realpathSync(path.join(dir,'.claude/skills/arti-sdd-protocol')),fs.realpathSync(path.join(dir,'.agents/skills/arti-sdd-protocol')));
 assert.equal(applySetup(planSetup(dir,config())).changed.length,0);
 assert.equal(checkSetup(dir).status,'configured');
 assert.equal(checkSetup(dir).live_verified,false);
});
test('an unborn new repository can install before its first approved planning commit',t=>{
 const dir=temp(t);git(dir,'init','-qb','main');git(dir,'config','user.name','Fixture');git(dir,'config','user.email','fixture@example.invalid');git(dir,'config','commit.gpgsign','false');git(dir,'config','core.hooksPath','/dev/null');applySetup(planSetup(dir,config()));assert.equal(checkSetup(dir).status,'configured');assert.throws(()=>acquireClaim(dir,'T001','owner'),/git rev-parse failed/);git(dir,'add','.');git(dir,'commit','-qm','approved setup');assert.equal(acquireClaim(dir,'T001','owner').status,'active');
});
test('recovery refuses a different worktree and restores original BOM and CRLF bytes',t=>{
 const dir=repo(t),original=Buffer.from('\uFEFF# Owner\r\nKeep bytes.\r\n');fs.writeFileSync(path.join(dir,'AGENTS.md'),original);git(dir,'add','AGENTS.md');git(dir,'commit','-qm','owner');
 const wt=path.join(repo(t),'other');git(dir,'worktree','add','-b','other',wt);
 const code=`import {planSetup,applySetup} from ${JSON.stringify(new URL('../.agents/skills/arti-sdd-protocol/scripts/setup.mjs',import.meta.url).href)};applySetup(planSetup(${JSON.stringify(dir)},${JSON.stringify(config())}),{onWrite:()=>process.kill(process.pid,'SIGKILL')});`;
 assert.equal(spawnSync(process.execPath,['--input-type=module','-e',code]).signal,'SIGKILL');
 assert.throws(()=>recoverSetup(wt),/another worktree/);assert.deepEqual(fs.readFileSync(path.join(wt,'AGENTS.md')),original);
 assert.equal(recoverSetup(dir).recovered,true);assert.deepEqual(fs.readFileSync(path.join(dir,'AGENTS.md')),original);
});
test('an installer validates a stale preview only after holding its lock',t=>{
 const dir=repo(t),plan=planSetup(dir,config());
 const code=`import fs from 'node:fs';import {planSetup,applySetup} from ${JSON.stringify(new URL('../.agents/skills/arti-sdd-protocol/scripts/setup.mjs',import.meta.url).href)};fs.writeFileSync(${JSON.stringify(path.join(dir,'AGENTS.md'))},'Concurrent owner rule\\n');applySetup(planSetup(${JSON.stringify(dir)},${JSON.stringify(config())}));`;
 assert.throws(()=>applySetup(plan,{beforeLock:()=>{const r=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}}),/stale/);
 assert.match(fs.readFileSync(path.join(dir,'AGENTS.md'),'utf8'),/Concurrent owner rule/);assert.equal(checkSetup(dir).status,'configured');
});
test('disabled native roles are removed without deleting shared sources or owner agents',t=>{
 const dir=repo(t),c=config();c.decisions.team='custom';const team=mapping();applySetup(planSetup(dir,c,{team}));
 fs.writeFileSync(path.join(dir,'.claude/agents/owner.md'),'Owner agent');team.enabled_roles=team.enabled_roles.filter(r=>r!=='scout');applySetup(planSetup(dir,c,{team}));
 for(const file of ['.claude/agents/arti_scout.md','.codex/agents/arti_scout.toml'])assert.equal(fs.existsSync(path.join(dir,file)),false);
 assert.equal(fs.readFileSync(path.join(dir,'.claude/agents/owner.md'),'utf8'),'Owner agent');assert.ok(fs.existsSync(path.join(dir,'.agents/roles/scout.md')));assert.equal(checkSetup(dir).status,'configured');assert.equal(applySetup(planSetup(dir,c,{team})).changed.length,0);
});
test('slugged T001 and commented native tables retain valid singular sources and owner data',t=>{
 const dir=repo(t);fs.mkdirSync(path.join(dir,'arti_sdd/tickets'),{recursive:true});fs.writeFileSync(path.join(dir,'arti_sdd/tickets/T001-existing.md'),'Existing owner ticket');applySetup(planSetup(dir,config()));assert.equal(fs.existsSync(path.join(dir,'arti_sdd/tickets/T001.md')),false);
 const before='[features] # owner table\nhooks = true\n# codex_hooks = false\n[agents] # concurrency\n# preserve $& $$ and $\' literally\nmax_concurrent_threads_per_session = 2\n';const after=codexConfig(before,3);
 assert.equal(after.match(/\[features\]/g).length,1);assert.equal(after.match(/\[agents\]/g).length,1);assert.ok(after.includes("# preserve $& $$ and $' literally"));assert.match(after,/session = 3/);assert.equal(codexConfig(after,3),after);
 assert.match(fs.readFileSync(path.join(dir,'.agents/skills/arti-start/SKILL.md'),'utf8'),/description: Read AGENTS\.md,/);
});
test('unsupported inline native tables are refused before any owner files change',t=>{
 const dir=repo(t);fs.mkdirSync(path.join(dir,'.codex'));const file=path.join(dir,'.codex/config.toml'),before='features = { hooks = true }\n';fs.writeFileSync(file,before);assert.throws(()=>planSetup(dir,config()),/Inline\/dotted/);assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(fs.existsSync(path.join(dir,'AGENTS.md')),false);
});
test('a real killed installer recovers its journal without losing owner text',t=>{
 const dir=repo(t);fs.writeFileSync(path.join(dir,'AGENTS.md'),'Original owner rule\n');
 const code=`import {planSetup,applySetup} from ${JSON.stringify(new URL('../.agents/skills/arti-sdd-protocol/scripts/setup.mjs',import.meta.url).href)};applySetup(planSetup(${JSON.stringify(dir)},${JSON.stringify(config())}),{onWrite:()=>process.kill(process.pid,'SIGKILL')});`;
 const killed=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});assert.equal(killed.signal,'SIGKILL');
 assert.equal(recoverSetup(dir).recovered,true);assert.equal(fs.readFileSync(path.join(dir,'AGENTS.md'),'utf8'),'Original owner rule\n');
 applySetup(planSetup(dir,config()));assert.equal(checkSetup(dir).status,'configured');
});
test('existing directories, escaping links, malformed markers and conflicting decisions are never overwritten',t=>{
 const dir=repo(t);fs.mkdirSync(path.join(dir,'.claude/skills/arti-start'),{recursive:true});
 assert.throws(()=>planSetup(dir,config()),/Expected a file/);
 fs.rmSync(path.join(dir,'.claude'),{recursive:true});
 fs.writeFileSync(path.join(dir,'AGENTS.md'),'<!-- arti-sdd:start -->');
 assert.throws(()=>planSetup(dir,config()),/markers/);
 fs.writeFileSync(path.join(dir,'AGENTS.md'),'owner');
 fs.symlinkSync('/tmp',path.join(dir,'.agents'));
 assert.throws(()=>planSetup(dir,config()),/escapes/);
 fs.unlinkSync(path.join(dir,'.agents'));applySetup(planSetup(dir,config()));
 const other=config();other.decisions.merge='auto';assert.throws(()=>planSetup(dir,other),/decisions differ/);
});
test('interrupted setup rolls back changed content and a retry succeeds without duplicate blocks',t=>{
 const dir=repo(t);fs.writeFileSync(path.join(dir,'AGENTS.md'),'original owner text\n');
 assert.throws(()=>applySetup(planSetup(dir,config()),{failAfter:3}),/interrupted/);
 assert.equal(fs.readFileSync(path.join(dir,'AGENTS.md'),'utf8'),'original owner text\n');
 applySetup(planSetup(dir,config()));
 assert.equal(fs.readFileSync(path.join(dir,'AGENTS.md'),'utf8').split('<!-- arti-sdd:start -->').length,2);
});
test('managed edits and stale previews block upgrades while owner-only text remains editable',t=>{
 const dir=repo(t);applySetup(planSetup(dir,config()));
 fs.appendFileSync(path.join(dir,'AGENTS.md'),'\nNew owner rule\n');
 assert.equal(checkSetup(dir).status,'configured');
 const plan=planSetup(dir,config());fs.writeFileSync(path.join(dir,'.agents/skills/arti-start/SKILL.md'),'user edit');
 assert.throws(()=>checkSetup(dir),/drift/);
 assert.throws(()=>planSetup(dir,config()),/Managed content changed/);
 const second=repo(t),p=planSetup(second,config());fs.writeFileSync(path.join(second,'AGENTS.md'),'new owner text');
 assert.throws(()=>applySetup(p),/stale/);
});
test('an existing whole skills link retains one physical source',t=>{
 const dir=repo(t);fs.mkdirSync(path.join(dir,'.agents/skills'),{recursive:true});fs.mkdirSync(path.join(dir,'.claude'));
 fs.symlinkSync('../.agents/skills',path.join(dir,'.claude/skills'));
 applySetup(planSetup(dir,config()));
 fs.appendFileSync(path.join(dir,'.agents/memory/INDEX.md'),'\nLesson: retry only an idempotent operation.\n');
 assert.equal(fs.readlinkSync(path.join(dir,'.claude/skills')),'../.agents/skills');
 assert.equal(fs.realpathSync(path.join(dir,'.claude/skills/arti-start')),path.join(dir,'.agents/skills/arti-start'));
 assert.match(fs.readFileSync(path.join(dir,'.agents/memory/INDEX.md'),'utf8'),/idempotent/);
 assert.equal(applySetup(planSetup(dir,config())).changed.length,0);
});
test('explicit edits to the canonical decision source are validated and re-rendered without erasing rationale',t=>{
 const dir=repo(t);applySetup(planSetup(dir,config()));
 const c=JSON.parse(fs.readFileSync(path.join(dir,'arti_sdd/config.json')));c.decisions.merge='auto';c.notes={merge:'Owner chose automatic merging after checks'};
 fs.writeFileSync(path.join(dir,'arti_sdd/config.json'),JSON.stringify(c,null,2)+'\n');
 assert.throws(()=>checkSetup(dir),/drift/);applySetup(planSetup(dir,c));assert.equal(checkSetup(dir).status,'configured');
 assert.match(fs.readFileSync(path.join(dir,'AGENTS.md'),'utf8'),/Merge policy: auto/);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'arti_sdd/config.json'))).notes.merge,c.notes.merge);
});
