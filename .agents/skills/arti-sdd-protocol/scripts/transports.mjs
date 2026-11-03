import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { invariant,command,redact } from './lib.mjs';

export function execute(executable,argv,{cwd,input='',timeout=180000,env={}}={}) {
  invariant(Number.isInteger(timeout)&&timeout>0&&timeout<=600000,'Invalid process timeout');
  return new Promise(resolve=>{
    let stdout='',stderr='',timed_out=false,too_large=false,spawn_error='';
    const child=spawn(executable,argv,{cwd,env:{...process.env,...env},stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32',windowsHide:true});
    const kill=()=>{try{if(process.platform!=='win32')process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{}};
    const timer=setTimeout(()=>{timed_out=true;kill();},timeout);
    child.stdout.on('data',chunk=>{stdout+=chunk;if(Buffer.byteLength(stdout)>4*1024*1024){too_large=true;kill();}});
    child.stderr.on('data',chunk=>{stderr+=chunk;if(Buffer.byteLength(stderr)>4*1024*1024){too_large=true;kill();}});
    child.on('error',error=>{spawn_error=error.message;});
    child.on('close',code=>{clearTimeout(timer);resolve({code:code??1,stdout,stderr,timed_out,too_large,spawn_error});});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
export function parseClaude(result,{allowSubagents=false}={}) {
  invariant(result.code===0&&!result.timed_out&&!result.too_large,`Claude request failed (${result.timed_out?'timeout':result.too_large?'output limit':`exit ${result.code}`}): ${redact(result.stderr).slice(-500)}`);
  const events=result.stdout.split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return null;}}).filter(Boolean);
  const end=events.filter(x=>x.type==='result').at(-1);invariant(end&&end.subtype==='success'&&!end.is_error,'Claude returned no successful final result');
  const init=events.find(x=>x.type==='system'&&x.subtype==='init');
  const models=Object.keys(end.modelUsage||{}),model=init?.model||'';
  invariant(model&&models.includes(model),'Claude effective model evidence is missing');
  const messages=events.filter(e=>e.type==='assistant'&&!e.parent_tool_use_id),final=messages.filter(e=>e.message?.content?.some(x=>x.type==='text')).at(-1);
  invariant(final?.message?.model===model&&messages.every(e=>e.message?.model===model),'Claude final model differs from initialization');
  invariant(allowSubagents||models.every(m=>m===model),'Unexpected Claude model usage or fallback');
  return {text:typeof end.structured_output==='object'?JSON.stringify(end.structured_output):end.result,model,effort:null,provider:end.modelUsage[model]?.provider||'unknown',events};
}
export function parseCodex(result) {
  invariant(result.code===0&&!result.timed_out&&!result.too_large,`Codex request failed (${result.timed_out?'timeout':result.too_large?'output limit':`exit ${result.code}`}): ${redact(result.stderr).slice(-500)}`);
  const model=result.stderr.match(/^model:\s*(\S+)\s*$/m)?.[1],effort=result.stderr.match(/^reasoning effort:\s*(\S+)\s*$/m)?.[1],provider=result.stderr.match(/^provider:\s*(\S+)\s*$/m)?.[1];
  invariant(model&&effort&&provider,'Codex client-reported model/effort/provider evidence is missing');
  return {text:result.stdout.trim(),model,effort,provider,events:[]};
}
export async function runModel(host,binding,prompt,{repo,input='',timeout=180000,executable=host==='claude'?'claude':'codex',executeFn=execute,commandFn=command}={}) {
  const version=commandFn(executable,['--version']);invariant(version.code===0,`${host} CLI unavailable`);
  let argv,cwd=repo,scratch=null;
  if(host==='claude'){scratch=fs.mkdtempSync(path.join(os.tmpdir(),'arti-review-'));cwd=scratch;argv=['-p',prompt,'--safe-mode','--model',binding.model,'--effort',binding.effort,'--output-format','stream-json','--verbose','--no-session-persistence','--permission-mode','plan','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}'];}
  else if(host==='codex') {
    scratch=fs.mkdtempSync(path.join(os.tmpdir(),'arti-review-'));cwd=scratch;
    argv=['-a','never','exec','--strict-config','--ignore-user-config','--ignore-rules','--skip-git-repo-check','--ephemeral','--sandbox','read-only','--color','never','-m',binding.model,'-c',`model_reasoning_effort=${JSON.stringify(binding.effort)}`,'-c','web_search="disabled"',...['apps','plugins','memories','shell_tool','multi_agent','browser_use','computer_use','image_generation','view_image','workspace_dependencies','skill_mcp_dependency_install'].flatMap(f=>['-c',`features.${f}=false`]),'-'];
  }
  else throw new Error('Unsupported CLI transport');
  let result;try{result=await executeFn(executable,argv,{cwd,input:host==='codex'?`${prompt}\n\n${input}`:input,timeout,env:{ARTI_HEADLESS_REVIEW:'1'}});}finally{if(scratch)fs.rmSync(scratch,{recursive:true,force:true});}
  invariant(!result.spawn_error,`${host} could not start: ${redact(result.spawn_error)}`);
  const parsed=host==='claude'?parseClaude(result):parseCodex(result);
  invariant(parsed.model===binding.effective_model,`Effective model mismatch: expected ${binding.effective_model}, observed ${parsed.model}`);
  if(host==='codex'){invariant(parsed.effort===binding.effort,'Effective reasoning effort mismatch');invariant(parsed.provider==='openai','Codex provider is not qualified as OpenAI');}
  else invariant(parsed.provider==='firstParty','Claude provider is not qualified as Anthropic first party');
  return {...parsed,cli_version:version.stdout.trim(),effort:binding.effort,effort_verified:host==='codex',effort_evidence:host==='codex'?'client-banner':'requested-cli-setting; effective effort not exposed by client',raw:result};
}
