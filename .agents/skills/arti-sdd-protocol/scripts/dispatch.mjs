import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { invariant,readJson,readText,digest,repoInfo,isMain,cli } from './lib.mjs';
import { roles,validateTeam,binding,teamOperations,teamFingerprint } from './team.mjs';
import { codexRpc } from './check.mjs';

// A plan contains private task text. It is a reproducible request, not an attestation.
export function planDispatch(repo,options) {
  invariant(options&&typeof options==='object'&&!Array.isArray(options),'Missing dispatch options');
  for(const key of Object.keys(options))invariant(['host','role','surface','task','assignedFiles','dispatchId'].includes(key),`Unknown dispatch option ${key}`);
  const {host,role,surface,task,assignedFiles=[],dispatchId=crypto.randomUUID()}=options,root=repoInfo(repo).root;
  invariant((surface==='claude-agent'&&host==='claude')||(['codex-agent','codex-collaboration'].includes(surface)&&host==='codex'),'Unsupported surface or wrong host');
  invariant(typeof role==='string'&&Object.hasOwn(roles,role),'Unknown role');
  invariant(typeof task==='string'&&task.trim().length>0,'Missing task');
  invariant(typeof dispatchId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(dispatchId),'Invalid dispatch ID');
  invariant(Array.isArray(assignedFiles)&&assignedFiles.every(p=>typeof p==='string'&&p.length>0&&!path.posix.isAbsolute(p)&&!path.win32.isAbsolute(p)&&!p.includes('\\')&&!/^[A-Za-z]:/.test(p)&&p.split('/').every(segment=>segment&&segment!=='.'&&segment!=='..')&&!/[\r\n\0]/.test(p))&&new Set(assignedFiles).size===assignedFiles.length,'Invalid assigned files');
  const write=roles[role].permission==='assigned';
  invariant(write?assignedFiles.length>0:assignedFiles.length===0,write?'Writable roles require assigned files':'Read-only roles cannot receive assigned files');
  const config=readJson(path.join(root,'arti_sdd/config.json')),team=readJson(path.join(root,'.agents/team.json'));
  invariant(Array.isArray(config.hosts)&&config.hosts.includes(host),'Host is not enabled');
  validateTeam(team,config.hosts);invariant(team.enabled_roles.includes(role),'Role is disabled');
  for(const op of teamOperations(root,team,config.hosts))invariant(fs.existsSync(path.join(root,op.path))&&readText(path.join(root,op.path))===op.content,`Team adapter drift: ${op.path}`);
  const b=binding(team,host,role),rolePath=`.agents/roles/${role}.md`,nativePath=host==='claude'?`.claude/agents/arti_${role}.md`:`.codex/agents/arti_${role}.toml`,source=readText(path.join(root,rolePath));
  const dossier=`ROUTING: ${role} because this task is assigned to the ${role} role.\nDISPATCH_ID: ${dispatchId}\nREPOSITORY: ${root}\nAssigned paths resolve relative to REPOSITORY.\n\nTASK:\n${task}\n\nASSIGNED_FILES_EXCLUSIVE: ${write?JSON.stringify(assignedFiles):'none; do not write files'}\n\nPreserve the parent permissions. Report actual verification and modified files. In a final JSON report include \"dispatch_id\": \"${dispatchId}\"; for a plain report include the line DISPATCH_ID: ${dispatchId}.`;
  const identity=`arti_${role}`;
  const invocation=surface==='claude-agent'?{tool:'Agent',args:{subagent_type:identity,description:`Execute ${role} task`,prompt:dossier}}:surface==='codex-agent'?{tool:'spawn_agent',args:{agent_type:identity,task_name:`${identity}_${dispatchId.slice(0,8)}`,fork_turns:'none',message:dossier}}:{tool:'collaboration.spawn_agent',args:{task_name:`${identity}_${dispatchId.slice(0,8)}`,fork_turns:'none',model:b.model,reasoning_effort:b.effort,message:`SHARED ROLE SOURCE (${rolePath}):\n${source}\n\n${dossier}`}};
  return {schema_version:1,repo:root,host,role,surface,task,assignedFiles,dispatchId,invocation,expected:{model:b.effective_model,requested_model:b.model,effort:b.effort,native_identity:surface==='codex-collaboration'?null:identity,profile_identity:surface==='codex-collaboration'?'unsupported':'native',permissions:'inherited from parent',effort_verified:host==='codex'},sources:{team_sha256:digest(readText(path.join(root,'.agents/team.json'))),role_sha256:digest(source),native_sha256:digest(readText(path.join(root,nativePath))),team_fingerprint:teamFingerprint(root,team,config.hosts)}};
}

function rolloutEvents(thread) {
  const base=fs.realpathSync(path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'sessions'));
  invariant(typeof thread.path==='string'&&path.isAbsolute(thread.path),'Missing native rollout path');
  const file=fs.realpathSync(thread.path),relative=path.relative(base,file);
  invariant(relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative),'Native rollout path escapes Codex sessions');
  invariant(fs.statSync(file).isFile()&&fs.statSync(file).size<=64*1024*1024,'Invalid native rollout file');
  return fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
}

function reportHasId(text,id) {
  if(typeof text!=='string')return false;
  try {if(JSON.parse(text)?.dispatch_id===id)return true;}catch {}
  const blocks=[...text.matchAll(/```json[ \t]*\r?\n([\s\S]*?)\r?\n```/g)];
  if(blocks.length===1&&text.trimEnd().endsWith(blocks[0][0])){try{if(JSON.parse(blocks[0][1])?.dispatch_id===id)return true;}catch {}}
  return text.split(/\r?\n/).some(line=>line.trim()===`DISPATCH_ID: ${id}`);
}

export async function verifyDispatch(plan,evidence,{readThread=(repo,id)=>codexRpc(repo,'thread/read',{threadId:id,includeTurns:true}),readRollout=rolloutEvents}={}) {
  invariant(plan&&plan.schema_version===1,'Invalid dispatch plan');
  const fresh=planDispatch(plan.repo,{host:plan.host,role:plan.role,surface:plan.surface,task:plan.task,assignedFiles:plan.assignedFiles,dispatchId:plan.dispatchId});
  invariant(digest(plan)===digest(fresh),'Dispatch plan or source fingerprint changed');
  const expected=fresh.expected;
  if(plan.host==='codex') {
    invariant(evidence&&typeof evidence==='object'&&!Array.isArray(evidence)&&Object.keys(evidence).length===1&&typeof evidence.threadId==='string'&&evidence.threadId.length>0,'Codex evidence must contain only threadId');
    const loaded=await readThread(fresh.repo,evidence.threadId),thread=loaded?.thread;
    invariant(thread?.id===evidence.threadId,'Native thread ID mismatch');
    invariant(digest(plan)===digest(planDispatch(plan.repo,{host:plan.host,role:plan.role,surface:plan.surface,task:plan.task,assignedFiles:plan.assignedFiles,dispatchId:plan.dispatchId})),'Dispatch plan or source fingerprint changed');
    invariant(thread&&typeof thread==='object'&&!Array.isArray(thread),'Missing native Codex thread/read evidence');
    invariant(thread.forkedFromId==null,'Codex child is not fresh');
    invariant(thread.model===expected.model&&thread.reasoningEffort===expected.effort,'Codex effective model or effort mismatch');
    invariant(thread.modelProvider==='openai','Codex provider mismatch');
    invariant(typeof thread.id==='string'&&thread.id.length>0&&typeof thread.parentThreadId==='string'&&thread.parentThreadId.length>0&&Array.isArray(thread.turns)&&thread.turns.at(-1)?.status==='completed'&&Array.isArray(thread.turns.at(-1)?.items)&&thread.turns.at(-1).items.length>0,'Missing completed native child thread evidence');
    if(plan.surface==='codex-collaboration')invariant(thread.agentRole===null,'Desktop native profile identity is unsupported');
    if(plan.surface==='codex-agent')invariant(thread.agentRole===expected.native_identity,'Codex native agent role mismatch');
    const rollout=await readRollout(thread);
    invariant(Array.isArray(rollout),'Invalid native rollout');
    invariant(rollout[0]?.type==='session_meta'&&rollout[0]?.payload?.id===thread.id,'Native rollout session ID mismatch');
    invariant(rollout.filter(e=>e.type==='session_meta').length===1,'Foreign session metadata in rollout');
    const meta=rollout[0].payload;invariant(meta.forked_from_id==null,'Codex rollout is not fresh');
    const spawn=meta.source?.subagent?.thread_spawn,agentPath=spawn?.agent_path||meta.agent_path;
    invariant(meta.parent_thread_id===thread.parentThreadId&&(!spawn?.parent_thread_id||spawn.parent_thread_id===thread.parentThreadId)&&typeof agentPath==='string'&&agentPath.endsWith('/'+fresh.invocation.args.task_name),'Native child path or parent mismatch');
    if(meta.agent_path&&spawn?.agent_path)invariant(meta.agent_path===spawn.agent_path,'Native child paths disagree');
    const messages=thread.turns.at(-1).items.filter(i=>i.type==='agentMessage'&&typeof i.text==='string');
    const final=messages.at(-1)?.text||'',id=plan.dispatchId;
    invariant(reportHasId(final,id),'Final child report dispatch ID missing');
    const turnIds=new Set(thread.turns.map(t=>t.id).filter(id=>typeof id==='string'&&id.length>0));
    const contexts=rollout.filter(e=>e.type==='turn_context');
    invariant(contexts.every(e=>turnIds.has(e.payload?.turn_id)),'Foreign turn context in rollout');
    invariant(contexts.length>0,'Missing native child turn context');
    for(const e of contexts) {invariant(e.payload?.model===expected.model,'Rollout model mismatch');invariant(e.payload?.effort===expected.effort,'Rollout effort mismatch');}
    return {status:'verified',model:thread.model,effort:thread.reasoningEffort,effort_verified:true,profile_identity:expected.profile_identity,native_identity:expected.native_identity,permissions:expected.permissions,source:'native-thread-read-and-rollout-with-reported-dispatch-id',task_correlated:true,task_payload_verified:false,task_payload_evidence:'Native delegated message is sealed; correlation uses child path and completed report nonce',fresh_context_verified:true,role_source_verified:plan.surface==='codex-agent',role_source_evidence:plan.surface==='codex-agent'?'native profile identity and adapter hash':'planned argument; delivery not exposed'};
  }
  const events=Array.isArray(evidence)?evidence:evidence?.events;
  invariant(Array.isArray(events),'Missing Claude stream-json events');
  const calls=events.filter(e=>e.type==='assistant'&&!e.parent_tool_use_id).flatMap(e=>e.message?.content||[]).filter(c=>c.type==='tool_use'&&c.name==='Agent');
  invariant(calls.length>0&&calls.every(c=>c.input?.subagent_type===expected.native_identity),'Claude Agent call identity mismatch');
  invariant(calls.every(c=>typeof c.id==='string'&&c.id.length>0),'Missing Claude Agent call ID');
  invariant(calls.every(c=>c.input?.prompt===fresh.invocation.args.prompt&&(c.input.model===undefined||c.input.model===expected.requested_model)&&(c.input.effort===undefined||c.input.effort===expected.effort)),'Claude Agent prompt or binding mismatch');
  const end=events.filter(e=>e.type==='result').at(-1);
  invariant(end?.subtype==='success'&&!end.is_error&&end.modelUsage?.[expected.model]?.provider==='firstParty','Claude child model usage missing');
  for(const call of calls) {
    const children=events.filter(e=>e.type==='assistant'&&e.parent_tool_use_id===call.id);
    invariant(children.length>0&&children.every(e=>e.message?.model===expected.model),'Claude child message model mismatch');
    const results=events.filter(e=>e.type==='user').flatMap(e=>e.message?.content||[]).filter(c=>c.type==='tool_result'&&c.tool_use_id===call.id);
    invariant(results.length>0&&results.every(r=>!r.is_error),'Claude Agent tool result missing or failed');
    const childText=children.flatMap(e=>e.message?.content||[]).filter(c=>c.type==='text').at(-1)?.text;
    const handbacks=results.flatMap(r=>typeof r.content==='string'?[r.content]:(Array.isArray(r.content)?r.content.filter(c=>c.type==='text').map(c=>c.text):[])).map(text=>{const marker='The report follows:\n',at=text.indexOf(marker);if(at<0)return '';const lines=[];for(const line of text.slice(at+marker.length).split('\n')){if(!line.startsWith('  '))break;lines.push(line.slice(2));}return lines.join('\n');});
    invariant(reportHasId(childText,plan.dispatchId)||handbacks.some(text=>reportHasId(text,plan.dispatchId)),'Claude completed child report dispatch ID missing');
  }
  return {status:'verified',model:expected.model,effort:expected.effort,effort_verified:false,profile_identity:'native',native_identity:expected.native_identity,permissions:expected.permissions,source:'trusted-local-Claude-stream-json-log',evidence_limitation:'Local log is not a signed attestation',task_correlated:true};
}

if(isMain(import.meta.url))cli(async()=>{
  const argv=process.argv.slice(2),operation=argv.shift(),values={},assigned=[];
  for(let i=0;i<argv.length;i++) {const flag=argv[i];invariant(flag.startsWith('--')&&['--repo','--host','--surface','--role','--task-file','--assigned','--plan','--evidence'].includes(flag),`Unknown argument ${flag}`);invariant(i+1<argv.length&&!argv[i+1].startsWith('--'),`Missing ${flag} value`);const value=argv[++i];if(flag==='--assigned')assigned.push(value);else {invariant(!Object.hasOwn(values,flag),`Repeated ${flag}`);values[flag]=value;}}
  if(operation==='plan') {invariant(!values['--plan']&&!values['--evidence']&&values['--task-file'],'Invalid plan arguments');console.log(JSON.stringify(planDispatch(values['--repo']||process.cwd(),{host:values['--host'],surface:values['--surface'],role:values['--role'],task:readText(values['--task-file']),assignedFiles:assigned})));}
  else if(operation==='verify') {invariant(values['--plan']&&values['--evidence']&&Object.keys(values).length===2&&!assigned.length,'Invalid verify arguments');console.log(JSON.stringify(await verifyDispatch(readJson(values['--plan']),readJson(values['--evidence']))));}
  else throw new Error('Expected plan or verify');
});
