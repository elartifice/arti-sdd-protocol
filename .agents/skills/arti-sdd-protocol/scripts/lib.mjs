import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const version = JSON.parse(fs.readFileSync(path.join(skillRoot,'package.json'),'utf8')).version;
export function invariant(ok, message) { if (!ok) throw new Error(message); }
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = value => crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:canonical(value)).digest('hex');
export function packageDigest(root=skillRoot) {
  const entries=[];
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,e.name);invariant(!e.isSymbolicLink(),'Package symlink refused');if(e.isDirectory())walk(p);else entries.push([path.relative(root,p).split(path.sep).join('/'),digest(fs.readFileSync(p))]);}}
  walk(root);return digest(entries);
}
export const readText = file => fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
export const readJson = file => JSON.parse(readText(file));
export function atomic(file, content, mode=0o644) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  invariant(!fs.existsSync(file)||!fs.lstatSync(file).isSymbolicLink(),`Refusing to replace symlink: ${file}; write its canonical source`);
  const tmp=`${file}.${crypto.randomUUID()}.tmp`;
  try {fs.writeFileSync(tmp,content,{mode,flag:'wx'});fs.renameSync(tmp,file);} finally {if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
export const writeJson = (file, value, mode=0o644) => atomic(file,JSON.stringify(value,null,2)+'\n',mode);
export function command(exe,args,{cwd,timeout=15000,input,env}={}) {
  const r=spawnSync(exe,args,{cwd,timeout,input,env:env?{...process.env,...env}:process.env,encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true});
  return {code:r.status??1,stdout:r.stdout||'',stderr:r.stderr||'',error:r.error?.message||''};
}
export function git(repo,...args) { const r=command('git',args,{cwd:repo});invariant(r.code===0,`git ${args[0]} failed: ${r.stderr.trim()||r.error}`);return r.stdout.trimEnd(); }
export function repoInfo(input=process.cwd()) {
  const root=fs.realpathSync(git(input,'rev-parse','--show-toplevel'));
  const common=fs.realpathSync(path.resolve(root,git(root,'rev-parse','--git-common-dir')));
  return {root,common,state:path.join(common,'arti-sdd'),id:digest(common)};
}
export function integrationBranch(repo,config=null) {
  const configured=config||(fs.existsSync(path.join(repo,'arti_sdd/config.json'))?readJson(path.join(repo,'arti_sdd/config.json')):{});
  const anchor=command('git',['symbolic-ref','-q','refs/arti/integration'],{cwd:repo}),remote=command('git',['symbolic-ref','-q','refs/remotes/origin/HEAD'],{cwd:repo});
  let branch=anchor.code===0?anchor.stdout.trim().replace(/^refs\/heads\//,''):remote.code===0?remote.stdout.trim().replace(/^refs\/remotes\/origin\//,''):['main','master','trunk'].find(b=>command('git',['show-ref','--verify','--quiet',`refs/heads/${b}`],{cwd:repo}).code===0);
  branch||=git(repo,'branch','--show-current');
  invariant(branch&&!branch.startsWith('t/')&&!branch.startsWith('refs/')&&!branch.startsWith('-')&&command('git',['check-ref-format','--branch',branch],{cwd:repo}).code===0,'Cannot establish the integration branch; run setup from the real integration checkout');
  invariant(!configured.default_branch||configured.default_branch===branch,'Configured integration branch differs from Git metadata; reconcile the owner decision');
  const exists=command('git',['rev-parse','--verify',`refs/heads/${branch}^{commit}`],{cwd:repo});
  invariant(exists.code===0||command('git',['rev-parse','--verify','HEAD'],{cwd:repo}).code!==0&&git(repo,'symbolic-ref','HEAD')===`refs/heads/${branch}`,'Integration branch is missing');return branch;
}
export function args(argv,flags=[]) {
  const out={_:[]};
  for(let i=0;i<argv.length;i++) {
    const a=argv[i];
    if(!a.startsWith('--')){out._.push(a);continue;}
    const key=a.slice(2);invariant(flags.includes(key),`Unknown flag --${key}`);
    if(['dry-run','offline','json','force','keep-worktree','require-live'].includes(key))out[key]=true;
    else {invariant(i+1<argv.length&&!argv[i+1].startsWith('--'),`Missing --${key} value`);out[key]=argv[++i];}
  }
  return out;
}
export function isMain(url) { try { return !!process.argv[1] && fs.realpathSync(path.resolve(process.argv[1]))===fs.realpathSync(fileURLToPath(url)); } catch { return false; } }
export function cli(fn) {try {const result=fn();if(result?.then)result.catch(error=>{console.error(`FAIL ${error.message}`);process.exitCode=1;});}catch(error){console.error(`FAIL ${error.message}`);process.exitCode=1;} }
export function sessionId(explicit, env=process.env) {
  if(explicit||env.ARTI_SESSION_ID) return validId(explicit||env.ARTI_SESSION_ID);
  const ids=[env.CLAUDE_CODE_SESSION_ID,env.CODEX_SESSION_ID].filter(Boolean);
  invariant(new Set(ids).size===1,'Missing or ambiguous session identity; pass --session or ARTI_SESSION_ID');
  return validId(ids[0]);
}
export function validId(id) {invariant(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(id)&&!id.includes('..'),'Invalid identity');return id;}
export function ticketId(id) {invariant(/^T[0-9]{3,6}$/.test(id),'Invalid ticket ID');return id;}
export function redact(text) {return String(text).replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_+/-]{48,}={0,2})\b/g,'[redacted]').replace(/((?:api[_-]?key|token|secret|password|authorization)\s*[=:]\s*)\S+/gi,'$1[redacted]');}
