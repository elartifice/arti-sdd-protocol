import fs from 'node:fs';
import path from 'node:path';
import {repoInfo,validId,invariant,readJson,atomic} from './lib.mjs';

// Presentation only. This record is never a claim, approval or freshness proof.
export function reserveOrientation(input,env={}){
 const source=input.source||'startup';
 if(source!=='startup')return {show:false,reason:'continuation-or-unknown-event'};
 const native=validId(input.session_id);
 const host=env.ARTI_NATIVE_HOST;
 const ids=host==='claude'?[env.CLAUDE_CODE_SESSION_ID]:host==='codex'?[env.CODEX_THREAD_ID]:[env.CODEX_THREAD_ID,env.CLAUDE_CODE_SESSION_ID];
 for(const id of ids.filter(Boolean))invariant(id===native,'Native orientation identity mismatch');
 const info=repoInfo(input.cwd||process.cwd()),dir=path.join(info.state,'presentation');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});invariant(fs.realpathSync(dir)===dir,'Presentation path must not be a symlink');
 const file=path.join(dir,`${native}.json`),record={schema_version:1,native_session:native,repo_id:info.id,state:'reserved',event:source};
 if(fs.existsSync(file)){
  invariant(!fs.lstatSync(file).isSymbolicLink(),'Presentation link refused');
  let prior;try{prior=readJson(file);}catch{prior=null;}
  if(prior?.schema_version===1&&prior.native_session===native&&prior.repo_id===info.id)return {show:false,reason:'already-reserved'};
  // Preserve corruption. Diagnose once rather than replaying the introduction.
  try{const fd=fs.openSync(file+'.diagnostic','wx',0o600);fs.closeSync(fd);return {show:false,diagnostic:'Invalid presentation record preserved; inspect it explicitly. Ownership is unchanged.'};}catch(e){if(e.code==='EEXIST')return {show:false,reason:'diagnostic-already-reported'};throw e;}
 }
 if(fs.existsSync(path.join(info.state,'sessions',`${native}.json`)))return {show:false,reason:'known-ticket-session'};
 try{fs.mkdirSync(file+'.reservation',{mode:0o700});}catch(e){if(e.code==='EEXIST')return {show:false,reason:'concurrent-or-interrupted-reservation'};throw e;}
 atomic(file,JSON.stringify(record)+'\n',0o600);
 return {show:true,native_session:native,delivery:'context-reserved-not-ui-attested'};
}
