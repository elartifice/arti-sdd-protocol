import fs from 'node:fs';
import {trackerConfig,createGithubTicket} from './tracker.mjs';
import path from 'node:path';
import {repoInfo,validId,invariant,readJson,writeJson,args,isMain,cli,git,integrationBranch} from './lib.mjs';
import {loadConfig} from './schema.mjs';
import {literal,checkPaths} from './scope.mjs';

export function draftTicket(repo,{session,authorization,title,goal,territory}){
 const info=repoInfo(repo);loadConfig(path.join(info.root,'arti_sdd/config.json'));
 session=validId(session);invariant(typeof authorization==='string'&&authorization.trim(),'Draft creation needs explicit authorized scope');
 for(const [key,value] of Object.entries({title,goal}))invariant(typeof value==='string'&&value.trim()&&value.length<=8000,`Missing or oversized draft ${key}`);
 invariant(Array.isArray(territory)&&territory.length>0,'Draft needs explicit territory');for(const p of territory)literal(p,{glob:true});
 if(trackerConfig(info.root))return createGithubTicket(info.root,{title,goal,territory,requestId:session},authorization);
 const directory=path.join(info.root,'arti_sdd/tickets');fs.mkdirSync(directory,{recursive:true});invariant(fs.realpathSync(directory)===directory,'Draft directory link refused');
 const reservations=path.join(info.state,'drafts');fs.mkdirSync(reservations,{recursive:true,mode:0o700});invariant(fs.realpathSync(reservations)===reservations,'Draft reservation link refused');
 // mkdir is an atomic short allocation lock. Interrupted locks require inspection,
 // never age-based takeover or deletion of another session's ownership.
 const lock=path.join(info.state,'draft-allocation.lock');try{fs.mkdirSync(lock);}catch(e){if(e.code==='EEXIST')throw Error('Draft allocation busy or interrupted; inspect and retry without clearing ownership');throw e;}
 try{
  const approvedFiles=git(info.root,'ls-tree','-r','--name-only',`refs/heads/${integrationBranch(info.root)}`,'--','arti_sdd/tickets').split('\n').map(f=>path.basename(f));
  const used=[...approvedFiles,...fs.readdirSync(directory),...fs.readdirSync(reservations)].flatMap(f=>{const n=f.match(/^T(\d{3,6})(?:[.-]|$)/);return n?[Number(n[1])]:[];});
  const number=Math.max(0,...used)+1;invariant(number<=999999,'Ticket ID range exhausted');const id=`T${String(number).padStart(3,'0')}`,relative=`arti_sdd/tickets/${id}.md`;
  const ownerFile=path.join(info.state,'sessions',`${session}.json`);
  if(fs.existsSync(ownerFile))checkPaths(info.root,readJson(ownerFile).ticket,[relative]);
  writeJson(path.join(reservations,`${id}.json`),{schema_version:1,ticket:id,native_session:session,authorized_scope:authorization,status:'reserved',repo_id:info.id},0o600);
  const text=`---\nid: ${JSON.stringify(id)}\ntitle: ${JSON.stringify(title)}\nstatus: "open"\ndepends_on: []\nterritory: ${JSON.stringify(territory)}\n---\n\n## Goal\n\n${goal}\n\n## DoD\n\n- [ ] Define and approve observable acceptance before implementation.\n\n## Evidence\n\nDraft only. No approval, claim, checks or completion is implied.\n`;
  const fd=fs.openSync(path.join(info.root,relative),'wx',0o644);try{fs.writeFileSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  return {ticket:id,path:relative,status:'draft-created',claimed:false,approved:false,next:'Review the contract, commit approved planning on integration, then claim through the normal gate.',coordination:'this-clone-only'};
 }finally{fs.rmdirSync(lock);}
}
if(isMain(import.meta.url))cli(()=>{const a=args(process.argv.slice(2),['repo','session','authorization','title','goal','territory']);console.log(JSON.stringify(draftTicket(a.repo||process.cwd(),{session:a.session,authorization:a.authorization,title:a.title,goal:a.goal,territory:JSON.parse(a.territory||'null')}),null,2));});
