import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {repoInfo,readJson,writeJson,validId,invariant,digest,redact,args,isMain,cli} from './lib.mjs';
import {loadTicket,ticketStatus,worktrees} from './scope.mjs';
import {codexRpc} from './check.mjs';

export async function nameTicket(repo,id,{host,nativeSession,event,env=process.env,nativeTool=null,sdkModule=null,rpc=codexRpc}={}){
 const info=repoInfo(repo),ticket=loadTicket(info.root,id);nativeSession=validId(nativeSession);
 invariant(['claim','land'].includes(event)&&['claude','codex'].includes(host),'Invalid naming host/event');
 const actual=host==='codex'?env.CODEX_THREAD_ID:env.CLAUDE_CODE_SESSION_ID;
 invariant(actual===nativeSession,'Native naming identity unavailable or mismatched');
 const generation=Number(ticket.generation||1),coordination=env.ARTI_SESSION_ID||nativeSession;
 const receiptDir=path.join(info.state,'naming');fs.mkdirSync(receiptDir,{recursive:true,mode:0o700});
 invariant(fs.realpathSync(receiptDir)===receiptDir,'Naming receipt directory link refused');
 const claimRecord=path.join(receiptDir,`${nativeSession}-${id}-${generation}-claim.json`);
 if(event==='claim'){
  const claim=readJson(path.join(info.state,'claims',`${id}.json`));invariant(claim.session===coordination&&claim.status==='active','Naming requires this session owning the ticket');
 }else{
  const prior=readJson(claimRecord);invariant(prior.native_session===nativeSession&&prior.ticket===id&&prior.generation===generation,'Completion naming lacks matching native claim binding');
  const closeout=readJson(path.join(info.state,'closeout',`${id}.json`));
  invariant(closeout.status==='done'&&closeout.generation===generation&&ticketStatus(info.root,ticket)==='done','Completion naming requires verified landing and closeout');
 }
 invariant(typeof ticket.milestone==='string'&&ticket.milestone.trim(),'Naming needs an actual milestone; do not invent it');
 const base=`${ticket.milestone} - ${id} - ${ticket.title.replace(/^(?:✅\s*)+/u,'').trim()}`;
 const title=event==='land'?`✅ ${base}`:base;
 let receipt={schema_version:1,host,native_session:nativeSession,ticket:id,generation,event,requested_title:title,status:'not-applied',manual_user_task:false};
 try{
  if(!nativeTool&&host==='claude'&&sdkModule)nativeTool=claudeSdkNaming(sdkModule);
  if(nativeTool){const observed=await nativeTool({nativeSession,title,repo:info.root});invariant(observed.nativeSession===nativeSession&&observed.title===title&&observed.persisted===true,'Native tool readback/persistence missing');receipt={...receipt,status:'verified',route:observed.route||'native-tool-with-readback',observed_title:observed.title};}
  else if(host==='codex'){
   const before=await rpc(info.root,'thread/read',{threadId:nativeSession,includeTurns:false});
   invariant(before.thread?.id===nativeSession&&typeof before.thread.cwd==='string'&&worktrees(info.root).includes(path.resolve(before.thread.cwd)),'Native chat belongs to another repository');
   await rpc(info.root,'thread/name/set',{threadId:nativeSession,name:title});
   // codexRpc creates a fresh short-lived helper for every request.
   const after=await rpc(info.root,'thread/read',{threadId:nativeSession,includeTurns:false});
   invariant(after.thread?.id===nativeSession&&after.thread.name===title,'Native title persistence/readback failed');
   receipt={...receipt,status:'verified',route:'codex-app-server-metadata-only',observed_title:after.thread.name};
  }else throw Error('Supported Claude native naming tool unavailable; no metadata-only fallback qualified');
 }catch(error){receipt={...receipt,status:'failed',reason:redact(error.message)};}
 writeJson(path.join(receiptDir,`${nativeSession}-${id}-${generation}-${event}.json`),{...receipt,receipt_sha256:digest(receipt)},0o600);
 return receipt;
}

export function claudeSdkNaming(moduleFile){return async({nativeSession,title,repo})=>{
 invariant(path.isAbsolute(moduleFile)&&fs.existsSync(moduleFile),'Explicit installed Claude Agent SDK module required');
 const sdk=await import(pathToFileURL(moduleFile).href),before=await sdk.getSessionInfo(nativeSession,{dir:repo});
 invariant(before?.sessionId===nativeSession&&before.cwd&&fs.realpathSync(before.cwd)===repo,'Claude native chat belongs elsewhere');
 const messages=await sdk.getSessionMessages(nativeSession,{dir:repo});await sdk.renameSession(nativeSession,title,{dir:repo});
 const after=await sdk.getSessionInfo(nativeSession,{dir:repo}),afterMessages=await sdk.getSessionMessages(nativeSession,{dir:repo});
 invariant(after?.sessionId===nativeSession&&after.customTitle===title&&digest(messages)===digest(afterMessages),'Claude title readback failed or naming changed model turns');
 return {nativeSession,title:after.customTitle,persisted:true,route:'claude-agent-sdk-metadata-only'};
};}
if(isMain(import.meta.url))cli(async()=>{const a=args(process.argv.slice(2),['repo','ticket','host','native-session','event','sdk-module']);console.log(JSON.stringify(await nameTicket(a.repo||process.cwd(),a.ticket,{host:a.host,nativeSession:a['native-session'],event:a.event,sdkModule:a['sdk-module']})));});
