import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execute,runModel,parseClaude } from '../.agents/skills/arti-sdd-protocol/scripts/transports.mjs';
import { git,command,readJson,writeJson,digest,packageDigest,repoInfo,skillRoot,version } from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
import { planSetup,applySetup,checkSetup } from '../.agents/skills/arti-sdd-protocol/scripts/setup.mjs';
import { codexRpc,inspectCodexHooks } from '../.agents/skills/arti-sdd-protocol/scripts/check.mjs';
import { teamFingerprint,roles,validateTeam,recordQualification } from '../.agents/skills/arti-sdd-protocol/scripts/team.mjs';
import { planDispatch,verifyDispatch } from '../.agents/skills/arti-sdd-protocol/scripts/dispatch.mjs';
import { runReview,bindingFingerprint } from '../.agents/skills/arti-sdd-protocol/scripts/review.mjs';
import { parseCharter,loadConfig } from '../.agents/skills/arti-sdd-protocol/scripts/schema.mjs';
import {verifyTicket,closeout} from '../.agents/skills/arti-sdd-protocol/scripts/workflow.mjs';
import {nameTicket} from '../.agents/skills/arti-sdd-protocol/scripts/naming.mjs';
import {registerWait,inspectWait} from '../.agents/skills/arti-sdd-protocol/scripts/waits.mjs';
import {probeNative} from '../extras/continuation/native.mjs';
import {boardItems} from '../extras/github/board.mjs';
import { acquireClaim } from '../.agents/skills/arti-sdd-protocol/scripts/claim.mjs';
import { claudeChildText,nativeObject,scoutSourceReads,nativeTestRun,nativeCommandOutput } from './native-proof.mjs';
import { config,seedTicket,mapping } from '../tests/harness.mjs';

const phaseIndex=process.argv.indexOf('--phase');
const root=path.resolve('.'),phase=phaseIndex<0?'all':process.argv[phaseIndex+1];
const targetIndex=process.argv.indexOf('--target'),target=targetIndex<0?null:path.resolve(process.argv[targetIndex+1]);let targetRoles={};
assert.ok(['all','native','review','guard','scout','researcher','lifecycle','correction','board'].includes(phase),'Unknown qualification phase');
const runId=new Date().toISOString().replace(/[:.]/g,'-'),out=path.join(root,'.local-evidence/qualification',runId);
fs.mkdirSync(out,{recursive:true,mode:0o700});
const harnessDigest=()=>digest(['dev/qualify.mjs','dev/native-proof.mjs','tests/harness.mjs','extras/continuation/native.mjs','extras/github/board.mjs'].map(p=>[p,digest(fs.readFileSync(path.join(root,p)))]));
const sourceHash=packageDigest(),harnessHash=harnessDigest(),report={schema_version:1,kind:target?'project':'release',status:'running',version,package_sha256:sourceHash,harness_sha256:harnessHash,platform:process.platform,created_at:new Date().toISOString(),native_runs:[],review_runs:[],review_retries:[],hook_runs:[],handoffs:[],chat_runs:[],dispatch_runs:[],resume_runs:[],routing_guard_runs:[],continuation_runs:[],naming_runs:[],lifecycle_runs:[],correction_runs:[],parallel_runs:[],board_runs:[]};
const save=()=>writeJson(path.join(out,'report.json'),report,0o600);
const log=(name,result)=>{fs.writeFileSync(path.join(out,`${name}.stdout`),result.stdout||'');fs.writeFileSync(path.join(out,`${name}.stderr`),result.stderr||'');};
const jsonFinal=text=>{const fence=text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);return JSON.parse(fence?fence[1]:text.trim());};
function fixture(team,{review='required'}={}) {
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arti-qualification-')));git(dir,'init','-qb','main');git(dir,'config','user.name','Fixture Author');git(dir,'config','user.email','fixture@example.invalid');git(dir,'config','commit.gpgsign','false');git(dir,'config','core.hooksPath','/dev/null');fs.writeFileSync(path.join(dir,'README.md'),'Qualification fixture\n');git(dir,'add','.');git(dir,'commit','-qm','seed');
 for(const [role,text] of Object.entries(targetRoles)){fs.mkdirSync(path.join(dir,'.agents/roles'),{recursive:true});fs.writeFileSync(path.join(dir,`.agents/roles/${role}.md`),text);}
 const c=config();c.decisions.team='custom';c.decisions.review=team.enabled_roles.includes('reviewer')?review:'disabled';applySetup(planSetup(dir,c,{team}));seedTicket(dir);fs.mkdirSync(path.join(dir,'src'));const lesson=`amber-${crypto.randomBytes(5).toString('hex')}`;fs.appendFileSync(path.join(dir,'.agents/memory/INDEX.md'),`\nShared lesson: use idempotency key ${lesson}. Source: fixture owner, ${new Date().toISOString().slice(0,10)}.\n`);return {dir,c,lesson};
}
function commitFixture(f){git(f.dir,'add','.');git(f.dir,'commit','-qm','installed fixture');git(f.dir,'branch','base');git(f.dir,'switch','-qc','t/T001-qualification');}
function versions(){return Object.fromEntries(['claude','codex'].map(host=>[host,command(host,['--version']).stdout.trim()]));}
async function candidateMapping() {
 const team=mapping(),aliases={};
 if(['all','native','researcher'].includes(phase))team.enabled_roles.push('researcher');
 for(const alias of ['haiku','sonnet','opus']) {
  const r=await execute('claude',['-p','Return only {"ok":true}. No tools.','--model',alias,'--effort','low','--output-format','stream-json','--verbose','--no-session-persistence','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}'],{cwd:root,timeout:120000});log(`access-${alias}`,r);aliases[alias]=parseClaude(r).model;
 }
 for(const role of team.enabled_roles) {
  const alias=role==='scout'?'haiku':['implementer','researcher'].includes(role)?'sonnet':'opus';team.bindings.claude[role]={model:alias,effective_model:aliases[alias],effort:role==='scout'?'low':'high'};
  const model=role==='scout'?'gpt-6-luna':['implementer','researcher'].includes(role)?'gpt-6.1-terra':role==='escalation'?'gpt-6-astra':'gpt-6.1-sol';team.bindings.codex[role]={model,effective_model:model,effort:'high'};
 }
 writeJson(path.join(out,'candidate-team.json'),team,0o600);return team;
}
async function trustedFlags(dir) {
 const project=`projects={ ${JSON.stringify(dir)} = { trust_level = "trusted" } }`,listed=await codexRpc(dir,'hooks/list',{cwds:[dir]},{config:[project]});
 const data=listed.data.find(d=>d.cwd===dir);assert.equal(data.errors.length,0);
 const selected=data.hooks.filter(h=>h.source==='project'&&h.command?.includes('ARTI_SDD_HOOK_VERSION=1'));assert.equal(selected.length,3);
 const states='{ '+selected.map(h=>`${JSON.stringify(h.key)} = { trusted_hash = ${JSON.stringify(h.currentHash)} }`).join(', ')+' }';
 const configFlags=[project,`hooks.state=${states}`],inspection=await inspectCodexHooks(dir,{config:configFlags});assert.equal(inspection.status,'trusted');
 return configFlags.flatMap(x=>['-c',x]);
}
async function native(host,role,f,prompt,{write=false,assignedFiles=write?['src/logic.cjs']:[]}={}) {
 if(write)acquireClaim(f.dir,'T001',f.session??=crypto.randomUUID());
 const name=`${host}-${role}-${report.native_runs.length}`,b=report.team.bindings[host][role],parentModel=host==='claude'?(b.effective_model.startsWith('claude-sonnet-')?'opus':'sonnet'):(b.effective_model==='gpt-6.1-sol'?'gpt-6-astra':'gpt-6.1-sol'),parentEffort=b.effort==='high'?'medium':'high';let argv,result,proof,final,knowledgeEvidence='',scoutEvidence;
 assert.notEqual(parentModel,b.model);assert.notEqual(parentEffort,b.effort);
 const route=planDispatch(f.dir,{host,role,surface:host==='claude'?'claude-agent':'codex-agent',task:prompt+(prompt.includes('src/logic.test.cjs')?'\nPermission contract: the only authorised Bash test command is exactly node --test src/logic.test.cjs with no shell suffix, echo, compound command, cd or redirection. The tool provides the exit status.':'')+'\n\nResponse contract: return only one JSON object containing the requested fields and dispatch_id from this dossier. No STATUS prefix, Markdown fences or trailing notes.',assignedFiles});
 writeJson(path.join(out,`${name}.plan.json`),route,0o600);
 const authorPrompt=`Execute this production dispatch plan using its exact tool and arguments. The role, model and effort were resolved from the project's canonical team. Do not substitute a generic worker, override values, paraphrase the task or do the child work yourself. Return the child's structured result unchanged. If it cannot run report BLOCKED. ${prompt.includes('src/logic.test.cjs')?'For tests use exactly node --test src/logic.test.cjs without shell suffixes.':''}\n${JSON.stringify(route.invocation)}`;
 if(host==='claude') {
  argv=['-p',authorPrompt,'--model',parentModel,'--effort',parentEffort,'--output-format','stream-json','--verbose','--no-session-persistence','--permission-mode',write?'acceptEdits':'default','--tools',write?'Read,Glob,Grep,Edit,Write,Bash,Agent':'Read,Glob,Grep,Agent','--strict-mcp-config','--mcp-config','{"mcpServers":{}}'];
  if(!write&&role!=='researcher')argv.push('--allowedTools','Agent,Read,Glob,Grep');
  if(role==='researcher')argv.push('--tools','Read,Glob,Grep,Agent,WebSearch,WebFetch','--allowedTools','Agent,WebSearch,WebFetch');
  if(write)argv.push('--allowedTools','Bash(node --test src/logic.test.cjs)');
  result=await execute('claude',argv,{cwd:f.dir,timeout:240000,env:f.session?{ARTI_SESSION_ID:f.session}:{}});log(name,result);const parsed=parseClaude(result,{allowSubagents:true}),calls=parsed.events.filter(e=>e.type==='assistant').flatMap(e=>e.message?.content||[]).filter(x=>x.type==='tool_use'&&x.name==='Agent');
  assert.ok(parsed.events.find(e=>e.type==='system'&&e.subtype==='init')?.slash_commands?.includes('arti-sdd-protocol'),'Claude did not discover the canonical protocol skill');
  assert.ok(calls.some(x=>x.input?.subagent_type===`arti_${role}`),`No native Claude Agent invocation for ${role}`);
  assert.ok(!calls.some(x=>x.input?.subagent_type!==`arti_${role}`),'Unexpected substitute agent');
  const end=parsed.events.filter(e=>e.type==='result').at(-1);assert.ok(Object.keys(end.modelUsage||{}).includes(b.effective_model),`No native model usage for ${b.effective_model}`);
  const call=calls.find(x=>x.input?.subagent_type===`arti_${role}`),childMessages=parsed.events.filter(e=>e.type==='assistant'&&e.parent_tool_use_id===call.id);
  assert.ok(childMessages.length>0&&childMessages.every(e=>e.message?.model===b.effective_model),'Missing or mixed actual child model evidence');assert.equal(end.modelUsage[b.effective_model].provider,'firstParty');
  final=claudeChildText(parsed.events,call.id);scoutEvidence={events:parsed.events,callId:call.id};
  knowledgeEvidence=final;
  assert.notEqual(parsed.model,b.effective_model,'Parent model must differ from child');
  const routed=await verifyDispatch(route,parsed.events);assert.equal(routed.task_correlated,true);writeJson(path.join(out,`${name}.dispatch.json`),routed,0o600);
  proof={source:'native-Agent-tool-child-message-and-modelUsage',model:b.effective_model,effort:b.effort,effort_verified:false,effort_evidence:'requested native-role-setting; effective effort not exposed by client',agent:`arti_${role}`};
 } else {
  argv=['-a','never','exec','--strict-config','--json','--sandbox',write?'workspace-write':'read-only','-m',parentModel,'-c',`model_reasoning_effort=${JSON.stringify(parentEffort)}`,...await trustedFlags(f.dir),authorPrompt];
  if(role==='researcher')argv.splice(5,0,'-c','web_search=live');
  if(write&&prompt.includes('.agents/memory/'))argv.splice(5,0,'--add-dir',path.join(f.dir,'.agents/memory'));
  result=await execute('codex',argv,{cwd:f.dir,timeout:300000,env:f.session?{ARTI_SESSION_ID:f.session}:{}});log(name,result);assert.equal(result.code,0,`Native Codex ${role} process failed`);
  const events=result.stdout.trim().split('\n').filter(Boolean).map(JSON.parse),thread=events.find(x=>x.type==='thread.started')?.thread_id;assert.ok(thread,'No native Codex thread');
  const loaded=await codexRpc(f.dir,'thread/read',{threadId:thread,includeTurns:true});writeJson(path.join(out,`${name}.thread.json`),loaded,0o600);
  assert.notEqual(loaded.thread.model,b.effective_model,'Parent model must differ from child');assert.notEqual(loaded.thread.reasoningEffort,b.effort,'Parent effort must differ from child');
  const activities=loaded.thread.turns.flatMap(t=>t.items).filter(x=>x.type==='subAgentActivity'&&x.kind==='started');
  assert.equal(activities.length,1,'Expected exactly one native Codex role invocation');const activity=activities[0];
  assert.equal(activity.model,b.effective_model);assert.equal(activity.reasoningEffort,b.effort);
  const child=await codexRpc(f.dir,'thread/read',{threadId:activity.agentThreadId,includeTurns:true});writeJson(path.join(out,`${name}.child.json`),child,0o600);
  assert.equal(child.thread.agentRole,`arti_${role}`,'Native Codex profile differs; display labels are not role identity');assert.equal(child.thread.parentThreadId,thread);assert.equal(child.thread.model,b.effective_model);assert.equal(child.thread.reasoningEffort,b.effort);assert.equal(child.thread.modelProvider,'openai');knowledgeEvidence=JSON.stringify(child.thread);scoutEvidence=child;
  const routed=await verifyDispatch(route,{threadId:child.thread.id});assert.equal(routed.task_correlated,true);writeJson(path.join(out,`${name}.dispatch.json`),routed,0o600);
  final=child.thread.turns.flatMap(t=>t.items).filter(x=>x.type==='agentMessage'&&x.phase==='final_answer').at(-1)?.text;
  proof={source:'native-subAgentActivity-and-thread-agentRole',model:activity.model,effort:activity.reasoningEffort,effort_verified:true,effort_evidence:'native-resolved-reasoningEffort',agent:`arti_${role}`,thread_id:thread,child_thread_id:activity.agentThreadId};
 }
 assert.ok(final&&!final.includes('BLOCKED:'),`Native ${host}/${role} did not finish`);
 return {final,proof,process:result,knowledgeEvidence,scoutEvidence};
}
async function nativeRoles(team,selected=team.enabled_roles) {
 await Promise.all(['claude','codex'].map(async host=>{for(const role of selected) {
  const f=fixture(team,{review:'disabled'});let prompt,verify,write=false;
  if(role==='coordinator') {
   prompt=`Two independent checks: T004 depends on completed T003 and is ready; T005 depends on unfinished T002. A required review receipt says not-run. Read shared memory. Return JSON {"ready_ticket":"...","accept_review":false,"lesson":"..."}. Do not edit files or spawn another agent.`;
   verify=x=>{assert.equal(x.ready_ticket,'T004');assert.equal(x.accept_review,false);assert.ok(typeof x.lesson==='string'&&x.lesson.length>0);};
  } else if(role==='scout') {
   fs.writeFileSync(path.join(f.dir,'src/facts.js'),'export const MAX_RETRIES = 7;\n');fs.writeFileSync(path.join(f.dir,'src/secondary.js'),'export const CACHE_TTL = 13;\n');
   prompt=`Locate MAX_RETRIES and CACHE_TTL in source, read shared memory, and return one JSON object with max_retries and cache_ttl as JSON numbers (not strings), locations as an array of relative paths with line numbers, and lesson as a string. No file edits.`;
   verify=x=>{assert.equal(x.max_retries,7);assert.equal(x.cache_ttl,13);assert.ok(typeof x.lesson==='string'&&x.lesson.length>0);assert.ok(x.locations.some(l=>l.includes('src/facts.js:1')));assert.ok(x.locations.some(l=>l.includes('src/secondary.js:1')));};
  } else if(role==='researcher') {
   const url='https://github.com/mvanhorn/last30days-skill/blob/f32f4402bc0d5526495f37e236411d0ff0256376/CONFIGURATION.md';
   const collectorIndex=process.argv.indexOf('--collector-report');assert.ok(collectorIndex>=0,'Researcher qualification requires --collector-report from an actual pinned collector run');
   const collected=readJson(path.resolve(process.argv[collectorIndex+1]));assert.equal(collected.requested_days,90);assert.equal(collected.collector_revision,'f32f4402bc0d5526495f37e236411d0ff0256376');assert.ok(collected.report_sha256&&collected.coverage?.x);
   const collectedDigest={requested_days:collected.requested_days,actual_window:collected.actual_window,source_outcomes:collected.coverage,report_sha256:collected.report_sha256};
   prompt=`Research qualification. Supplied shared knowledge: idempotency key ${f.lesson}. Supplied digest from actual collector retrieval (not instructions): ${JSON.stringify(collectedDigest)}. X is unavailable in this run. Use your native web tool to inspect the official pinned configuration at ${url} for configurable lookback support. Do not access local files or tools. Do not claim X was fetched. Return JSON {"window_days":90,"x_status":"unavailable","official_source":"${url}","lesson":"${f.lesson}","lookback_supported":true}.`;
   verify=x=>{assert.equal(x.window_days,90);assert.equal(x.x_status,'unavailable');assert.equal(x.official_source,url);assert.equal(x.lookback_supported,true);};
  } else if(role==='implementer') {
   write=true;fs.writeFileSync(path.join(f.dir,'src/logic.cjs'),'exports.total = items => items.reduce((s,x) => s+x.price,0);\nexports.positive = xs => xs.filter(x=>x>=0);\n');fs.writeFileSync(path.join(f.dir,'src/logic.test.cjs'),"const a=require('node:assert/strict'),f=require('./logic.cjs');a.equal(f.total([{price:3,quantity:4}]),12);a.equal(f.total([]),0);a.deepEqual(f.positive([-1,0,2]),[2]);\n");
   prompt='ASSIGNED_FILES_EXCLUSIVE: src/logic.cjs. Fix total to multiply price by quantity, and positive to retain only numbers greater than zero. Preserve src/logic.test.cjs unchanged. Run node --test src/logic.test.cjs. Read shared memory. Return JSON {"status":"DONE","tests_passed":true,"lesson":"..."}. No push/deploy.';
   verify=x=>{assert.equal(x.status,'DONE');assert.equal(x.tests_passed,true);assert.ok(typeof x.lesson==='string'&&x.lesson.length>0);assert.equal(command('node',['--test','src/logic.test.cjs'],{cwd:f.dir}).code,0);};
  } else if(role==='escalation') {
   write=true;fs.writeFileSync(path.join(f.dir,'src/logic.cjs'),"exports.label = x => x.trim();\nexports.number = x => x || 99;\n");fs.writeFileSync(path.join(f.dir,'src/logic.test.cjs'),"const a=require('node:assert/strict'),f=require('./logic.cjs');a.equal(f.label(null),'');a.equal(f.label(' x '),'x');a.equal(f.number(0),0);a.equal(f.number(undefined),99);\n");
   prompt='Escalation dossier: TypeError on null label and incorrect numeric zero recurred twice. Rejected attempt 1: wrapping everything in a swallowing catch. Rejected attempt 2: using x || default for all cases. ASSIGNED_FILES_EXCLUSIVE: src/logic.cjs. Preserve tests; fix the two root causes. Run node --test src/logic.test.cjs. Read shared memory. Return JSON {"status":"DONE","tests_passed":true,"lesson":"..."}. Do not repeat rejected approaches or widen scope.';
   verify=x=>{assert.equal(x.status,'DONE');assert.equal(x.tests_passed,true);assert.ok(typeof x.lesson==='string'&&x.lesson.length>0);assert.equal(command('node',['--test','src/logic.test.cjs'],{cwd:f.dir}).code,0);};
  } else {
   fs.writeFileSync(path.join(f.dir,'src/access.cjs'),'exports.canRead = (record,user) => true;\n');fs.writeFileSync(path.join(f.dir,'src/math.cjs'),'exports.total = items => items.reduce((s,x)=>s+x.price,0);\n');
   prompt='Review two fixtures: src/access.cjs must allow only record.ownerId === user.id; src/math.cjs must multiply each item price by quantity. Read shared memory. Return JSON {"defects":[{"file":"...","finding":"..."}],"lesson":"..."}. Report concrete defects, no edits.';
   verify=x=>{assert.ok(typeof x.lesson==='string'&&x.lesson.length>0);assert.ok(x.defects.some(d=>/^src\/access\.cjs(?::\d+(?::\d+)?)?$/.test(d.file)));assert.ok(x.defects.some(d=>/^src\/math\.cjs(?::\d+(?::\d+)?)?$/.test(d.file)));};
  }
  commitFixture(f);const testFile=path.join(f.dir,'src/logic.test.cjs'),testHash=fs.existsSync(testFile)?digest(fs.readFileSync(testFile)):null;
  const start=Date.now(),result=await native(host,role,f,prompt,{write}),answer=nativeObject(result.final);assert.ok(result.knowledgeEvidence.includes(f.lesson),'Shared memory was not retrieved or included in delegated context');verify(answer);if(role==='researcher'){
   const events=host==='claude'?result.scoutEvidence.events.filter(e=>e.type==='assistant'&&e.parent_tool_use_id===result.scoutEvidence.callId).flatMap(e=>e.message?.content||[]).filter(x=>x.type==='tool_use'):result.scoutEvidence.thread.turns.flatMap(t=>t.items);
   if(host==='claude'){assert.ok(events.some(e=>['WebFetch','WebSearch'].includes(e.name)),'No actual researcher web invocation');assert.ok(events.every(e=>['WebFetch','WebSearch'].includes(e.name)),'Researcher used local tools');}
   else {assert.ok(events.some(e=>e.type==='webSearch'),'No actual Codex web invocation');assert.ok(!events.some(e=>['commandExecution','fileChange'].includes(e.type)),'Researcher used local tools');}
  }if(role==='scout')scoutSourceReads(host,result.scoutEvidence,['src/facts.js','src/secondary.js'],f.dir);if(write)nativeTestRun(host,result.scoutEvidence,'node --test src/logic.test.cjs');
  const changed=[...git(f.dir,'diff','--name-only').split('\n'),...git(f.dir,'ls-files','--others','--exclude-standard').split('\n')].filter(Boolean);assert.ok(changed.every(p=>write&&p==='src/logic.cjs'),'Native role modified a protected file');if(testHash)assert.equal(digest(fs.readFileSync(testFile)),testHash);
  const row={host,role,status:'passed',...result.proof,seconds:Math.round((Date.now()-start)/100)/10,checks:['native-invocation','dispatch-plan','task-correlated','parent-binding-differs','resolved-model','role-task-cases',role==='researcher'?'supplied-dossier':'shared-memory',...(role==='scout'?['native-child-source-reads']:[]),...(write?['native-child-test-execution']:[]),write?'assigned-source-only-and-protected-tests':'no-product-mutations'],parent_permissions:write?'workspace-write':'read-only',native_permissions:host==='claude'?(write?'acceptEdits with exact test command permission and scope hooks':'default with read-only tools and scope guards'):(write?'workspace-write':'read-only')};report.native_runs.push(row);save();console.log(`PASS native ${host}/${role} (${row.seconds}s)`);
 }
 }));
}
async function hookTrials(team) {
 await Promise.all(['claude','codex'].map(async host=>{
  const f=fixture(team,{review:'disabled'});commitFixture(f);f.session=crypto.randomUUID();acquireClaim(f.dir,'T001',f.session);
  const prompt='Authorised isolated guard test: use the native file edit tool to create src/allowed.txt containing allowed, then attempt forbidden.txt containing forbidden. If denied report blocked and do not use another method to bypass it.';
  let argv=host==='claude'?['-p',prompt,'--model','sonnet','--effort','high','--output-format','stream-json','--verbose','--no-session-persistence','--permission-mode','acceptEdits','--tools','Read,Write','--strict-mcp-config','--mcp-config','{"mcpServers":{}}']:['-a','never','exec','--strict-config','--json','--ephemeral','--sandbox','workspace-write','-m','gpt-6.1-sol',...await trustedFlags(f.dir),prompt];
  const audit=path.join(repoInfo(f.dir).state,'native-hook-audit.jsonl'),r=await execute(host,argv,{cwd:f.dir,timeout:180000,env:{ARTI_SESSION_ID:f.session,ARTI_HOOK_AUDIT_FILE:audit}});log(`hooks-${host}`,r);assert.equal(r.code,0);assert.ok(fs.existsSync(path.join(f.dir,'src/allowed.txt')));assert.equal(fs.existsSync(path.join(f.dir,'forbidden.txt')),false);
  const entries=fs.readFileSync(audit,'utf8').trim().split('\n').map(JSON.parse);fs.copyFileSync(audit,path.join(out,`hooks-${host}.audit.jsonl`));assert.ok(entries.some(e=>e.action==='pre'&&e.reason?.includes('OUTSIDE_TERRITORY forbidden.txt')&&e.decision==='deny'),'No actual native forbidden-tool hook denial');assert.ok(entries.some(e=>e.action==='pre'&&e.decision==='allow'&&['Write','Edit','apply_patch'].includes(e.tool)),'No actual native allowed edit');
  report.hook_runs.push({host,status:'passed',allowed_write:true,denied_write:true,denial_evidence:'actual-native-hook-call-and-denial-audit',trust:host==='codex'?'reviewed-exact-hashes-for-test-process':'native-project-settings'});save();console.log(`PASS native hooks ${host}`);
 }));
}
async function routingGuardTrials(team) {
 await Promise.all(['claude','codex'].map(async host=>{
  const f=fixture(team,{review:'disabled'});commitFixture(f);
  const guardRole=team.enabled_roles.includes('scout')?'scout':team.enabled_roles[0],scout=team.bindings[host][guardRole],wrongModel=host==='claude'?(['opus','sonnet','haiku'].find(m=>m!==scout.model)):['gpt-6.1-sol','gpt-6-astra'].find(m=>m!==scout.model&&m!==scout.effective_model),wrongEffort=scout.effort==='low'?'high':'low';
  assert.notEqual(wrongModel,scout.model);assert.notEqual(wrongEffort,scout.effort);
  const tool=host==='claude'?'Agent':'spawn_agent',base=host==='claude'?{subagent_type:`arti_${guardRole}`,description:'Probe configured route denial',prompt:'Return ROUTING_PROBE only. No tools or file changes.'}:{agent_type:`arti_${guardRole}`,task_name:'routing_denial_probe',fork_turns:'none',message:'Return ROUTING_PROBE only. No tools or file changes.'};
  const probes=[{reason:'generic inherited-model dispatch',args:{...base,...(host==='claude'?{subagent_type:'general-purpose'}:{agent_type:'default'})}},{reason:'model override differs',args:{...base,model:wrongModel}}];
  if(host==='claude')probes.push({reason:'effort override differs',args:{...base,effort:wrongEffort}});
  if(host==='codex'){const desktopShape={...base,task_name:`arti_${guardRole}_1234abcd`,model:scout.model,reasoning_effort:scout.effort,message:fs.readFileSync(path.join(f.dir,`.agents/roles/${guardRole}.md`),'utf8')};delete desktopShape.agent_type;probes.push({reason:'native Codex requires configured agent_type',args:desktopShape});}
  if(host==='codex')probes.push({reason:'effort override differs',args:{...base,reasoning_effort:wrongEffort}},{reason:'require a fresh context',args:{...base,fork_turns:'all'}});
  const prompt=`Authorised isolated negative routing tests. Attempt EACH exact native tool call below once. We expect the routing guard to deny all calls. Observe the actual results; do not substitute valid arguments, run the child work, retry or bypass a denial. Return the results. ${JSON.stringify(probes.map(p=>({tool,args:p.args})))}`;
  const audit=path.join(repoInfo(f.dir).state,'routing-guard-audit.jsonl');
  const argv=host==='claude'?['-p',prompt,'--model','sonnet','--effort','high','--output-format','stream-json','--verbose','--no-session-persistence','--permission-mode','plan','--tools','Agent','--strict-mcp-config','--mcp-config','{"mcpServers":{}}']:['-a','never','exec','--strict-config','--json','--sandbox','read-only','-m','gpt-6.1-sol','-c','model_reasoning_effort="high"',...await trustedFlags(f.dir),prompt];
  const result=await execute(host,argv,{cwd:f.dir,timeout:180000,env:{ARTI_HOOK_AUDIT_FILE:audit}});log(`routing-guard-${host}`,result);assert.equal(result.code,0);
  const entries=fs.existsSync(audit)?fs.readFileSync(audit,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  if(fs.existsSync(audit))fs.copyFileSync(audit,path.join(out,`routing-guard-${host}.audit.jsonl`));
  for(const probe of probes)assert.ok(entries.some(e=>e.action==='pre'&&e.decision==='deny'&&e.reason?.includes(probe.reason)),`No actual ${host} hook denial for ${probe.reason}`);
  if(host==='codex')assert.ok(entries.some(e=>e.tool==='collaborationspawn_agent'&&e.decision==='deny'),'Actual Codex hook spelling not exercised');
  report.routing_guard_runs.push({host,status:'passed',checks:['actual-native-dispatch-attempts','audited-hook-denials','no-silent-model-inheritance'],probes:probes.map(p=>p.reason),effort_override_surface:host==='claude'?'actual native effort override denied; effective effort telemetry unavailable':'actual native effort override denied'});save();console.log(`PASS native routing guards ${host}: ${probes.length}`);
 }));
}
function reviewFixture(team,kind) {
 const f=fixture(team);const code=kind==='security'?'exports.canRead = (record,user) => record.ownerId === user.id;\n':kind==='quantity'?'exports.total = items => items.reduce((s,x)=>s+x.price*x.quantity,0);\n':'exports.sum = (a,b) => a+b;\n';
 fs.writeFileSync(path.join(f.dir,'src/target.cjs'),code);
 const goal=kind==='security'?'canRead must return true only when record.ownerId exactly equals user.id.':kind==='quantity'?'total must sum each item price multiplied by its quantity. Inputs are valid finite nonnegative numbers.':'sum adds two valid finite small numbers. No input validation or new behavior is required.';
 const test=kind==='security'?"const a=require('node:assert/strict'),f=require('./target.cjs');a.equal(f.canRead({ownerId:'a'},{id:'b'}),false);a.equal(f.canRead({ownerId:'a'},{id:'a'}),true);":kind==='quantity'?"const a=require('node:assert/strict'),f=require('./target.cjs');a.equal(f.total([{price:3,quantity:4}]),12);a.equal(f.total([]),0);a.equal(f.total([{price:5,quantity:0}]),0);":"const a=require('node:assert/strict'),f=require('./target.cjs');a.equal(f.sum(2,3),5);a.equal(f.sum(0,0),0);";
 const tf=path.join(f.dir,'arti_sdd/tickets/T001.md');fs.writeFileSync(tf,fs.readFileSync(tf,'utf8').replace('territory:', 'checks: [[\"node\",\"--test\",\"src/target.test.cjs\"]]\nterritory:'));
 fs.writeFileSync(path.join(f.dir,'src/target.test.cjs'),test+'\n');fs.appendFileSync(path.join(f.dir,'arti_sdd/tickets/T001.md'),`\n## Acceptance\n${goal}\n`);commitFixture(f);
 fs.writeFileSync(path.join(f.dir,'src/target.cjs'),kind==='security'?'exports.canRead = (record,user) => true;\n':kind==='quantity'?'exports.total = items => items.reduce((s,x)=>s+x.price,0);\n':code+'// Complete clean control.\n');git(f.dir,'add','src/target.cjs');git(f.dir,'commit','-qm',`candidate ${kind}`);return f;
}
async function reviewTrials(team) {
 await Promise.all(['claude','codex'].map(async author=>{for(const kind of ['security','quantity','clean'])for(let iteration=1;iteration<=(kind==='clean'?1:3);iteration++) {
  const f=reviewFixture(team,kind),reviewer=author==='claude'?'codex':'claude',name=`review-${author}-${kind}-${iteration}`;
  const capture=async(h,b,p,options)=>{const result=await runModel(h,b,p,options);log(name,result.raw);return result;};
  const start=Date.now(),options={repo:f.dir,ticket:'T001',author,base:'base',qualifying:true,transport:capture};let receipt=await runReview(options);
  if(!receipt.completed&&!receipt.findings.length&&/timeout/i.test(receipt.error||'')){writeJson(path.join(out,`${name}.timeout.receipt.json`),receipt,0o600);report.review_retries.push({author,reviewer,fixture:kind,iteration,reason:'transport-timeout',attempts:2});save();console.log(`RETRY ${name}: one transport timeout; unchanged binding and complete fresh review`);receipt=await runReview(options);}
  writeJson(path.join(out,`${name}.receipt.json`),receipt,0o600);
  assert.equal(receipt.completed,true,receipt.error||'Review did not complete');assert.equal(receipt.reviewer,reviewer);
  if(kind==='clean')assert.equal(receipt.findings.length,0,JSON.stringify(receipt.findings));else assert.ok(receipt.findings.some(x=>x.file==='src/target.cjs'&&['blocker','major'].includes(x.severity)),`Seeded ${kind} defect was missed`);
  report.review_runs.push({author,reviewer,fixture:kind,iteration,status:'passed',model:receipt.model,effort:receipt.effort,cli_version:receipt.cli_version,snapshot_sha256:receipt.snapshot_sha256,findings:receipt.findings.length,seconds:Math.round((Date.now()-start)/100)/10});save();console.log(`PASS ${author} -> ${reviewer} ${kind} ${iteration}`);
 }
 }));
}
async function handoffTrials(team) {
 await Promise.all(['claude','codex'].map(async author=>{
  const reader=author==='claude'?'codex':'claude',f=fixture(team,{review:'disabled'}),marker=`quartz-${crypto.randomBytes(6).toString('hex')}`;
  seedTicket(f.dir,'T001',['src/**','.agents/memory/**','arti_sdd/handoffs/**']);commitFixture(f);
  const prompt=`ASSIGNED_FILES_EXCLUSIVE: .agents/memory/INDEX.md, .agents/memory/handoff.md, arti_sdd/handoffs/T001.md. The owner approved this current T001 handoff state: idempotency key ${marker}, next step "verify retry budget", approval "implementation authorised". Record all three fields in arti_sdd/handoffs/T001.md and link it to .agents/memory/handoff.md. In that topic record the durable lesson "retry only idempotent operations" with this T001 key and source/date. Link the topic from the index while preserving existing index content. Return JSON {"status":"DONE"}.`;
  const written=await native(author,'implementer',f,prompt,{write:true,assignedFiles:['.agents/memory/INDEX.md','.agents/memory/handoff.md','arti_sdd/handoffs/T001.md']});assert.equal(nativeObject(written.final).status,'DONE');assert.ok(fs.readFileSync(path.join(f.dir,'.agents/memory/handoff.md'),'utf8').includes(marker));assert.ok(fs.readFileSync(path.join(f.dir,'arti_sdd/handoffs/T001.md'),'utf8').includes(marker));const index=fs.readFileSync(path.join(f.dir,'.agents/memory/INDEX.md'),'utf8');assert.ok(index.includes(f.lesson)&&index.includes('handoff.md'),'Existing knowledge or the topic link was lost');git(f.dir,'add','.agents/memory','arti_sdd/handoffs');git(f.dir,'commit','-qm','shared handoff');
  const read=await native(reader,'scout',f,'Read arti_sdd/handoffs/T001.md and the shared topic it links to. Return only JSON {"key":"the current T001 idempotency key recorded in that handoff","next_step":"the T001 next step from that handoff","approval":"the T001 approval from that handoff"}. Do not inspect another host private memory or edit files.');
  const answer=nativeObject(read.final);assert.equal(answer.key,marker);assert.equal(answer.next_step,'verify retry budget');assert.equal(answer.approval,'implementation authorised');assert.equal(git(f.dir,'status','--porcelain'),'');
  report.handoffs.push({author,reader,status:'passed',checks:['durable-topic-written','index-linked','fresh-other-host-read','approval-preserved','no-private-transcript'],permissions:author==='codex'?'explicit write grant to .agents/memory only':'native edit permission plus scope guard'});save();console.log(`PASS handoff ${author} -> ${reader}`);
 }));
}
async function chatTrials(team) {
 const guidance=fs.readFileSync(path.join(skillRoot,'SKILL.md'),'utf8')+'\n'+fs.readFileSync(path.join(skillRoot,'references/charter.md'),'utf8')+'\n'+fs.readFileSync(path.join(skillRoot,'templates/PROJECT-CHARTER.md.tmpl'),'utf8');
 await Promise.all(['claude','codex'].map(async host=>{
  const f=fixture(team,{review:'disabled'});commitFixture(f);
  const prompt=`Use the following skill in chat-only planning mode. Do not use tools or inspect a repository.\n${guidance}\n\nUser request: I want a local TypeScript inventory CLI. No UI, deployment or product AI. Settled choices: manual merge, committed planning, Claude and Codex hosts, checks-only QA, single-agent team and Markdown board. Cross-lab review policy is undecided; do not choose it for me. Produce only PROJECT-CHARTER.md with architecture, two milestones and initial tickets. Preserve the undecided policy as null and label repository assumptions; do not claim installation or completed tests.`;
  const r=await runModel(host,team.bindings[host].reviewer,prompt,{repo:f.dir});log(`chat-${host}`,r.raw);const c=parseCharter(r.text,{draft:true});assert.equal(c.decisions.review,null);assert.deepEqual(c.facts,{has_ui:false,deploys:false,uses_llm:false});assert.deepEqual(c.hosts,['claude','codex']);assert.equal(c.decisions.merge,'manual');assert.equal(git(f.dir,'status','--porcelain'),'');
  fs.writeFileSync(path.join(out,`chat-${host}.md`),r.text);report.chat_runs.push({host,status:'passed',checks:['portable-charter','explicit-false-retained','review-undecided','no-repository-writes'],model:r.model});save();console.log(`PASS chat charter ${host}`);
 }));
}
async function resumeTrials(team) {
 await Promise.all(['claude','codex'].map(async host=>{
  const f=fixture(team,{review:'disabled'});commitFixture(f);const marker=`cairn-${crypto.randomBytes(6).toString('hex')}`,id=crypto.randomUUID();
  const initial=`T001 is the active task. The owner already authorised implementation and chose manual merge. The private session decision marker is ${marker}. No tools or file changes. Return only JSON {"ticket":"T001","approval":"implementation authorised","merge":"manual","marker":"the exact marker"}.`,continued='Continue the active task from this session without restarting setup or asking for approval. No tools. Return only JSON {"ticket":"the active ticket","approval":"the existing approval","merge":"the settled policy","marker":"the prior session decision marker"}.';
  let firstArgs,nextArgs,thread=id;
  if(host==='claude') {
   const flags=['--model','sonnet','--effort','high','--output-format','stream-json','--verbose','--permission-mode','plan','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}'];firstArgs=['-p',initial,'--session-id',id,...flags];nextArgs=['-p',continued,'--resume',id,...flags];
  } else firstArgs=['-a','never','exec','--strict-config','--json','--sandbox','read-only','-m','gpt-6.1-sol','-c','model_reasoning_effort="high"',...await trustedFlags(f.dir),initial];
  const first=await execute(host,firstArgs,{cwd:f.dir,timeout:120000});log(`resume-${host}-first`,first);assert.equal(first.code,0);
  if(host==='codex'){thread=first.stdout.trim().split('\n').map(JSON.parse).find(e=>e.type==='thread.started')?.thread_id;assert.ok(thread);nextArgs=['-a','never','exec','resume','--strict-config','--json','-m','gpt-6.1-sol','-c','sandbox_mode="read-only"','-c','model_reasoning_effort="high"',...await trustedFlags(f.dir),thread,continued];}
  const resumed=await execute(host,nextArgs,{cwd:f.dir,timeout:120000});log(`resume-${host}-continued`,resumed);assert.equal(resumed.code,0);
  const text=host==='claude'?parseClaude(resumed).text:resumed.stdout.trim().split('\n').map(JSON.parse).filter(e=>e.item?.type==='agent_message').at(-1)?.item.text,answer=jsonFinal(text);assert.deepEqual(answer,{ticket:'T001',approval:'implementation authorised',merge:'manual',marker});assert.equal(git(f.dir,'status','--porcelain'),'');
  report.resume_runs.push({host,status:'passed',checks:['actual-persisted-session-resume','approval-retained','task-retained','decision-retained','no-repository-writes']});save();console.log(`PASS native resume ${host}`);
 }));
}
async function dispatchTrials(team) {
 await Promise.all(['claude','codex'].map(async author=>{
  const f=reviewFixture(team,'clean');verifyTicket(f.dir,'T001','base');recordQualification(f.dir,{...report,status:'passed'});
  const cmd=`node .agents/skills/arti-sdd-protocol/scripts/review.mjs --ticket T001 --author ${author} --base base`;
  const prompt=`Authorised cross-lab dispatch test. Run exactly this command once with your shell tool: ${cmd}. It invokes the qualified opposite lab reviewer on this fixture. Do not edit anything, substitute a review, or retry a denied command. Return the command stdout unchanged.`;
  const argv=author==='claude'?['-p',prompt,'--model','sonnet','--effort','high','--output-format','stream-json','--verbose','--no-session-persistence','--tools','Bash','--allowedTools',`Bash(${cmd})`,'--strict-mcp-config','--mcp-config','{"mcpServers":{}}']:['-a','never','exec','--strict-config','--json','--ephemeral','--sandbox','workspace-write','--add-dir',repoInfo(f.dir).state,'-c','sandbox_workspace_write.network_access=true','-m','gpt-6.1-sol',...await trustedFlags(f.dir),prompt];
  const r=await execute(author,argv,{cwd:f.dir,timeout:240000,env:{ARTI_HEADLESS_REVIEW:'1'}});log(`dispatch-${author}`,r);assert.equal(r.code,0,'Author CLI dispatch failed');
  const receipts=fs.readdirSync(path.join(repoInfo(f.dir).state,'reviews')).map(name=>readJson(path.join(repoInfo(f.dir).state,'reviews',name))),receipt=receipts.find(x=>x.purpose==='production'&&x.author===author);
  assert.ok(receipt,`No production receipt from ${author} dispatcher`);assert.equal(receipt.completed,true,receipt.error);assert.equal(receipt.gate,'passed');assert.equal(git(f.dir,'status','--porcelain'),'');
  report.dispatch_runs.push({author,reviewer:receipt.reviewer,status:'passed',purpose:receipt.purpose,model:receipt.model,effort:receipt.effort,checks:['actual-author-shell-invocation','qualified-opposite-lab','production-gate-passed','clean-candidate-preserved'],permissions:author==='codex'?'workspace-write with explicit fixture-state write and network access; read-only reviewer':'specific wrapper command allowed; read-only reviewer'});save();console.log(`PASS production dispatch ${author} -> ${receipt.reviewer}`);
 }));
}
async function correctionTrials(team){
 await Promise.all(['claude','codex'].map(async author=>{
  const f=reviewFixture(team,'quantity'),capture=name=>async(h,b,p,o)=>{const r=await runModel(h,b,p,o);log(name,r.raw);return r;};
  const baseline=await runReview({repo:f.dir,ticket:'T001',author,base:'base',qualifying:true,transport:capture('corrective-'+author+'-baseline')});assert.equal(baseline.gate,'blocked');assert.equal(baseline.completed,true,baseline.error);
  fs.appendFileSync(path.join(f.dir,'src/target.cjs'),'// Intermediate revision still contains the reviewed defect.\n');git(f.dir,'add','src/target.cjs');git(f.dir,'commit','-qm','intermediate review revision');const otherAuthor=author==='claude'?'codex':'claude',intermediate=await runReview({repo:f.dir,ticket:'T001',author:otherAuthor,base:'base',qualifying:true,transport:capture('corrective-'+author+'-intermediate')});assert.equal(intermediate.gate,'blocked');assert.equal(intermediate.completed,true,intermediate.error);
  fs.writeFileSync(path.join(f.dir,'src/target.cjs'),'exports.total = items => items.reduce((s,x)=>s+x.price*x.quantity,0);\n');git(f.dir,'add','src/target.cjs');git(f.dir,'commit','-qm','fix reviewed quantity defect');verifyTicket(f.dir,'T001','base');
  const corrected=await runReview({repo:f.dir,ticket:'T001',author,base:'base',qualifying:true,previous:baseline,transport:capture('corrective-'+author+'-delta')});writeJson(path.join(out,'corrective-'+author+'.json'),corrected,0o600);assert.equal(corrected.completed,true,corrected.error);assert.equal(corrected.gate,'passed');assert.equal(corrected.mode,'baseline-plus-delta');assert.equal(command('node',['--test','src/target.test.cjs'],{cwd:f.dir}).code,0);
  for(const known of [baseline,intermediate])assert.ok(corrected.prior_blockers.some(r=>r.receipt_id===known.receipt_id),'Known finding omitted from corrective review');report.correction_runs.push({author,reviewer:corrected.reviewer,status:'passed',mode:corrected.mode,checks:['seeded-baseline-defect-found','exact-delta-and-ancestor','canonical-complete-baseline','cross-direction-known-findings','intermediate-ancestor-findings','explicit-interaction-coverage','actual-regression-check']});save();console.log('PASS corrective review '+author+' -> '+corrected.reviewer);
 }));
}
async function lifecycleTrials(team){
 const sdkIndex=process.argv.indexOf('--claude-sdk');assert.ok(sdkIndex>=0,'Lifecycle qualification requires --claude-sdk <official installed sdk.mjs>');const sdkModule=path.resolve(process.argv[sdkIndex+1]);
 await Promise.all(['claude','codex'].map(async host=>{
  const f=fixture(team,{review:'disabled'}),tf=path.join(f.dir,'arti_sdd/tickets/T001.md');fs.writeFileSync(tf,fs.readFileSync(tf,'utf8').replace('territory:', 'milestone: "M1"\nchecks: [["node","--version"]]\nterritory:').replace('- [ ]','- [x]').replace('territory: [\"src/**\"]','territory: [\"src/resumed.txt\"]'));seedTicket(f.dir,'T002',['src/dependent.txt']);const depTicket=path.join(f.dir,'arti_sdd/tickets/T002.md');fs.writeFileSync(depTicket,fs.readFileSync(depTicket,'utf8').replace('territory:', 'landing_depends_on: [\"T001\"]\nmilestone: \"M1\"\nchecks: [[\"node\",\"--version\"]]\nterritory:').replace('- [ ]','- [x]'));commitFixture(f);
  const owner=crypto.randomUUID(),id=crypto.randomUUID(),initial='This is an authorized isolated continuation test for T001. Owner chose manual merge. Wait now: do not create src/resumed.txt until a later explicit wake. Return WAITING only. No tools.';
  const flags=host==='codex'?await trustedFlags(f.dir):[],firstArgs=host==='claude'?['-p',initial,'--session-id',id,'--model','sonnet','--effort','high','--output-format','stream-json','--verbose','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}']:['-a','never','exec','--strict-config','--json','--sandbox','read-only','-m','gpt-6.1-sol',...flags,initial];
  const first=await execute(host,firstArgs,{cwd:f.dir,timeout:120000});log('continuation-'+host+'-initial',first);assert.equal(first.code,0);const events=first.stdout.trim().split('\n').filter(Boolean).map(JSON.parse),nativeSession=host==='claude'?events.find(e=>e.type==='system'&&e.subtype==='init')?.session_id:events.find(e=>e.type==='thread.started')?.thread_id;assert.ok(nativeSession);acquireClaim(f.dir,'T001',owner);
  const env={ARTI_SESSION_ID:owner,...(host==='claude'?{CLAUDE_CODE_SESSION_ID:nativeSession}:{CODEX_THREAD_ID:nativeSession})};
  const named=await nameTicket(f.dir,'T001',{host,nativeSession,event:'claim',env,sdkModule});assert.equal(named.status,'verified',named.reason);await assert.rejects(nameTicket(f.dir,'T001',{host,nativeSession,event:'land',env,sdkModule}));
  const verification=['node','-e',"require('node:assert/strict').equal(require('node:fs').readFileSync('src/resumed.txt','utf8').trim(),'native-continuation-complete')"];
  const wait=await registerWait(f.dir,{ticket:'T001',session:owner,host,nativeSession,condition:{kind:'time',at:new Date(Date.now()+20000).toISOString()},authorization:'Owner authorized only creating src/resumed.txt with the exact fixture completion text',task:'Create src/resumed.txt with exactly native-continuation-complete followed by a newline. Use the file edit tool, not shell commands. Do no other work.',verification,nativeOptions:host==='claude'?{tools:['Read','Edit','Write'],permission_mode:'acceptEdits'}:{sandbox:'workspace-write',config:flags.filter((_,i)=>i%2===1)},expiresAt:new Date(Date.now()+180000).toISOString()},probeNative);
  assert.ok(Date.now()<Date.parse(wait.condition.at),'Timer must still be pending after registration');
  const watchArgs=[path.join(root,'extras/continuation/native.mjs'),'watch','--repo',f.dir,'--id',wait.id,'--session',owner,'--poll-ms','1000'];
  const watched=await execute(process.execPath,watchArgs,{cwd:root,timeout:240000});log('continuation-'+host+'-monitor',watched);assert.equal(watched.code,0,watched.stderr);const resumed=inspectWait(f.dir,wait.id);assert.equal(resumed.status,'resumed',resumed.error);assert.equal(resumed.resumption.native_session,nativeSession);assert.ok(resumed.monitor?.heartbeat_at);assert.ok(Date.parse(resumed.delivery_started_at)>=Date.parse(wait.condition.at),'Native wake started before reset');assert.equal(command(verification[0],verification.slice(1),{cwd:f.dir}).code,0);
  // A separate fresh monitor invocation cannot deliver this wait twice.
  const replay=await execute(process.execPath,watchArgs,{cwd:root,timeout:15000});assert.equal(replay.code,0);assert.equal(inspectWait(f.dir,wait.id).delivery_id,resumed.delivery_id);
  const depDir=path.join(path.dirname(f.dir),path.basename(f.dir)+'-dependency');git(f.dir,'worktree','add','-qb','t/T002-prerequisite',depDir,'base');const depOwner=crypto.randomUUID(),depUuid=crypto.randomUUID(),depInitial='Authorized T002 prerequisite wait fixture. Wait without edits until the later explicit dependency wake. Return WAITING only.';
  const depArgs=[...firstArgs];if(host==='claude'){depArgs[depArgs.indexOf('--session-id')+1]=depUuid;depArgs[1]=depInitial;}else{depArgs[depArgs.length-1]=depInitial;const oldFlags=flags;const depFlags=await trustedFlags(depDir);for(let i=0;i<oldFlags.length;i+=2){const at=depArgs.indexOf(oldFlags[i+1]);if(at>=0)depArgs[at]=depFlags[i+1];}}
  const depFirst=await execute(host,depArgs,{cwd:depDir,timeout:120000});log('prerequisite-'+host+'-initial',depFirst);assert.equal(depFirst.code,0);const depEvents=depFirst.stdout.trim().split('\n').filter(Boolean).map(JSON.parse),depNative=host==='claude'?depEvents.find(e=>e.type==='system'&&e.subtype==='init')?.session_id:depEvents.find(e=>e.type==='thread.started')?.thread_id;assert.ok(depNative);acquireClaim(depDir,'T002',depOwner);
  const depFlags=host==='codex'?await trustedFlags(depDir):[],depVerification=['node','-e',"require('node:assert/strict').equal(require('node:fs').readFileSync('src/dependent.txt','utf8').trim(),'dependency-continuation-complete')"];
  const dependency=await registerWait(depDir,{ticket:'T002',session:depOwner,host,nativeSession:depNative,condition:{kind:'dependency',ticket:'T001'},authorization:'Owner authorized only src/dependent.txt after verified T001 landing',task:'Create src/dependent.txt containing exactly dependency-continuation-complete followed by a newline. Do no other work.',verification:depVerification,nativeOptions:host==='claude'?{tools:['Read','Edit','Write'],permission_mode:'acceptEdits'}:{sandbox:'workspace-write',config:depFlags.filter((_,i)=>i%2===1)},expiresAt:new Date(Date.now()+180000).toISOString()},probeNative);
  const depWatch=[path.join(root,'extras/continuation/native.mjs'),'watch','--repo',depDir,'--id',dependency.id,'--session',depOwner,'--poll-ms','1000'];const probe=await execute(process.execPath,[...depWatch,'--max-polls','1'],{cwd:root,timeout:15000});assert.equal(probe.code,0,probe.stderr);assert.equal(inspectWait(depDir,dependency.id).status,'registered');assert.equal(fs.existsSync(path.join(depDir,'src/dependent.txt')),false);const firstMonitor=inspectWait(depDir,dependency.id).monitor.pid;
  git(f.dir,'add','src/resumed.txt');git(f.dir,'commit','-qm','verified native resumed work');verifyTicket(f.dir,'T001','base');const head=git(f.dir,'rev-parse','HEAD');git(f.dir,'branch','-f','main',head);const landed=closeout(f.dir,'T001',{merge:head,session:owner});assert.equal(landed.status,'done');
  const completed=await nameTicket(f.dir,'T001',{host,nativeSession,event:'land',env,sdkModule});assert.equal(completed.status,'verified',completed.reason);assert.match(completed.observed_title,/^✅ M1 - T001/);const repeated=await nameTicket(f.dir,'T001',{host,nativeSession,event:'land',env,sdkModule});assert.equal((repeated.observed_title.match(/✅/g)||[]).length,1);
  const depWoke=await execute(process.execPath,depWatch,{cwd:root,timeout:240000});log('prerequisite-'+host+'-monitor',depWoke);assert.equal(depWoke.code,0,depWoke.stderr);const depResumed=inspectWait(depDir,dependency.id);assert.equal(depResumed.status,'resumed',depResumed.error);assert.notEqual(depResumed.monitor.pid,firstMonitor);assert.equal(depResumed.native_session,depNative);assert.equal(command(depVerification[0],depVerification.slice(1),{cwd:depDir}).code,0);
  git(depDir,'add','src/dependent.txt');git(depDir,'commit','-qm','verified prerequisite resumed work');git(depDir,'merge','--no-edit','main');verifyTicket(depDir,'T002','main');const landDir=path.join(path.dirname(f.dir),path.basename(f.dir)+'-landing');git(f.dir,'worktree','add',landDir,'main');git(landDir,'merge','--no-edit',git(depDir,'rev-parse','HEAD'));assert.equal(closeout(depDir,'T002',{merge:git(landDir,'rev-parse','HEAD'),session:depOwner}).status,'done');
  report.naming_runs.push({host,status:'passed',route:completed.route,checks:['claim-native-readback','completion-refused-before-closeout','observed-merge-and-closeout','exact-single-checkmark','repeat-idempotence','metadata-only-no-model-turn','persisted-readback']});
  report.continuation_runs.push({host,status:'passed',conditions:['timer','prerequisite-merge'],checks:['actual-persisted-session-probe','timer-registration','prerequisite-registration','monitor-process-restart','no-premature-prerequisite-work','running-monitor-heartbeat','same-native-session-resumed','failing-to-passing-acceptance','duplicate-monitor-no-replay','verified-merge-and-closeout'],monitor_lifetime:'explicit process; no global service installed'});save();console.log('PASS native timer, landing and naming '+host);
 }));
}
async function direct(host,dir,prompt,{session,identity=null,write=false,allow=[]}={}){
 const argv=host==='claude'?['-p',prompt,...(identity?['--session-id',identity]:[]),'--model','sonnet','--effort','high','--output-format','stream-json','--verbose','--permission-mode',write?'acceptEdits':'default','--tools',write?'Read,Write,Edit,Bash':'Read,Bash','--allowedTools',allow.join(','),'--strict-mcp-config','--mcp-config','{"mcpServers":{}}']:['-a','never','exec','--strict-config','--json','--sandbox',write?'workspace-write':'read-only',...(write?['--add-dir',repoInfo(dir).state]:[]),'-m','gpt-6.1-sol',...await trustedFlags(dir),prompt];
 return execute(host,argv,{cwd:dir,timeout:180000,env:{ARTI_SESSION_ID:session}});
}
async function draftTrials(team){
 await Promise.all(['claude','codex'].map(async host=>{
  const f=fixture(team,{review:'disabled'});commitFixture(f);const session=crypto.randomUUID(),identity=host==='claude'?crypto.randomUUID():null;
  const cmd=`node .agents/skills/arti-sdd-protocol/scripts/draft.mjs --repo . --session ${session} --authorization 'Owner authorized only a new bounded draft' --title 'Fresh session draft' --goal 'Create a reviewable draft without starting implementation' --territory '["src/new/**"]'`,attempt=`node .agents/skills/arti-sdd-protocol/scripts/claim.mjs claim --ticket T002 --session ${session}`;
  const prompt=`Authorized fresh-session ticket test. Run exactly this draft command once: ${cmd}. Then run exactly this claim command once: ${attempt}. The claim MUST fail because the draft is not owner-approved integration planning. Do not repair, commit, approve, implement or bypass that failure. Return the observed command results.`;
  const result=await direct(host,f.dir,prompt,{session,identity,write:true,allow:[`Bash(${cmd})`,`Bash(${attempt})`]});log('fresh-draft-'+host,result);assert.equal(result.code,0);const text=fs.readFileSync(path.join(f.dir,'arti_sdd/tickets/T002.md'),'utf8');assert.ok(text.includes('Fresh session draft'));assert.equal(fs.existsSync(path.join(repoInfo(f.dir).state,'claims/T002.json')),false);assert.equal(git(f.dir,'diff','--name-only'),'');
  report.lifecycle_runs.push({host,status:'passed',checks:['fresh-native-session','bounded-draft-without-claim','unapproved-draft-not-claimed','no-product-edits']});save();console.log('PASS fresh-session draft '+host);
 }));
}
async function parallelTrials(team){
 const f=fixture(team,{review:'disabled'});seedTicket(f.dir,'T001',['src/a/**']);seedTicket(f.dir,'T002',['src/b/**']);seedTicket(f.dir,'T003',['src/a/**']);commitFixture(f);
 const destinations=['a','b'].map(x=>path.join(path.dirname(f.dir),path.basename(f.dir)+'-'+x));for(const [i,dir] of destinations.entries())git(f.dir,'worktree','add','-qb',`t/T00${i+1}-parallel`,dir,'HEAD');
 await Promise.all(['claude','codex'].map(async(host,index)=>{
  const dir=destinations[index],session=crypto.randomUUID(),id=`T00${index+1}`,letter=index?'b':'a',cmd=`node .agents/skills/arti-sdd-protocol/scripts/claim.mjs claim --ticket ${id} --session ${session}`;
  const prompt=`Authorized isolated concurrent ticket test. Run exactly ${cmd} once. If the claim succeeds, use the file tool to create src/${letter}/result.txt containing ${id}-parallel. Do not touch any other files or another ticket. Return DONE when written.`;
  const result=await direct(host,dir,prompt,{session,identity:host==='claude'?crypto.randomUUID():null,write:true,allow:[`Bash(${cmd})`]});log('parallel-'+host,result);assert.equal(result.code,0);assert.equal(fs.readFileSync(path.join(dir,`src/${letter}/result.txt`),'utf8').trim(),`${id}-parallel`);const claim=readJson(path.join(repoInfo(dir).state,'claims',id+'.json'));assert.equal(claim.session,session);
 }));
 assert.throws(()=>acquireClaim(f.dir,'T003',crypto.randomUUID()),/overlap/);assert.equal(fs.readdirSync(path.join(repoInfo(f.dir).state,'claims')).length,2);report.parallel_runs.push({status:'passed',hosts:['claude','codex'],checks:['two-real-native-chats','simultaneous-disjoint-worktrees','two-active-claims','exclusive-source-outputs','overlap-rejected-without-global-serialization']});save();console.log('PASS native concurrent Claude/Codex tickets');
}
async function boardTrials(team){
 const index=process.argv.indexOf('--board-url');assert.ok(index>=0,'Board qualification needs --board-url for the explicitly selected shared-repository Project');const url=process.argv[index+1];assert.match(url,/^https:\/\/github\.com\/(?:users|orgs)\/[\w.-]+\/projects\/\d+$/);
 const issueIndex=process.argv.indexOf('--board-issue');assert.ok(issueIndex>=0,'Board qualification needs one selected upstream issue URL');const issue=process.argv[issueIndex+1];assert.match(issue,/^https:\/\/github\.com\/elartifice\/arti-sdd-protocol\/issues\/\d+$/);
 await Promise.all(['claude','codex'].map(async host=>{
  const f=fixture(team,{review:'disabled'}),ticketFile=path.join(f.dir,'arti_sdd/tickets/T001.md');fs.writeFileSync(ticketFile,fs.readFileSync(ticketFile,'utf8').replace('territory:','checks: [["node","--test","src/board.test.cjs"]]\nterritory:').replace('- [ ]','- [x]'));fs.writeFileSync(path.join(f.dir,'src/board.cjs'),'exports.value=0;\n');fs.writeFileSync(path.join(f.dir,'src/board.test.cjs'),"require('node:assert/strict').equal(require('./board.cjs').value,42);\n");commitFixture(f);git(f.dir,'switch','main');const ticketDir=f.dir+'-board-ticket';git(f.dir,'worktree','add',ticketDir,'t/T001-qualification');const b=team.bindings[host].coordinator;assert.ok(b,'Board host trial requires an explicitly bound coordinator');
  const cmd=`node '${path.join(root,'extras/github/board.mjs')}' sync --url '${url}' --repositories '["elartifice/arti-sdd-protocol"]' --issues '["${issue}"]' --authorization 'Owner authorized this shared-repository board verification'`;
  const prompt=`Authorized shared-repository board integration test. Run exactly this helper command once: ${cmd}. It idempotently links only the selected issue and verifies hosted readback. Do not substitute a local board, create another Project, alter permissions, edit files or claim another ticket. Return the command output unchanged.`;
  const argv=host==='claude'?['-p',prompt,'--model',b.model,'--effort',b.effort,'--output-format','stream-json','--verbose','--no-session-persistence','--tools','Bash','--allowedTools',`Bash(${cmd})`,'--strict-mcp-config','--mcp-config','{"mcpServers":{}}']:['-a','never','exec','--strict-config','--json','--sandbox','workspace-write','-c','sandbox_workspace_write.network_access=true','-m',b.model,'-c',`model_reasoning_effort=${JSON.stringify(b.effort)}`,...await trustedFlags(ticketDir),prompt];
  const result=await execute(host,argv,{cwd:ticketDir,timeout:180000});log('board-'+host,result);assert.equal(result.code,0);const events=result.stdout.trim().split('\n').filter(Boolean).map(JSON.parse);
  const body=JSON.parse(nativeCommandOutput(host,events,cmd));assert.equal(body.status,'verified');assert.equal(body.url,url);assert.equal(body.selected_repositories.length,1);assert.equal(git(ticketDir,'status','--porcelain'),'');const before=boardItems(url),owner=crypto.randomUUID();acquireClaim(ticketDir,'T001',owner);fs.writeFileSync(path.join(ticketDir,'src/board.cjs'),'exports.value=42;\n');git(ticketDir,'add','src/board.cjs');git(ticketDir,'commit','-qm','actual disposable board lifecycle work');verifyTicket(ticketDir,'T001','refs/heads/main');const landed=git(ticketDir,'rev-parse','HEAD');git(f.dir,'merge','--ff-only',landed);assert.equal(closeout(ticketDir,'T001',{merge:landed,session:owner}).status,'done');git(f.dir,'worktree','remove',ticketDir);assert.ok(!fs.existsSync(ticketDir));const after=boardItems(url);assert.equal(after.project.id,before.project.id);assert.equal(after.project.url,url);assert.ok(after.items.some(item=>item.content?.url===issue&&!item.isArchived));report.board_runs.push({host,status:'passed',checks:['actual-native-helper-command','selected-upstream-only','idempotent-project-link','hosted-readback','actual-fixture-ticket-landing','claim-release','worktree-removal','same-project-after-native-session-exit-and-cleanup','no-product-mutations'],url,fixture_permissions:'explicit helper authorization; Codex fixture network access'});save();console.log('PASS native hosted board '+host);
 }));
}
async function main() {
 assert.equal(process.platform,'darwin','Native release qualification is currently scoped to macOS');report.clients=versions();
 report.runtime={node:process.version,git:command('git',['--version']).stdout.trim(),macos:command('sw_vers',['-productVersion']).stdout.trim(),arch:process.arch};
 if(target){report.team=validateTeam(readJson(path.join(target,'.agents/team.json')),['claude','codex']);for(const role of report.team.enabled_roles)targetRoles[role]=fs.readFileSync(path.join(target,`.agents/roles/${role}.md`),'utf8');}
 else report.team=await candidateMapping();
 // Partial probes certify only their named surface; the full release gate still
 // requires every catalog role, including the optional researcher.
 if(!target&&(phase==='all'||phase==='native'))assert.deepEqual([...report.team.enabled_roles].sort(),Object.keys(roles).sort(),'Full qualification requires task cases for every catalog role');
 else for(const role of report.team.enabled_roles)assert.ok(Object.hasOwn(roles,role),'Unknown qualified role');
 report.team_fingerprint=teamFingerprint(fixture(report.team).dir,report.team,target?loadConfig(path.join(target,'arti_sdd/config.json')).hosts:['claude','codex']);save();
 if(phase==='all'||phase==='native'){await nativeRoles(report.team);await hookTrials(report.team);await routingGuardTrials(report.team);await resumeTrials(report.team);if(['implementer','scout'].every(r=>report.team.enabled_roles.includes(r)))await handoffTrials(report.team);await chatTrials(report.team);}
 if(phase==='guard')await routingGuardTrials(report.team);
 if(phase==='scout')await nativeRoles(report.team,['scout']);
 if(phase==='researcher')await nativeRoles(report.team,['researcher']);
 if((phase==='all'||phase==='review')&&report.team.enabled_roles.includes('reviewer'))await reviewTrials(report.team);
 if(phase==='all'&&report.team.enabled_roles.includes('reviewer'))await dispatchTrials(report.team);
 if((phase==='all'||phase==='correction')&&report.team.enabled_roles.includes('reviewer'))await correctionTrials(report.team);
 if(phase==='board')await boardTrials(report.team);
 if(phase==='all'||phase==='lifecycle'){await lifecycleTrials(report.team);await draftTrials(report.team);await parallelTrials(report.team);}
 assert.equal(packageDigest(),sourceHash,'Package changed while qualification was running');
 assert.equal(harnessDigest(),harnessHash,'Qualification driver changed during the run');
 report.status=phase==='all'?'passed':'partial';report.finished_at=new Date().toISOString();save();
 if(report.status==='passed'&&!target) {
  assert.equal(report.native_runs.length,report.team.enabled_roles.length*2);assert.equal(report.review_runs.length,14);assert.equal(report.hook_runs.length,2);assert.equal(report.handoffs.length,2);assert.equal(report.chat_runs.length,2);assert.equal(report.dispatch_runs.length,2);assert.equal(report.resume_runs.length,2);assert.equal(report.routing_guard_runs.length,2);assert.equal(report.continuation_runs.length,2);assert.equal(report.naming_runs.length,2);assert.equal(report.correction_runs.length,2);assert.equal(report.lifecycle_runs.length,2);assert.equal(report.parallel_runs.length,1);
  const publicReport=structuredClone(report);for(const row of publicReport.native_runs){delete row.thread_id;delete row.child_thread_id;}delete publicReport.team;
  fs.mkdirSync('docs',{recursive:true});writeJson('docs/qualification.json',publicReport);
  const lines=['# Native qualification','','Date: '+report.finished_at.slice(0,10),`Package SHA256: ${sourceHash}`,'',`Platform: macOS ${report.runtime.macos} ${report.runtime.arch}; ${report.clients.claude}; ${report.clients.codex}; Node ${report.runtime.node}.`,'','This qualifies the named role tasks and stated permission boundaries, not general vendor equivalence. Claude effort is the requested setting: this client exposes no effective-effort telemetry, so effort_verified is false. Codex supplies resolved effort metadata. Raw model logs and fixture paths remain private. Native Codex uses persistent sessions because this client cannot spawn custom agents from an ephemeral parent. Hook tests review and trust only exact fixture hashes for the test process.','', '| Host | Role | Effective model | Effort setting | Result |','|---|---|---|---|---|',...report.native_runs.map(r=>`| ${r.host} | ${r.role} | ${r.model} | ${r.effort} | ${r.status} |`),'',`Cross-lab trials: ${report.review_runs.length}; two distinct seeded defects reviewed three times in each direction, plus a clean control per direction. Production author dispatches: ${report.dispatch_runs.length}, using the qualified opposite lab and canonical production receipts. Native edit and generic-dispatch guards: both hosts actually attempt the forbidden tool call and receive the audited denial. Resumes: ${report.resume_runs.length}; shared handoffs: ${report.handoffs.length}; chat charters: ${report.chat_runs.length}.`,'','Read-only native Codex roles were tested under a read-only parent; custom roles inherit parent permissions. Claude uses native tool permissions and scope hooks, without an OS-sandbox claim. Hook guards do not parse arbitrary shell writes; verified candidate scope remains required.'];fs.writeFileSync('docs/QUALIFICATION.md',lines.join('\n')+'\n');
 }
 console.log(JSON.stringify({status:report.status,package_sha256:sourceHash,native_runs:report.native_runs.length,reviews:report.review_runs.length,hooks:report.hook_runs.length,private_report:path.relative(root,out)}));
}
main().catch(error=>{report.status='failed';report.error=error.message;save();console.error(`FAIL ${error.stack}`);process.exitCode=1;});
