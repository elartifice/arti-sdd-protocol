import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { invariant,repoInfo,readJson,writeJson,git,command,sessionId,ticketId,args,isMain,cli,digest,integrationBranch } from './lib.mjs';
import { loadTicket,loadTicketAt,peerOverlap,ticketStatus,ticketContract } from './scope.mjs';

function store(repo,kind,id) {const info=repoInfo(repo),dir=path.join(info.state,kind);if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true,mode:0o700});return {...info,file:path.join(dir,`${id}.json`)};}
function exclusive(file,value){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function alive(pid){try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}}
function mutex(info,fn) {
 const lock=path.join(info.state,'coordination.lock'),recovery=lock+'.recovery',ownerFile=path.join(lock,'owner.json'),deadline=Date.now()+20000;
 for(;;) {
  try{if(fs.existsSync(recovery))throw Object.assign(new Error('Recovering'),{code:'EEXIST'});fs.mkdirSync(lock);break;}catch(e){if(e.code!=='EEXIST')throw e;}
  if(!fs.existsSync(recovery))try {
   fs.mkdirSync(recovery);
   try{if(fs.existsSync(lock)){const owner=fs.existsSync(ownerFile)?readJson(ownerFile):null;if(owner&&!alive(owner.pid)){fs.unlinkSync(ownerFile);fs.rmdirSync(lock);}}}finally{fs.rmdirSync(recovery);}
  }catch(e){if(!['EEXIST','ENOENT','ENOTEMPTY'].includes(e.code))throw e;}
  invariant(Date.now()<deadline,'Coordination is busy; ownership retained, retry after the active operation');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);
 }
 try{writeJson(ownerFile,{pid:process.pid,nonce:crypto.randomUUID()},0o600);return fn();}finally{if(fs.existsSync(ownerFile))fs.unlinkSync(ownerFile);fs.rmdirSync(lock);}
}
function remoteOid(repo,remote) {
 const r=command('git',['ls-remote','--exit-code','--refs',remote.name,remote.ref],{cwd:repo,env:{GIT_TERMINAL_PROMPT:'0'}});invariant(r.code===0||r.code===2,'Remote claim status unavailable; local ownership retained');return r.code===2?null:r.stdout.trim().split(/\s/)[0];
}
function deleteRemote(repo,remote) {
 const r=command('git',['push','--porcelain',`--force-with-lease=${remote.ref}:${remote.oid}`,remote.name,`:${remote.ref}`],{cwd:repo,env:{GIT_TERMINAL_PROMPT:'0'}});invariant(r.code===0,'Remote claim changed or release failed; local ownership retained');
}
export function acquireClaim(repo,id,session,{remote=null,worktree=null,onPhase=()=>{}}={}) {
  ticketId(id);const owner=sessionId(session),info=store(repo,'claims',id),sf=path.join(info.state,'sessions',`${owner}.json`);
  const existing=()=>{
    const closing=path.join(info.state,'closeout',`${id}.json`);if(fs.existsSync(closing)&&readJson(closing).status==='closing')throw new Error('Closeout cleanup is pending; finish it before claiming');
    if(!fs.existsSync(info.file))return null;
    const prior=readJson(info.file);invariant(prior.ticket===id&&prior.repo_id===info.id,'Invalid claim identity');invariant(prior.session===owner,`Ticket ${id} is owned by another session`);invariant(prior.status==='active','Interrupted claim needs reconciliation before reuse');invariant((prior.remote?.name||null)===(remote||null),'Existing claim uses a different coordination scope');
    const scope=fs.existsSync(sf)?readJson(sf):null;invariant(scope?.ticket===id&&scope.nonce===prior.nonce,'Missing or interrupted session ownership');return prior;
  };
  const prior=existing();if(prior)return prior; // Read-only reuse of a coordinator-issued lease.
  return mutex(info,()=>{
    const prior=existing();if(prior)return prior;
    invariant(!fs.existsSync(sf),'This session already owns a ticket');
    const ticket=loadTicket(info.root,id);
    const integration=integrationBranch(info.root),approved_base=git(info.root,'rev-parse',`refs/heads/${integration}`),approved=loadTicketAt(info.root,id,approved_base);
    invariant(digest(ticketContract(ticket))===digest(ticketContract(approved)),'Working ticket differs from approved integration planning; reconcile with the owner before claiming');
    invariant(!['done','archived'].includes(ticketStatus(info.root,approved)),'Reopen a completed ticket explicitly before claiming');
    for(const dep of ticket.depends_on)invariant(ticketStatus(info.root,loadTicketAt(info.root,dep,approved_base))==='done',`Dependency ${dep} is not done`);
    invariant(peerOverlap(info.root,ticket).length===0,'Territory overlaps another active claim');
    const configFile=path.join(info.root,'arti_sdd/config.json');
    const baseConfig=command('git',['show',`${approved_base}:arti_sdd/config.json`],{cwd:info.root}),config_sha256=baseConfig.code===0?digest(JSON.parse(baseConfig.stdout)):null;
    invariant(!fs.existsSync(configFile)||config_sha256===digest(readJson(configFile)),'Setup decisions differ from approved integration planning; commit the owner decision there first');
    const record={schema_version:1,status:'pending',ticket:id,session:owner,repo_id:info.id,nonce:crypto.randomUUID(),pid:process.pid,created_at:new Date().toISOString(),remote:null,requested_remote:remote,contract:ticketContract(approved),config_sha256,approved_base,integration_branch:integration};
    exclusive(info.file,record);
    try {
      onPhase('pending');
      if(remote) {
        invariant(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(remote),'Invalid remote name');
        const ref=`refs/heads/arti-claims/${id}`,tree=git(info.root,'rev-parse','HEAD^{tree}');
        const oid=command('git',['commit-tree',tree,'-p','HEAD'],{cwd:info.root,input:`Arti claim ${id} ${record.nonce}\n`});invariant(oid.code===0,'Could not create unique claim object');
        const commit=oid.stdout.trim();record.remote={name:remote,ref,oid:commit};writeJson(info.file,record,0o600);
        const push=command('git',['push','--porcelain',`--force-with-lease=${ref}:`,remote,`${commit}:${ref}`],{cwd:info.root,env:{GIT_TERMINAL_PROMPT:'0'}});
        invariant(push.code===0,'Remote claim compare-and-create was rejected');onPhase('remote-created');
      }
      if(worktree) {
        const destination=path.resolve(info.root,worktree);invariant(!fs.existsSync(destination),'Worktree target already exists');
        const branch=`t/${id}-${ticket.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40).replace(/^-|-$/g,'')}`;
        git(info.root,'worktree','add','-b',branch,destination,'HEAD');record.worktree=destination;record.branch=branch;
      }
      record.status='active';writeJson(info.file,record,0o600);writeJson(sf,{ticket:id,nonce:record.nonce},0o600);
      return record;
    }catch(error){
      if(record.remote)try{if(remoteOid(info.root,record.remote)===record.remote.oid)deleteRemote(info.root,record.remote);}catch(cleanup){writeJson(info.file,record,0o600);throw new Error(`${error.message}; pending ownership retained for release: ${cleanup.message}`);}
      fs.unlinkSync(info.file);throw error;
    }
  });
}
export function reserveCloseout(repo,id,session,receipt) {
 const info=store(repo,'closeout',ticketId(id));
 return mutex(info,()=>{
  const claimFile=path.join(info.state,'claims',`${id}.json`),lockFile=path.join(info.state,'locks/landing.json');
  if(fs.existsSync(claimFile))invariant(readJson(claimFile).session===session,'Claim belongs to another session');
  const lock=fs.existsSync(lockFile)?readJson(lockFile):null;if(lock)invariant(lock.ticket===id&&lock.session===session,'Landing lock belongs to another ticket/session');
  writeJson(info.file,{...receipt,status:'closing',claim:'pending-cleanup',lock:lock?'pending-cleanup':'already-released'},0o600);return {owned_lock:!!lock};
 });
}
export function releaseClaim(repo,id,session) {
  const owner=sessionId(session),info=store(repo,'claims',ticketId(id));
  return mutex(info,()=>{
    invariant(fs.existsSync(info.file),'Claim is missing');const record=readJson(info.file);
    invariant(record.session===owner,'Claim belongs to another session');
    const sf=path.join(info.state,'sessions',`${owner}.json`);
    if(fs.existsSync(sf)){const s=readJson(sf);invariant(s.ticket===id&&s.nonce===record.nonce,'Session claim differs');}
    if(record.remote) {const oid=remoteOid(info.root,record.remote);invariant(!oid||oid===record.remote.oid||record.status==='pending','Remote claim changed; local ownership retained');if(oid===record.remote.oid)deleteRemote(info.root,record.remote);}
    fs.unlinkSync(info.file);
    if(fs.existsSync(sf))fs.unlinkSync(sf);
    return {status:'released',ticket:id};
  });
}
export function landingLock(repo,action,id,session) {
  ticketId(id);const owner=sessionId(session),info=store(repo,'locks','landing');
  return mutex(info,()=>{
    const prior=fs.existsSync(info.file)?readJson(info.file):null;
    if(action==='acquire'&&!prior){const rec={ticket:id,session:owner,nonce:crypto.randomUUID(),created_at:new Date().toISOString()};exclusive(info.file,rec);return rec;}
    invariant(prior&&prior.ticket===id&&prior.session===owner,'Landing lock is missing or owned by another session');
    if(action==='release')fs.unlinkSync(info.file);
    else if(action==='refresh'){prior.refreshed_at=new Date().toISOString();writeJson(info.file,prior,0o600);}
    else invariant(action==='acquire'||action==='check','Unknown lock action');
    return {status:action,ticket:id,session:owner};
  });
}
if(isMain(import.meta.url))cli(()=>{const a=args(process.argv.slice(2),['repo','ticket','session','remote','worktree']),repo=a.repo||process.cwd(),action=a._[0];invariant(a.ticket,'--ticket required');let result;if(action==='claim')result=acquireClaim(repo,a.ticket,a.session,{remote:a.remote,worktree:a.worktree});else if(action==='release')result=releaseClaim(repo,a.ticket,a.session);else if(action==='lock')result=landingLock(repo,a._[1],a.ticket,a.session);else throw new Error('Usage: claim.mjs claim|release|lock acquire|release|refresh|check --ticket T001 --session <id>');console.log(JSON.stringify(result));});
