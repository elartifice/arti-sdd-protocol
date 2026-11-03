import { spawn } from 'node:child_process';
import { invariant,args,isMain,cli,repoInfo,readJson,version } from './lib.mjs';
import { checkSetup } from './setup.mjs';
import { inspectTeam } from './team.mjs';
import path from 'node:path';

export async function codexRpc(repo,method,params,{config=[]}={}) {
  const child=spawn('codex',['app-server','--stdio',...config.flatMap(value=>['-c',value])],{cwd:repo,stdio:['pipe','pipe','pipe'],windowsHide:true});
  let buffer='',stderr='',next=1;const pending=new Map();
  child.stderr.on('data',chunk=>{if(stderr.length<2000)stderr+=chunk;});
  child.stdout.on('data',chunk=>{
    buffer+=chunk;
    while(buffer.includes('\n')){const at=buffer.indexOf('\n'),line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const message=JSON.parse(line);if(pending.has(message.id)){const p=pending.get(message.id);pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(new Error(message.error.message)):p.resolve(message.result);}}catch{}}
  });
  const request=(name,value)=>new Promise((resolve,reject)=>{const id=next++,timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Codex ${name} timed out`));},15000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method:name,params:value})+'\n');});
  child.on('error',error=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();});
  child.on('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Codex app-server closed before verification'));}pending.clear();});
  try {await request('initialize',{clientInfo:{name:'arti-protocol-check',version},capabilities:{experimentalApi:true}});return await request(method,params);}finally{child.kill('SIGTERM');}
}
export async function inspectCodexHooks(repo,options={}) {
  const {root}=repoInfo(repo),result=await codexRpc(root,'hooks/list',{cwds:[root]},options);
  const data=result.data?.find(d=>d.cwd===root);invariant(data,'No native Codex hook report');
  invariant(!data.errors?.length,'Codex reported invalid hook sources');
  const hooks=data.hooks.filter(h=>h.source==='project'&&h.command?.includes('ARTI_SDD_HOOK_VERSION=1'));
  const expected=['preToolUse','sessionStart','stop'];
  const missing=expected.filter(event=>!hooks.some(h=>h.eventName===event&&h.enabled&&h.trustStatus==='trusted'));
  return {status:missing.length?'needs-trust-or-repair':'trusted',events:hooks.map(h=>({event:h.eventName,enabled:h.enabled,trust:h.trustStatus})),missing,live_verified:false};
}
if(isMain(import.meta.url))cli(async()=>{
  const a=args(process.argv.slice(2),['repo','native','require-live']),repo=a.repo||process.cwd(),report=checkSetup(repo),config=readJson(path.join(repoInfo(repo).root,'arti_sdd/config.json'));
  if(config.decisions.team==='custom')report.team=inspectTeam(repo,{requireLive:!!a['require-live']});
  if(a.native==='codex'){report.codex_hooks=await inspectCodexHooks(repo);if(report.codex_hooks.missing.length)process.exitCode=1;}
  else invariant(!a.native,'Only native Codex hook inspection is available here; run the documented Claude edit probes');
  console.log(JSON.stringify(report,null,2));
});
