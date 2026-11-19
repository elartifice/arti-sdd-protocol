import fs from 'node:fs';
import {contractBody} from './contracts.mjs';
import {trackerConfig,githubTicket,approvedGithubTicket} from './tracker.mjs';
import path from 'node:path';
import {validateConsequences} from './policy.mjs';
import { invariant,readText,readJson,git,repoInfo,ticketId,args,isMain,cli,command,digest,integrationBranch } from './lib.mjs';

export function parseTicket(text) {
  const m=text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);invariant(m,'Ticket requires flat frontmatter');
  const data=Object.create(null);
  for(const line of m[1].split('\n')) {
    if(!line.trim()||line.trimStart().startsWith('#'))continue;
    const entry=line.match(/^([a-z_]+):\s*(.*)$/);invariant(entry,`Unsupported ticket header: ${line}`);
    invariant(!Object.hasOwn(data,entry[1]),`Duplicate ticket key ${entry[1]}`);
    const raw=entry[2];
    if(/^[\[{"]/.test(raw)||['true','false','null'].includes(raw))data[entry[1]]=JSON.parse(raw);
    else data[entry[1]]=raw;
  }
  ticketId(data.id);
  if(data.approval_expires_at!==undefined)invariant(typeof data.approval_expires_at==='string'&&Number.isFinite(Date.parse(data.approval_expires_at)),'Invalid approval expiry');
  if(data.consequences!==undefined)validateConsequences(data.consequences);
  invariant(typeof data.title==='string'&&data.title.length>0,'Ticket needs a title');
  invariant(Array.isArray(data.territory)&&data.territory.length>0,'Ticket needs JSON territory paths');
  for(const glob of [...data.territory,...(data.out_of_bounds||[])])literal(glob,{glob:true});
  invariant(!data.depends_on||Array.isArray(data.depends_on),'depends_on must be a JSON list');
  invariant(!data.landing_depends_on||Array.isArray(data.landing_depends_on),'landing_depends_on must be a JSON list');
  for(const dep of [...(data.depends_on||[]),...(data.landing_depends_on||[])])ticketId(dep);
  invariant(!data.risks||Array.isArray(data.risks)&&data.risks.every(x=>typeof x==='string'),'risks must be labels');
  const {status:_status,...header}=data,requirements_sha256=digest({header,body:contractBody(text.slice(m[0].length))});
  return {...data,requirements_sha256,status:data.status||'open',depends_on:data.depends_on||[],out_of_bounds:data.out_of_bounds||[],risks:data.risks||[],text};
}
export function loadTicket(repo,id) {
  ticketId(id);if(trackerConfig(repo))return githubTicket(repo,id);const dir=path.join(repo,'arti_sdd/tickets');
  const files=fs.readdirSync(dir).filter(x=>x===`${id}.md`||x.startsWith(`${id}-`)&&x.endsWith('.md'));
  invariant(files.length===1,`Missing or ambiguous ticket ${id}`);
  const file=path.join(dir,files[0]);invariant(!fs.lstatSync(file).isSymbolicLink(),'Ticket must be branch-local regular content');
  const ticket=parseTicket(readText(file));invariant(ticket.id===id,'Ticket header ID does not match its filename');return {...ticket,file:path.relative(repo,file).split(path.sep).join('/')};
}
export function ticketContract(ticket) {return {tracker:ticket.tracker??null,requirements_sha256:ticket.tracker?ticket.tracker_sha256:ticket.requirements_sha256,territory:ticket.territory,out_of_bounds:ticket.out_of_bounds||[],checks:ticket.checks||[],validation:ticket.validation??null,review_context:ticket.review_context||[],risks:ticket.risks||[],consequences:ticket.consequences??null,tracker_sha256:ticket.tracker_sha256??null,depends_on:ticket.depends_on||[],landing_depends_on:ticket.landing_depends_on||[],spec:ticket.spec||null,generation:Number(ticket.generation||1)};}
export function loadTicketAt(repo,id,ref) {
 if(trackerConfig(repo))return approvedGithubTicket(repo,ticketId(id),ref);
 const files=git(repo,'ls-tree','-r','--name-only',ref,'--','arti_sdd/tickets').split('\n').filter(f=>new RegExp(`^arti_sdd/tickets/${ticketId(id)}(?:-[^/]+)?\\.md$`).test(f));invariant(files.length===1,'Approved integration ticket missing or ambiguous; commit approved planning on the integration branch before claiming');const ticket=parseTicket(git(repo,'show',`${ref}:${files[0]}`));invariant(ticket.id===id,'Approved ticket header ID does not match its filename');return ticket;
}
export function assertApproval(ticket,now=Date.now()){invariant(!ticket.approval_expires_at||Date.parse(ticket.approval_expires_at)>now,'Ticket approval expired; owner renewal required');return ticket;}
export function approvedTicket(repo,id,base=null) {
  const current=assertApproval(loadTicket(repo,id)),claimFile=path.join(repoInfo(repo).state,'claims',`${id}.json`);let contract=null;
  if(fs.existsSync(claimFile)){const claim=readJson(claimFile);invariant(claim.status==='active'&&claim.contract,'Missing approved claim contract; reconcile interrupted/old ownership');contract=claim.contract;}
  else if(base) {
    contract=ticketContract(loadTicketAt(repo,id,base));
  }
  if(contract)invariant(digest(contract)===digest(ticketContract(current)),'Approved ticket contract changed; reconcile with the owner before changing scope, checks or risks');
  return current;
}
export function literal(value,{glob=false,absolute=false}={}) {
  invariant(typeof value==='string'&&value.length>0&&value===value.trim()&&!/[\\\0\r\n]/.test(value),'NOT_LITERAL path');
  const parts=value.split('/');
  if(absolute&&value.startsWith('/'))parts.shift();
  invariant(parts.length>0&&parts.every(x=>x!==''&&x!=='.'&&x!=='..'),'NOT_LITERAL path segments');
  invariant(absolute||!path.isAbsolute(value),'Expected a relative path');
  invariant(glob||!/[?*]/.test(value),'NOT_LITERAL wildcard');
  return value;
}
export function matchGlob(file,glob) {
  let re='^';
  for(let i=0;i<glob.length;i++) {
    const c=glob[i];
    if(c==='*'&&glob[i+1]==='*'){if(glob[i+2]==='/'){re+='(?:.*/)?';i+=2;}else{re+='.*';i++;}}
    else if(c==='*')re+='[^/]*';else if(c==='?')re+='[^/]';else re+=c.replace(/[.()+^$|{}[\]\\]/g,'\\$&');
  }
  return new RegExp(re+'$').test(file);
}
function realExisting(input) {
  let p=input,tail=[];
  while(!fs.existsSync(p)){try{invariant(!fs.lstatSync(p).isSymbolicLink(),'Dangling symlink refused');}catch(e){if(e.code!=='ENOENT')throw e;}const parent=path.dirname(p);invariant(parent!==p,'Cannot resolve path');tail.unshift(path.basename(p));p=parent;}
  return path.join(fs.realpathSync.native(p),...tail);
}
export function worktrees(repo) {
  return git(repo,'worktree','list','--porcelain','-z').split('\0').filter(x=>x.startsWith('worktree ')&&fs.existsSync(x.slice(9))).map(x=>fs.realpathSync(x.slice(9)));
}
export function ticketStatus(repo,ticket) {
  const file=path.join(repoInfo(repo).state,'closeout',`${ticket.id}.json`);
  if(fs.existsSync(file)){const r=readJson(file);if((!r.contract_sha256||r.contract_sha256===digest(ticketContract(ticket)))&&r.generation===Number(ticket.generation||1)&&r.default_branch===integrationBranch(repo)&&command('git',['merge-base','--is-ancestor',r.merge_commit,`refs/heads/${r.default_branch}`],{cwd:repo}).code===0)return r.status==='done'?'done':'in-review';}
  return ticket.status;
}
export function mapPath(repo,input,cwd=repo) {
  literal(input,{absolute:true});let lexicalAbsolute=path.resolve(cwd,input);const absolute=realExisting(lexicalAbsolute),trees=worktrees(repo),inside=value=>trees.some(r=>value===r||value.startsWith(r+path.sep));
  if(!inside(lexicalAbsolute)){
    for(const anchor of [path.resolve(cwd),path.resolve(repo)].sort((a,b)=>b.length-a.length))if(lexicalAbsolute===anchor||lexicalAbsolute.startsWith(anchor+path.sep)){const canonical=realExisting(anchor);if(inside(canonical)){lexicalAbsolute=path.resolve(canonical,path.relative(anchor,lexicalAbsolute));break;}}
    if(!inside(lexicalAbsolute)){let prefix=path.parse(lexicalAbsolute).root;for(const part of lexicalAbsolute.slice(prefix.length).split(path.sep)){prefix=path.join(prefix,part);if(fs.existsSync(prefix)){const canonical=fs.realpathSync(prefix);if(trees.includes(canonical)){lexicalAbsolute=path.resolve(canonical,path.relative(prefix,lexicalAbsolute));break;}}}}
  }
  function entry(value){const roots=trees.filter(r=>value===r||value.startsWith(r+path.sep)).sort((a,b)=>b.length-a.length);invariant(roots.length>0,'Path is outside this repository');const relative=path.relative(roots[0],value).split(path.sep).join('/');literal(relative);return {root:roots[0],relative};}
  return {...entry(absolute),lexical:entry(lexicalAbsolute)};
}
export function branchTicket(repo) {const branch=git(repo,'branch','--show-current');return branch.match(/^t\/(T\d{3,6})(?:-|$)/)?.[1]||null;}
export function activeTicket(repo,session) {
  const info=repoInfo(repo),branch=branchTicket(info.root);
  const file=path.join(info.state,'sessions',`${session}.json`);
  const claimed=fs.existsSync(file)?readJson(file).ticket:null;
  invariant(!branch||!claimed||branch===claimed,'Session claim conflicts with ticket worktree');
  const id=branch||claimed;if(!id)return null;
  const claimFile=path.join(info.state,'claims',`${ticketId(id)}.json`);if(!fs.existsSync(claimFile))return null;
  const claim=readJson(claimFile);invariant(claim.session===session,'Ticket is claimed by another session');
  invariant(claim.status==='active'&&claimed===id&&readJson(file).nonce===claim.nonce,'Missing or interrupted session ownership');
  const closing=path.join(info.state,'closeout',`${id}.json`);if(fs.existsSync(closing))invariant(readJson(closing).generation!==claim.contract.generation,'Ticket is closing or complete; finish cleanup or reopen approved planning');
  return id;
}
export function checkPaths(repo,id,inputs,{cwd=repo,approved=null}={}) {
  ticketId(id);invariant(inputs.length>0,'No paths to check');
  const checked=[],tickets=new Map(),root=repoInfo(repo).root;invariant(!approved||approved.id===id,'Approved scope belongs to another ticket');
  for(const input of inputs) {
    const mapped=mapPath(repo,input,cwd);
    for(const entry of [mapped.lexical,mapped]){
      const owner=branchTicket(entry.root);invariant(!owner||owner===id,`Other worktree belongs to ${owner}`);
      if(new RegExp(`^arti_sdd/tickets/${id}(?:-[^/]+)?\\.md$`).test(entry.relative))continue;
      if(!tickets.has(entry.root))tickets.set(entry.root,approved&&entry.root===root?approved:approvedTicket(entry.root,id,trackerConfig(entry.root)?`refs/heads/${integrationBranch(entry.root)}`:null));const t=tickets.get(entry.root);invariant(t.territory.some(g=>matchGlob(entry.relative,g))&&!t.out_of_bounds.some(g=>matchGlob(entry.relative,g)),`OUTSIDE_TERRITORY ${entry.relative}`);
    }
    checked.push(mapped.lexical.relative);
  }
  return checked;
}
export function diffPaths(repo,base='HEAD') {
  git(repo,'rev-parse','--verify',`${base}^{commit}`);
  const names=git(repo,'diff','--name-status','-z',base,'--').split('\0');
  const out=[];
  for(let i=0;i<names.length&&names[i];){const status=names[i++];out.push(names[i++]);if(/^[RC]/.test(status))out.push(names[i++]);}
  out.push(...git(repo,'ls-files','--others','--exclude-standard','-z').split('\0').filter(Boolean));
  return [...new Set(out)].filter(Boolean);
}
export function peerOverlap(repo,ticket) {
  const {state}=repoInfo(repo),dir=path.join(state,'claims');if(!fs.existsSync(dir))return [];
  const result=[];
  for(const file of fs.readdirSync(dir)) {
    const claim=readJson(path.join(dir,file));if(claim.ticket===ticket.id)continue;
    invariant(Array.isArray(claim.contract?.territory),'Unfrozen peer claim needs explicit reconciliation');
    for(const a of ticket.territory)for(const b of claim.contract.territory) {
        const prefix=g=>g.split(/[?*]/)[0],pa=prefix(a),pb=prefix(b);
        const overlap=!/[?*]/.test(a)?matchGlob(a,b):!/[?*]/.test(b)?matchGlob(b,a):a===b||pa.startsWith(pb)||pb.startsWith(pa);
        if(overlap)result.push({ticket:claim.ticket,a,b});
    }
  }
  return result;
}
export function extractPatch(text) {
  invariant(typeof text==='string'&&text.includes('*** Begin Patch')&&text.includes('*** End Patch'),'Malformed patch');
  const paths=[];
  for(const line of text.split('\n')) {
    const match=line.match(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.*)$/);
    if(match){literal(match[1],{absolute:true});paths.push(match[1]);}
  }
  invariant(paths.length>0,'No patch paths');return paths;
}
if(isMain(import.meta.url))cli(()=>{const a=args(process.argv.slice(2),['repo','ticket','path','base']);const repo=a.repo||process.cwd();invariant(a.ticket,'--ticket required');const paths=a.path?[a.path]:diffPaths(repo,a.base||'HEAD');console.log(JSON.stringify({status:'passed',paths:checkPaths(repo,a.ticket,paths)}));});
