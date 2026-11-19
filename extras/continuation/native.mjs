import fs from 'node:fs';import path from 'node:path';
import {execute,parseClaude} from '../../.agents/skills/arti-sdd-protocol/scripts/transports.mjs';
import {codexRpc} from '../../.agents/skills/arti-sdd-protocol/scripts/check.mjs';
import {fileURLToPath} from 'node:url';
import {invariant,digest,command,args,isMain,cli} from '../../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
import {checkPaths,diffPaths} from '../../.agents/skills/arti-sdd-protocol/scripts/scope.mjs';
import {registerWait,validateNativeOptions,inspectWait,deliverWait,stopWait,monitorWait} from '../../.agents/skills/arti-sdd-protocol/scripts/waits.mjs';
const adapterHash=digest(fs.readFileSync(fileURLToPath(import.meta.url)));
export async function probeNative({repo,host,nativeSession}){
 let model=null,effort=null;const version=command(host,['--version']);invariant(version.code===0,'Native continuation client unavailable');
 if(host==='codex'){const data=await codexRpc(repo,'thread/read',{threadId:nativeSession,includeTurns:false});invariant(data.thread?.id===nativeSession&&fs.realpathSync(data.thread.cwd)===repo,'Codex thread belongs elsewhere');model=data.thread.model;effort=data.thread.reasoningEffort;}
 else{
  // Claude's native transcript is host-specific evidence, never shared memory.
  const projects=path.join(process.env.HOME,'.claude/projects'),key=repo.replace(/[^a-zA-Z0-9]/g,'-'),file=path.join(projects,key,nativeSession+'.jsonl');
  invariant(fs.existsSync(file)&&!fs.lstatSync(file).isSymbolicLink(),'Claude persisted target is unavailable');const events=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);invariant(events.filter(e=>e.sessionId===nativeSession&&e.cwd).at(-1)?.cwd===repo,'Claude session belongs elsewhere');model=events.filter(e=>e.sessionId===nativeSession&&e.type==='assistant'&&!e.parentToolUseID&&/^claude-/.test(e.message?.model||'')).at(-1)?.message.model;
 }
 invariant(typeof model==='string'&&model,'Native effective model metadata missing');
 return {verified:true,model,effort,effort_verified:host==='codex'&&!!effort,client_version:version.stdout.trim(),adapter_sha256:adapterHash,host,native_session:nativeSession,repo_root:repo,kind:'native-persisted-session',automatic:false};
}
export async function resumeNative(record){
 const beforeTarget=await probeNative({repo:record.repo_root,host:record.host,nativeSession:record.native_session});invariant(beforeTarget.adapter_sha256===record.capability.adapter_sha256&&beforeTarget.client_version===record.capability.client_version&&beforeTarget.model===record.capability.model&&beforeTarget.effort===record.capability.effort,'Native client, adapter or model changed; inspect and re-register the selected continuation');
 const nativeOptions=validateNativeOptions(record.host,record.native_options),verification=record.verification;invariant(Array.isArray(verification)&&verification.length&&verification.every(x=>typeof x==='string'),'Explicit approved work-verification command required');
 const prompt=`Resume the existing authorized ticket ${record.ticket}. Wait ${record.id}, delivery ${record.delivery_id}. The prerequisite/reset was verified. Existing approval scope: ${record.authorization}. Continue this bounded task: ${record.task}. Preserve ticket ownership, territory, configured roles and review/landing gates. Report a concrete blocker with an unblock proposal if work cannot finish. Do not broaden scope.`,host=record.host;
 const argv=host==='claude'?['-p',prompt,'--resume',record.native_session,'--output-format','stream-json','--verbose','--permission-mode',nativeOptions.permission_mode,'--permission-prompts','none','--tools',nativeOptions.tools.join(','),...(nativeOptions.allowed_tools?.length?['--allowedTools',nativeOptions.allowed_tools.join(',')]:[]),'--strict-mcp-config','--mcp-config','{"mcpServers":{}}']:['-a','never','exec','resume','--strict-config','--json','-c',`sandbox_mode=${JSON.stringify(nativeOptions.sandbox)}`,'-c',`sandbox_workspace_write.network_access=${nativeOptions.network_access===true}`,...nativeOptions.config.flatMap(c=>['-c',c]),record.native_session,prompt];
 const before=command(verification[0],verification.slice(1),{cwd:record.repo_root,timeout:180000});invariant(before.code!==0,'Acceptance already passes; inspect completion instead of starting duplicate work');
 const result=await execute(host,argv,{cwd:record.repo_root,timeout:240000,env:{ARTI_SESSION_ID:record.session}});invariant(result.code===0,'Native continuation process failed');
 const events=result.stdout.trim().split('\n').filter(Boolean).map(JSON.parse),native=host==='claude'?events.find(e=>e.type==='system'&&e.subtype==='init')?.session_id:events.find(e=>e.type==='thread.started')?.thread_id;
 invariant(native===record.native_session,'Native continuation opened a different session');const changed=diffPaths(record.repo_root,record.head_sha);if(changed.length)checkPaths(record.repo_root,record.ticket,changed);const check=command(verification[0],verification.slice(1),{cwd:record.repo_root,timeout:180000});invariant(check.code===0,'Resumed work failed its explicit acceptance check');
 const afterTarget=await probeNative({repo:record.repo_root,host,nativeSession:native});invariant(afterTarget.model===beforeTarget.model&&afterTarget.effort===beforeTarget.effort,'Native continuation changed the effective model or observable effort');
 return {host,model:afterTarget.model,effort:afterTarget.effort,effort_verified:afterTarget.effort_verified,native_session:native,executed:true,verified_work:true,proof_sha256:digest({stdout:result.stdout,check:{command:verification,stdout:check.stdout,stderr:check.stderr,exit:check.code}})};
}
if(isMain(import.meta.url))cli(async()=>{
 const a=args(process.argv.slice(2),['repo','ticket','session','host','native-session','condition','authorization','task','expires','id','verification','native-options','poll-ms','max-polls']),repo=a.repo||process.cwd();
 if(a._[0]==='register'){console.log(JSON.stringify(await registerWait(repo,{ticket:a.ticket,session:a.session,host:a.host,nativeSession:a['native-session'],condition:JSON.parse(a.condition),authorization:a.authorization,task:a.task,expiresAt:a.expires,verification:JSON.parse(a.verification),nativeOptions:JSON.parse(a['native-options'])},probeNative)));return;}
 if(a._[0]==='stop'){console.log(JSON.stringify(stopWait(repo,a.id,a.session)));return;}
 if(a._[0]==='inspect'){console.log(JSON.stringify(inspectWait(repo,a.id)));return;}
 invariant(a._[0]==='watch','Usage: native.mjs register|watch|inspect|stop');const poll=Number(a['poll-ms']||30000);invariant(poll>=1000&&poll<=60000,'Poll interval must be 1–60 seconds');
 const initial=inspectWait(repo,a.id);if(initial.status!=='registered'){console.log(JSON.stringify(initial));if(initial.status==='delivery-unverified')process.exitCode=1;else if(initial.status==='expired')process.exitCode=2;return;}
 let polls=0;const maxPolls=Number(a['max-polls']||Infinity);invariant(maxPolls>=1,'Invalid poll bound');
 while(inspectWait(repo,a.id).status==='registered'){monitorWait(repo,a.id,a.session);const result=await deliverWait(repo,a.id,r=>resumeNative(r));if(result.status!=='registered'){console.log(JSON.stringify(result));if(result.status==='delivery-unverified')process.exitCode=1;else if(result.status==='expired')process.exitCode=2;break;}if(++polls>=maxPolls){console.log(JSON.stringify({...result,monitor_stopped:true}));break;}await new Promise(resolve=>setTimeout(resolve,poll));}
});
