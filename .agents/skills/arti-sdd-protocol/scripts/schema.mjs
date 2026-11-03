import fs from 'node:fs';
import { invariant, readText, args, isMain, cli } from './lib.mjs';

const object=(x,name)=>invariant(x&&typeof x==='object'&&!Array.isArray(x),`${name} must be an object`);
function keys(value, allowed, name, required=allowed) {
  object(value,name);
  for(const k of Object.keys(value))invariant(allowed.includes(k),`Unknown ${name}.${k}`);
  for(const k of required)invariant(Object.hasOwn(value,k),`Missing ${name}.${k}`);
}
const member=(x,allowed,name)=>invariant(allowed.includes(x),`Invalid or undecided ${name}: ${JSON.stringify(x)}`);
export function validateConfig(config,{draft=false}={}) {
  keys(config,['schema_version','project','facts','hosts','decisions','notes','deferred','default_branch'],'config',['schema_version','project','facts','hosts','decisions']);
  invariant(config.schema_version===2,'Unsupported schema_version; migrate the old charter explicitly');
  invariant(typeof config.project==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(config.project),'Invalid project slug');
  if(Object.hasOwn(config,'default_branch'))invariant(typeof config.default_branch==='string'&&/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(config.default_branch)&&!config.default_branch.includes('..')&&!/^(t|refs)\//.test(config.default_branch),'Invalid integration branch');
  keys(config.facts,['has_ui','deploys','uses_llm'],'facts');
  for(const [k,v]of Object.entries(config.facts))invariant(typeof v==='boolean'||(draft&&v===null),`facts.${k} must be a confirmed boolean`);
  invariant(Array.isArray(config.hosts)&&config.hosts.length>0&&new Set(config.hosts).size===config.hosts.length,'hosts must be a nonempty unique list');
  for(const h of config.hosts)member(h,['claude','codex','other'],'host');
  const d=config.decisions;
  keys(d,['merge','planning','qa','team','review','review_risks','board'],'decisions');
  for(const[k,choices]of Object.entries({merge:['manual','auto'],planning:['committed'],qa:['checks','checklist','recorded'],team:['single','custom'],review:['required','risk','opportunistic','disabled'],board:['markdown','visual']})) {
    if(draft&&d[k]===null)continue;
    member(d[k],choices,`decisions.${k}`);
  }
  invariant(Array.isArray(d.review_risks)&&d.review_risks.every(x=>typeof x==='string'&&/^[a-z][a-z0-9-]*$/.test(x)),'review_risks must be labels');
  invariant(d.review!=='risk'||d.review_risks.length>0,'Risk policy requires explicit risk labels');
  invariant(!['required','risk'].includes(d.review)||d.team==='custom'||draft&&d.team===null,'Required review needs an explicit custom reviewer mapping; single-agent mode cannot satisfy it');
  if(config.notes) {object(config.notes,'notes');for(const v of Object.values(config.notes))invariant(typeof v==='string','Decision notes must be text');}
  if(config.deferred) {keys(config.deferred,['board','recorder','backup','deploy','tracker'],'deferred',[]);for(const v of Object.values(config.deferred))member(v,['later','disabled'],'deferred module');}
  const strings=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(strings):[];
  invariant(!strings(config).some(value=>/\{\{|<replace|YOUR_PROJECT/.test(value)),'Unfilled configuration placeholder');
  return structuredClone(config);
}
export function parseCharter(text,{draft=false}={}) {
  const starts=[...text.matchAll(/<!-- arti-sdd:config -->/g)];
  invariant(starts.length===1,'Charter needs exactly one marked config block');
  const match=text.match(/<!-- arti-sdd:config -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- \/arti-sdd:config -->/);
  invariant(match,'Malformed charter config block');
  return validateConfig(JSON.parse(match[1]),{draft});
}
export function loadConfig(file,options={}) {const text=readText(file);return text.trimStart().startsWith('{')?validateConfig(JSON.parse(text),options):parseCharter(text,options);}
export function charter(config, prose='') {return `# Project charter\n\n<!-- arti-sdd:config -->\n\`\`\`json\n${JSON.stringify(validateConfig(config,{draft:true}),null,2)}\n\`\`\`\n<!-- /arti-sdd:config -->\n\n${prose}\n`;}
export function mergeFacts(config,detected) {
  const conflicts=[];
  for(const [key,value]of Object.entries(detected))if(Object.hasOwn(config.facts,key)&&config.facts[key]!==value)conflicts.push({fact:key,explicit:config.facts[key],detected:value,chosen:'explicit'});
  return {config:validateConfig(config),conflicts};
}
export function detectFacts(repo) {
  let manifest={};try{manifest=JSON.parse(readText(`${repo}/package.json`));}catch{}
  const names=Object.keys({...manifest.dependencies,...manifest.devDependencies});
  return {has_ui:names.some(x=>/^(react|vue|svelte|next)$/.test(x)),deploys:fs.existsSync(`${repo}/Dockerfile`),uses_llm:names.some(x=>/^(openai|@anthropic-ai\/sdk|@google\/genai)$/.test(x))};
}
if(isMain(import.meta.url))cli(()=>{const a=args(process.argv.slice(2),['config']);invariant(a.config,'--config is required');console.log(JSON.stringify({status:'valid',config:loadConfig(a.config)}));});
