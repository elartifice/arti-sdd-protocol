import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { invariant,repoInfo,readJson,readText,sessionId,redact,isMain,digest } from './lib.mjs';
import { activeTicket,checkPaths,extractPatch,mapPath } from './scope.mjs';
import { binding,validateTeam,teamOperations } from './team.mjs';

const deny=reason=>({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:`Arti: ${redact(reason)}`}});
const context=(event,text)=>({hookSpecificOutput:{hookEventName:event,additionalContext:text}});
export function checkRoleDispatch(repo,tool,value) {
  const desktop=tool==='collaboration.spawn_agent';
  if(tool==='collaborationspawn_agent')tool='spawn_agent'; // Native Codex hook spelling.
  if(!/(?:^|\.)(?:Agent|spawn_agent)$/.test(tool))return;
  const {root}=repoInfo(repo),config=readJson(path.join(root,'arti_sdd/config.json'));
  if(config.decisions.team!=='custom')return;
  const team=validateTeam(readJson(path.join(root,'.agents/team.json')),config.hosts);
  for(const o of teamOperations(root,team,config.hosts))if(o.kind!=='seed')invariant(fs.existsSync(path.join(root,o.path))&&readText(path.join(root,o.path))===o.content,`Role adapter drift: ${o.path}`);
  const claude=tool.split('.').at(-1)==='Agent';
  if(!claude&&!desktop)invariant(typeof value?.agent_type==='string','Role routing: native Codex requires configured agent_type');
  const name=claude?value?.subagent_type:desktop?value?.task_name:value?.agent_type;
  const role=typeof name==='string'?(team.enabled_roles.find(r=>name===`arti_${r}`||(desktop&&new RegExp(`^arti_${r}_[a-f0-9]{8}$`).test(name)))||''):'';
  invariant(team.enabled_roles.includes(role),'Role routing: select a configured arti_<role>; generic inherited-model dispatch is not a configured role');
  const b=binding(team,claude?'claude':'codex',role);
  if(desktop) {
    invariant(value.fork_turns==='none'&&value.model===b.model&&value.reasoning_effort===b.effort,'Role routing: desktop needs a fresh context and explicit configured model/effort');
    invariant(typeof value.message==='string'&&value.message.includes(readText(path.join(root,`.agents/roles/${role}.md`))),'Role routing: desktop dispatch is missing the shared role instructions');
  } else {
    if(!claude)invariant(value.fork_turns==='none','Role routing: Codex named roles require a fresh context');
    if(value.model!==undefined)invariant([b.model,b.effective_model].includes(value.model),'Role routing: model override differs from the configured role');
    for(const key of ['effort','reasoning_effort'])if(value[key]!==undefined)invariant(value[key]===b.effort,'Role routing: effort override differs from the configured role');
  }
}
export function evaluateHook(action,input,env=process.env) {
  try {
    invariant(input&&typeof input==='object','Malformed hook input');
    if(action==='pre')checkRoleDispatch(input.cwd||process.cwd(),String(input.tool_name||''),input.tool_input);
    if(action==='start') {
      if(env.ARTI_HEADLESS_REVIEW==='1')return {};
      const info=repoInfo(input.cwd||process.cwd());
      const memory=path.join(info.root,'.agents/memory/INDEX.md');
      const knowledge=fs.existsSync(memory)?readText(memory).slice(0,4000):'Shared knowledge index is missing; report it.';
      return context('SessionStart',`Read AGENTS.md and the active ticket/spec. ${knowledge}\nCoordination session: ${env.ARTI_SESSION_ID||input.session_id||'unavailable; obtain the native session ID before claiming'}. Use this exact ID for claims and locks; delegated CLI processes inherit it through ARTI_SESSION_ID.\nOn first interactive orientation without a concrete task, recommend ready work. On an active task, direct ticket request, resume, compaction or repeated delivery, preserve the task and prior approvals and continue authorised work. Headless review skips orientation only.`);
    }
    if(action==='stop') {
      if(input.stop_hook_active||env.ARTI_HEADLESS_REVIEW==='1')return {};
      const info=repoInfo(input.cwd||process.cwd()),file=path.join(info.state,'locks/landing.json');
      if(fs.existsSync(file)){const session=env.ARTI_SESSION_ID||input.session_id;invariant(session,'Missing Stop session identity');if(readJson(file).session===session)return {decision:'block',reason:'Release your landing lock or record an explicit handoff before stopping.'};}
      return {};
    }
    invariant(action==='pre','Unknown hook action');
    const tool=input.tool_name||'',edit=/^(Edit|Write|MultiEdit|NotebookEdit|apply_patch|write_file|edit_file)$/.test(tool),shell=/^(Bash|exec_command|shell_command)$/.test(tool);
    if(!edit&&!shell)return {};
    const value=input.tool_input,command=typeof value==='string'?value:value?.command??value?.cmd??'';
    let paths=[];
    if(tool==='apply_patch')paths=extractPatch(command);
    else if(edit) {
      for(const item of [value,...(Array.isArray(value?.edits)?value.edits:[]),...(Array.isArray(value?.files)?value.files:[])])if(item&&typeof item==='object')for(const key of ['file_path','path','notebook_path'])if(typeof item[key]==='string')paths.push(item[key]);
      invariant(paths.length>0,'Edit tool supplied no parseable paths');
    } else if(/(?:^|\n|&&|;)\s*apply_patch(?:\s|$)/.test(command))paths=extractPatch(command);
    else return {}; // Arbitrary shell writes are covered by commit/land checks, not a shell parser.
    const info=repoInfo(input.cwd||process.cwd()),hostRoot=path.resolve(env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'));
    const nativeBases=[path.join(hostRoot,'projects',info.root.replace(/[^A-Za-z0-9]/g,'-'),'memory'),...(input.permission_mode==='plan'?[path.join(hostRoot,'plans')]:[])];
    if(['Write','Edit'].includes(tool)&&paths.every(p=>{
      const absolute=path.resolve(input.cwd||process.cwd(),p),base=nativeBases.find(b=>path.dirname(absolute)===b);
      if(!base||!absolute.endsWith('.md')||!fs.existsSync(base)||fs.realpathSync(base)!==base)return false;
      try{return !fs.lstatSync(absolute).isSymbolicLink();}catch(e){return e.code==='ENOENT';}
    }))return {}; // Native scratch/cache only; durable project knowledge stays shared.
    const session=sessionId(env.ARTI_SESSION_ID||input.session_id,env),ticket=activeTicket(info.root,session);
    if(!ticket) {
      for(const p of paths) {
        const m=mapPath(info.root,p,input.cwd||info.root);
        const mint=m.relative.match(/^arti_sdd\/tickets\/(T\d{3,6})(?:-[^/]+)?\.md$/);
        invariant(mint,'NO_TICKET_CLAIMED');
        const record=path.join(info.state,'claims',`${mint[1]}.json`);
        invariant(!fs.existsSync(record)||readJson(record).session===session,'Ticket is claimed by another session');
      }
      return {};
    }
    checkPaths(info.root,ticket,paths,{cwd:input.cwd||info.root});
    return {};
  }catch(error) {
    if(action==='start')return context('SessionStart',`Arti orientation unavailable: ${redact(error.message)}. Preserve the active task and authorisation; report the missing check.`);
    if(action==='stop')return {decision:'block',reason:`Arti stop check unavailable: ${redact(error.message)}`};
    return deny(error.message);
  }
}
export async function runHook(action) {
  let raw='';for await(const chunk of process.stdin)raw+=chunk;
  let output,input;try{input=JSON.parse(raw||'{}');output=evaluateHook(action,input);}catch{output=action==='pre'?deny('Malformed hook JSON'):action==='stop'?{decision:'block',reason:'Malformed stop hook input; landing lock check unavailable'}:context('SessionStart','Hook input unavailable; preserve the active task.');}
  if(process.env.ARTI_HOOK_AUDIT_FILE&&input) {
    try{const info=repoInfo(input.cwd||process.cwd()),file=path.resolve(process.env.ARTI_HOOK_AUDIT_FILE);invariant(file.startsWith(info.state+path.sep),'Hook audit must stay in private runtime state');fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});invariant(!fs.existsSync(file)||!fs.lstatSync(file).isSymbolicLink(),'Audit link refused');fs.appendFileSync(file,JSON.stringify({at:new Date().toISOString(),action,session:process.env.ARTI_SESSION_ID||input.session_id,tool:input.tool_name||null,target:input.tool_input?.file_path||input.tool_input?.path||input.tool_input?.notebook_path||null,input_sha256:digest(raw),decision:output.hookSpecificOutput?.permissionDecision||'allow',reason:output.hookSpecificOutput?.permissionDecisionReason||null})+'\n',{mode:0o600});}catch(error){if(action==='pre')output=deny(`Required audit failed: ${error.message}`);}
  }
  process.stdout.write(JSON.stringify(output)+'\n');
}
export function hookCommand(action) {
  invariant(['pre','start','stop'].includes(action),'Invalid hook action');
  const fallback=action==='pre'?deny('Required hook module could not load'):action==='stop'?{decision:'block',reason:'Required stop check could not load'}:context('SessionStart','Arti orientation code missing; report the missing check without resetting the active task.');
  const code=`const ARTI_SDD_HOOK_VERSION=1;try{const p=require('node:child_process').execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();import(require('node:url').pathToFileURL(require('node:path').join(p,'.agents/skills/arti-sdd-protocol/scripts/hooks.mjs')).href).then(m=>m.runHook('${action}')).catch(()=>process.stdout.write(${JSON.stringify(JSON.stringify(fallback)+'\n')}));}catch{process.stdout.write(${JSON.stringify(JSON.stringify(fallback)+'\n')});}`;
  return `node -e '${code.replace(/'/g,"'\\''")}'`;
}
export function ownedHooks(text) {
  const obj=JSON.parse(text),result={};invariant(!obj.hooks||typeof obj.hooks==='object'&&!Array.isArray(obj.hooks),'Invalid hooks object');
  for(const [event,blocks]of Object.entries(obj.hooks||{})) {
    invariant(Array.isArray(blocks),`Invalid hook groups for ${event}`);
    for(const block of blocks) {
      invariant(Array.isArray(block.hooks),'Invalid hook handlers');
      const mine=block.hooks.filter(h=>typeof h.command==='string'&&h.command.includes('ARTI_SDD_HOOK_VERSION=1'));
      const ambiguous=block.hooks.some(h=>typeof h.command==='string'&&h.command.includes('arti-sdd-protocol/scripts/hooks.mjs')&&!h.command.includes('ARTI_SDD_HOOK_VERSION=1'));
      invariant(!ambiguous&&(!mine.length||mine.length===block.hooks.length),'Ambiguous mixed protocol hook block');
      if(mine.length)(result[event]??=[]).push(block);
    }
  }
  return result;
}
export function mergeHooks(text='{}') {
  const obj=JSON.parse(text),old=ownedHooks(text);obj.hooks??={};
  for(const event of Object.keys(old))obj.hooks[event]=obj.hooks[event].filter(b=>!old[event].includes(b)&&!b.hooks.some(h=>h.command?.includes('ARTI_SDD_HOOK_VERSION=1')));
  for(const [event,action,matcher]of [['SessionStart','start',''],['PreToolUse','pre','Edit|Write|MultiEdit|NotebookEdit|apply_patch|Bash|Agent|spawn_agent|collaboration.spawn_agent|collaborationspawn_agent'],['Stop','stop','']]) {
    (obj.hooks[event]??=[]).push({matcher,hooks:[{type:'command',command:hookCommand(action),timeout:10}]});
  }
  return JSON.stringify(obj,null,2)+'\n';
}
export function codexConfig(text='',maxConcurrent=null) {
  invariant(!/^\s*(?:features|agents)\s*(?:=|\.)/m.test(text),'Inline/dotted native features or agents need reconciliation to equivalent explicit TOML tables before setup');
  const newline=text.includes('\r\n')?'\r\n':'\n',lines=text.split(/\r?\n/);
  const header=line=>line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/)?.[1]?.trim();
  function section(name) {
    const starts=lines.flatMap((line,i)=>header(line)===name?[i]:[]);invariant(starts.length<=1,`Duplicate Codex ${name} table`);
    if(!starts.length){if(lines.at(-1)!=='')lines.push('');lines.push(`[${name}]`);return {start:lines.length-1,end:lines.length};}
    const start=starts[0],next=lines.findIndex((line,i)=>i>start&&header(line));return {start,end:next<0?lines.length:next};
  }
  let s=section('features'),rows=lines.flatMap((line,i)=>i>s.start&&i<s.end&&/^\s*hooks\s*=/.test(line)?[i]:[]);
  invariant(rows.length<=1,'Duplicate Codex hook feature');
  if(rows.length)invariant(/^\s*hooks\s*=\s*true(?:\s*#.*)?\s*$/.test(lines[rows[0]]),'Codex hooks are explicitly disabled or unsupported; reconcile the owner choice');
  else lines.splice(s.start+1,0,'hooks = true');
  if(maxConcurrent!==null) {
    s=section('agents');rows=lines.flatMap((line,i)=>i>s.start&&i<s.end&&/^\s*max_concurrent_threads_per_session\s*=/.test(line)?[i]:[]);
    invariant(rows.length<=1,'Duplicate agent concurrency setting');const value=`max_concurrent_threads_per_session = ${maxConcurrent}`;
    if(rows.length)lines[rows[0]]=value;else lines.splice(s.start+1,0,value);
  }
  return lines.join(newline);
}
if(isMain(import.meta.url))runHook(process.argv[2]||'pre');
