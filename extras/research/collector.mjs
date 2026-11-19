import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {invariant,digest,isMain,args,cli} from '../../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';

export const PIN='f32f4402bc0d5526495f37e236411d0ff0256376';
export const SOURCES=['reddit','x','youtube','hackernews','github'];
function git(root,...argv){const r=spawnSync('git',['-C',root,...argv],{encoding:'utf8'});invariant(r.status===0,'Collector Git inspection failed');return r.stdout.trim();}
export function collectorPlan(root,topic,{days=90,sources=SOURCES}={}){
 invariant(typeof topic==='string'&&topic.trim()&&topic.length<=2000,'A bounded research topic is required');
 invariant(Number.isInteger(days)&&days>=1&&days<=90,'Collector window must be 1..90 days');
 invariant(Array.isArray(sources)&&sources.length&&sources.every(s=>SOURCES.includes(s))&&new Set(sources).size===sources.length,'Unsupported collector source');
 root=fs.realpathSync(root);invariant(git(root,'rev-parse','HEAD')===PIN,'Collector revision differs from reviewed pin');
 invariant(git(root,'status','--porcelain','--untracked-files=all')==='','Collector checkout must be clean');
 const script=path.join(root,'skills/last30days/scripts/last30days.py');
 invariant(fs.existsSync(script)&&!fs.lstatSync(script).isSymbolicLink(),'Collector entry must be regular content');
 return {repository:'https://github.com/mvanhorn/last30days-skill',revision:PIN,root,script,days,sources,topic,argv:[script,'--research-only','--lookback-days',String(days),'--search',sources.join(','),'--emit','json','--json-profile','raw','--no-browser-cookies','--',topic]};
}
export function collectorReceipt(plan,raw){
 invariant(raw&&typeof raw==='object'&&!Array.isArray(raw),'Invalid collector report');
 invariant(raw.topic===plan.topic,'Collector topic differs from request');
 const span=(Date.parse(raw.range_to)-Date.parse(raw.range_from))/86400000;
 invariant(Number.isFinite(span)&&span===plan.days,'Collector window differs from request');
 invariant(raw.source_status&&typeof raw.source_status==='object'&&!Array.isArray(raw.source_status),'Collector report lacks actual source status');
 const states=['ok','no-results','partial','rate-limited','auth-failed','payment-required','unreachable','timeout','schema-drift','skipped-unconfigured','error'];
 for(const [source,outcome] of Object.entries(raw.source_status))invariant(outcome&&outcome.source===source&&states.includes(outcome.state)&&typeof outcome.attempted==='boolean'&&Number.isInteger(outcome.items_returned)&&outcome.items_returned>=0,'Malformed collector source outcome');
 return {schema_version:1,collector_revision:PIN,requested_days:plan.days,requested_sources:plan.sources,actual_window:{from:raw.range_from,to:raw.range_to},coverage:raw.source_status,all_sources_responded:plan.sources.every(s=>raw.source_status[s]?.attempted&&['ok','no-results'].includes(raw.source_status[s]?.state)),historical_completeness:'not-established',report:raw,report_sha256:digest(raw)};
}
export function collect(plan,{python,timeout=180000}={}){
 invariant(python&&path.isAbsolute(python),'Pass the reviewed absolute Python 3.12+ executable');
 invariant(Number.isInteger(timeout)&&timeout>=1000&&timeout<=300000,'Invalid collector timeout');
 const fresh=collectorPlan(plan.root,plan.topic,{days:plan.days,sources:plan.sources});
 invariant(digest(fresh)===digest(plan),'Collector plan changed');
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'arti-research-'));
 try{
  // No inherited credentials, project/global configuration, Keychain or pass(1).
  // This is an environment boundary, not an OS sandbox. Source access can fail.
  const env={PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'en_US.UTF-8',LAST30DAYS_CONFIG_DIR:'',LAST30DAYS_SKIP_KEYCHAIN:'1',LAST30DAYS_MEMORY_DIR:cwd,LAST30DAYS_STORE:'0',FROM_BROWSER:'off',BROWSER_CONSENT:'false',REDDIT_BROWSER_CONSENT:'false',AGENTCOOKIE:'off',PYTHONDONTWRITEBYTECODE:'1'};
  const r=spawnSync(python,plan.argv,{cwd,env,encoding:'utf8',timeout,maxBuffer:4*1024*1024});
  invariant(r.status===0&&!r.error,'Collector failed or timed out; no complete research receipt');
  return collectorReceipt(plan,JSON.parse(r.stdout));
 }finally{fs.rmSync(cwd,{recursive:true,force:true});}
}
if(isMain(import.meta.url))cli(()=>{const a=args(process.argv.slice(2),['collector','topic','days']);console.log(JSON.stringify(collectorPlan(a.collector,a.topic,{days:a.days?Number(a.days):90}),null,2));});
