import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { roles,validateTeam,nativeRole,inspectTeam,teamFingerprint,recordQualification } from '../.agents/skills/arti-sdd-protocol/scripts/team.mjs';
import { packageDigest } from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
import { readJson,repoInfo } from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
import { planSetup,applySetup } from '../.agents/skills/arti-sdd-protocol/scripts/setup.mjs';
import {config,repo,mapping} from './harness.mjs';
test('one named role source renders supported host schemas without imaginary permissions',t=>{
 const dir=repo(t),c=config();c.decisions.team='custom';const team=mapping();applySetup(planSetup(dir,c,{team}));
 for(const role of team.enabled_roles) {
  const codex=fs.readFileSync(path.join(dir,`.codex/agents/arti_${role}.toml`),'utf8');assert.match(codex,/^name = /);assert.match(codex,/^description = /m);assert.doesNotMatch(codex,/sandbox_mode|approval_policy/);
  const claude=fs.readFileSync(path.join(dir,`.claude/agents/arti_${role}.md`),'utf8');assert.doesNotMatch(claude,/MutatingBash|WeakeningTests|spawn_agent/);
 }
 assert.equal(inspectTeam(dir).status,'configured');assert.throws(()=>inspectTeam(dir,{requireLive:true}),/not live-qualified/);
 const before=teamFingerprint(dir,team,c.hosts);fs.appendFileSync(path.join(dir,'.agents/roles/scout.md'),'\nNew shared role instruction.\n');assert.notEqual(teamFingerprint(dir,team,c.hosts),before);assert.throws(()=>inspectTeam(dir),/drift/);
});
test('unresolved, wrong-lab, old tier and unsupported effort bindings fail rather than choosing defaults',()=>{
 const team=mapping();delete team.bindings.codex.reviewer;assert.throws(()=>validateTeam(team,['claude','codex']),/Unresolved/);
 const wrong=mapping();wrong.bindings.claude.scout.model='gpt-6.1-sol';assert.throws(()=>validateTeam(wrong,['claude']),/Wrong-lab/);
 for(const [host,patch] of [['codex',{model:'opus',effective_model:'claude-opus-5-5'}],['codex',{effective_model:'claude-opus-5-5'}],['claude',{effective_model:'gpt-6.1-sol'}]]){const wrong=mapping();Object.assign(wrong.bindings[host].scout,patch);assert.throws(()=>validateTeam(wrong,[host]),/Wrong-lab/);}
 const old=mapping();old.enabled_roles=['T0'];assert.throws(()=>validateTeam(old,['claude']),/Unknown role/);
 const effort=mapping();effort.bindings.codex.scout.effort='ultra-maximum';assert.throws(()=>validateTeam(effort,['codex']),/Unsupported effort/);
});
test('only complete matching role and repeated review evidence can qualify a configured team',t=>{
 const dir=repo(t),c=config();c.decisions.team='custom';const team=mapping();applySetup(planSetup(dir,c,{team}));
 const report={status:'passed',package_sha256:packageDigest(),team_fingerprint:teamFingerprint(dir,team,c.hosts),clients:{claude:'fixture 1',codex:'fixture 1'},native_runs:[],review_runs:[]};
 for(const host of ['claude','codex']) {
  for(const role of team.enabled_roles){const write=['implementer','escalation'].includes(role);report.native_runs.push({host,role,status:'passed',model:team.bindings[host][role].effective_model,effort:team.bindings[host][role].effort,effort_verified:host==='codex',effort_evidence:'fixture',parent_permissions:write?'workspace-write':'read-only',checks:['native-invocation','dispatch-plan','task-correlated','parent-binding-differs','resolved-model','role-task-cases','shared-memory',write?'assigned-source-only-and-protected-tests':'no-product-mutations']});}
  for(const fixture of ['security','quantity','clean'])for(let i=0;i<(fixture==='clean'?1:3);i++)report.review_runs.push({reviewer:host,author:host==='claude'?'codex':'claude',fixture,status:'passed',snapshot_sha256:`${host}-${fixture}-${i}`,findings:fixture==='clean'?0:1,model:team.bindings[host].reviewer.effective_model,effort:team.bindings[host].reviewer.effort,cli_version:'fixture 1'});
 }
 for(const mutate of [r=>r.package_sha256='stale',r=>r.team_fingerprint='wrong',r=>r.native_runs=[],r=>r.native_runs[0].effort='wrong',r=>r.native_runs[0].checks=r.native_runs[0].checks.filter(c=>c!=='dispatch-plan'),r=>r.review_runs=r.review_runs.filter(x=>x.fixture!=='clean'),r=>{for(const x of r.review_runs)x.snapshot_sha256='duplicate';}]){const bad=structuredClone(report);mutate(bad);assert.throws(()=>recordQualification(dir,bad,{versionOf:()=> 'fixture 1'}));assert.equal(inspectTeam(dir,{versionOf:()=> 'fixture 1'}).live_verified,false);}
 assert.equal(recordQualification(dir,report,{versionOf:()=> 'fixture 1'}).status,'qualified');
 assert.throws(()=>inspectTeam(dir,{requireLive:true,versionOf:()=> 'fixture 2'}),/not live-qualified/);
 const single=repo(t),one=config();one.hosts=['claude'];one.decisions.team='custom';one.decisions.review='required';applySetup(planSetup(single,one,{team}));const scoped=structuredClone(report);scoped.team_fingerprint=teamFingerprint(single,team,one.hosts);assert.equal(recordQualification(single,scoped,{versionOf:()=> 'fixture 1'}).status,'qualified');assert.equal(readJson(path.join(repoInfo(single).state,'qualification/bindings.json')).entries.codex.status,'passed');assert.equal(fs.existsSync(path.join(single,'.codex/agents')),false);
});
