import fs from 'node:fs';
import {parseTicket,ticketContract} from './scope.mjs';
import path from 'node:path';
import {invariant,repoInfo,readJson,git,command,digest,integrationBranch,args,isMain,cli,writeJson} from './lib.mjs';

import {contractBody} from './contracts.mjs';
export {contractBody} from './contracts.mjs';
export const MARKER='<!-- arti-sdd-ticket\n';
function issueBody(issue){return typeof issue.body==='string'?issue.body.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'):'';}
export function trackerConfig(repo){const file=path.join(repo,'arti_sdd/config.json');if(!fs.existsSync(file))return null;const cfg=readJson(file);return cfg.decisions?.planning==='github'?validateTracker(cfg.tracker):null;}
export function validateTracker(t){invariant(t&&t.provider==='github'&&/^[\w.-]+\/[\w.-]+$/.test(t.repository),'GitHub tracker needs an explicit owner/repository');invariant(Object.keys(t).every(k=>['provider','repository','project_url'].includes(k)),'Unknown tracker option');if(t.project_url)invariant(/^https:\/\/github\.com\/(?:users|orgs)\/[\w.-]+\/projects\/\d+$/.test(t.project_url),'Invalid GitHub Project URL');return t;}
export function githubApi(endpoint,{method='GET',data=null}={}){invariant(/^(repos\/|graphql$)/.test(endpoint)&&!endpoint.includes('..'),'Unsupported GitHub endpoint');const argv=['api','--method',method,endpoint];if(data!==null)argv.push('--input','-');const r=command('gh',argv,{input:data===null?undefined:JSON.stringify(data),timeout:30000});invariant(r.code===0,'GitHub operation failed: access/network/rate-limit check required; no cached authority used');return JSON.parse(r.stdout||'null');}
export function issueTicket(issue,repository){
 invariant(!issue.pull_request&&typeof issue.body==='string'&&Buffer.byteLength(issue.body)<512*1024,'Invalid or oversized ticket issue');
 const body=issueBody(issue);repository=repository.toLowerCase();const url=`https://github.com/${repository}/issues/${issue.number}`;
 const start=body.indexOf(MARKER),end=body.indexOf('\n-->',start);invariant(start===0&&end>start&&body.indexOf(MARKER,start+1)<0,'Issue needs exactly one structured ticket contract');
 const contract=JSON.parse(body.slice(start+MARKER.length,end));invariant(/^T\d{3,6}$/.test(contract.id),'Invalid GitHub ticket ID');
 invariant(typeof issue.title==='string'&&issue.title.trim()&&Number.isInteger(issue.number)&&typeof issue.node_id==='string'&&issue.node_id&&typeof issue.html_url==='string'&&issue.html_url.toLowerCase()===url,'Invalid issue identity');
 const normalized=parseTicket('---\n'+Object.entries({...contract,title:issue.title}).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join('\n')+'\n---\n');
 return {...normalized,status:issue.state==='closed'?'closed-unverified':'open',text:body,tracker_sha256:digest({title:issue.title,body:contractBody(body)}),tracker:{repository,number:issue.number,node_id:issue.node_id,url},file:null};
}
function maintainerIssue(issue){return ['OWNER','MEMBER','COLLABORATOR'].includes(issue.author_association);}
export function githubTickets(repo,{api=githubApi}={}){const cfg=trackerConfig(repo);invariant(cfg,'GitHub planning is not selected');const out=[];for(let page=1;page<=100;page++){const rows=api(`repos/${cfg.repository}/issues?state=all&per_page=100&page=${page}`);invariant(Array.isArray(rows),'Invalid GitHub issue page');for(const i of rows)if(!i.pull_request&&maintainerIssue(i)&&issueBody(i).startsWith(MARKER))out.push(issueTicket(i,cfg.repository));if(rows.length<100){invariant(new Set(out.map(t=>t.id)).size===out.length,'Duplicate GitHub ticket ID');return out;}}throw Error('GitHub pagination incomplete; refusing partial ticket inventory');}
export function githubTicket(repo,id,options){const matches=githubTickets(repo,options).filter(t=>t.id===id);invariant(matches.length===1,`Missing or ambiguous GitHub ticket ${id}`);return matches[0];}
export function createGithubTicket(repo,{title,goal,territory,requestId},authorization,{api=githubApi}={}){
 const cfg=trackerConfig(repo),info=repoInfo(repo);invariant(cfg&&typeof authorization==='string'&&authorization.trim(),'Explicit authorized GitHub draft required');
 invariant(typeof title==='string'&&title.trim()&&title.length<=8000&&typeof goal==='string'&&goal.trim()&&goal.length<=8000&&!goal.includes(MARKER)&&Array.isArray(territory)&&territory.length,'Invalid GitHub draft');
 for(const p of territory)invariant(typeof p==='string'&&!/[\\\0\r\n]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..'),'Invalid draft territory');
 const identity=digest({repository:cfg.repository,title,goal,territory,authorization,requestId:requestId||null}),file=path.join(info.state,'github-drafts',identity+'.json'),token='<!-- arti-draft:'+identity+' -->';
 const lock=file+'.lock';fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});try{fs.mkdirSync(lock);}catch{throw Error('GitHub draft request busy or interrupted; inspect its journal before retrying');}
 try{
  let record=fs.existsSync(file)?readJson(file):{status:'intent',repository:cfg.repository};
  if(!record.issue){
   // Reconcile a POST whose response was lost before retrying. The private request
   // fingerprint reveals no authorization text and is not approval authority.
   const matches=[];for(let page=1;page<=100;page++){const rows=api(`repos/${cfg.repository}/issues?state=all&per_page=100&page=${page}`);invariant(Array.isArray(rows),'Invalid issue inventory');matches.push(...rows.filter(i=>!i.pull_request&&maintainerIssue(i)&&i.body?.includes(token)));if(rows.length<100)break;invariant(page<100,'Incomplete draft reconciliation');}
   invariant(matches.length<=1,'Ambiguous draft allocation; inspect GitHub issues');
   writeJson(file,record,0o600);
   record.issue=matches[0]||api(`repos/${cfg.repository}/issues`,{method:'POST',data:{title,body:token+'\nDraft allocation in progress. Not approved or claimable.'}});writeJson(file,record,0o600);
  }
  const issue=record.issue;invariant(Number.isInteger(issue.number)&&issue.number>0&&issue.number<=999999,'GitHub did not allocate a supported issue identity');
  const id=`T${String(issue.number).padStart(3,'0')}`;
  invariant(!githubTickets(repo,{api}).some(t=>t.id===id&&t.tracker.number!==issue.number),'Allocated ticket ID conflicts with an existing contract; inspect and reconcile before retrying');
  if(record.status!=='draft-created'){
   const body=MARKER+JSON.stringify({id,territory,depends_on:[],generation:1})+'\n-->\n'+token+'\n\n## Goal\n\n'+goal+'\n\n## DoD\n\n- [ ] Define and approve observable acceptance before implementation.\n';
   api(`repos/${cfg.repository}/issues/${issue.number}`,{method:'PATCH',data:{body}});record.status='draft-created';writeJson(file,record,0o600);
  }
  return {ticket:id,url:issue.html_url,status:'draft-created',claimed:false,approved:false};
 }finally{fs.rmdirSync(lock);}
}
export function approveGithubTicket(repo,id,authorization,{api=githubApi}={}){
 invariant(typeof authorization==='string'&&authorization.trim(),'Explicit owner approval scope required');const info=repoInfo(repo),ticket=githubTicket(repo,id,{api}),integration=git(repo,'rev-parse',`refs/heads/${integrationBranch(repo)}`);
 const ref=`refs/arti/tickets/${id}`,old=command('git',['rev-parse','--verify',ref],{cwd:info.root});if(old.code===0){const previous=JSON.parse(git(info.root,'cat-file','blob',old.stdout.trim()));if(previous.repo_id===info.id&&digest(previous.ticket.tracker)===digest(ticket.tracker)&&previous.ticket.tracker_sha256===ticket.tracker_sha256&&command('git',['merge-base','--is-ancestor',previous.integration,integration],{cwd:info.root}).code===0)return {ticket:id,contract_sha256:ticket.tracker_sha256,approved_at_integration:previous.integration,unchanged:true};}
 const record={schema_version:1,ticket,authorization,integration,repo_id:info.id};const r=command('git',['hash-object','-w','--stdin'],{cwd:info.root,input:JSON.stringify(record)});invariant(r.code===0,'Could not freeze GitHub contract');
 git(info.root,'update-ref',ref,r.stdout.trim(),old.code===0?old.stdout.trim():'0'.repeat(40));return {ticket:id,contract_sha256:ticket.tracker_sha256,approved_at_integration:integration};
}
export function approvedGithubTicket(repo,id,ref,{api=githubApi}={}){
 const info=repoInfo(repo),record=JSON.parse(git(repo,'cat-file','blob',`refs/arti/tickets/${id}`));invariant(record.repo_id===info.id&&record.ticket.id===id,'Frozen ticket belongs elsewhere');invariant(command('git',['merge-base','--is-ancestor',record.integration,ref],{cwd:info.root}).code===0,'Approval is newer than this integration revision');
 const live=githubTicket(repo,id,{api});invariant(digest(live.tracker)===digest(record.ticket.tracker),'GitHub issue identity changed; obtain fresh owner approval');invariant(live.tracker_sha256===record.ticket.tracker_sha256,'GitHub requirements changed; obtain fresh owner approval');return {...record.ticket,status:live.status};
}
export function publishGithubCompletion(repo,id,{api=githubApi}={}){
 const info=repoInfo(repo),record=readJson(path.join(info.state,'closeout',`${id}.json`)),ticket=githubTicket(repo,id,{api});invariant(record.status==='done'&&record.generation===Number(ticket.generation||1),'Verified closeout required before closing GitHub issue');invariant(command('git',['merge-base','--is-ancestor',record.merge_commit,`refs/heads/${integrationBranch(repo)}`],{cwd:info.root}).code===0,'Merge no longer verified');
 const approved=approvedGithubTicket(repo,id,record.merge_commit,{api});invariant(digest(ticket.tracker)===digest(approved.tracker),'GitHub issue identity changed during completion; inspect before retrying');invariant(record.contract_sha256===digest(ticketContract(approved)),'Completion contract changed; obtain fresh approval and verification');
 const closed=issueTicket(api(`repos/${approved.tracker.repository}/issues/${approved.tracker.number}`,{method:'PATCH',data:{state:'closed',state_reason:'completed'}}),approved.tracker.repository);invariant(closed.status==='closed-unverified'&&digest(closed.tracker)===digest(approved.tracker)&&closed.tracker_sha256===approved.tracker_sha256,'GitHub contract or state changed during close; completion is unverified, inspect the issue before retrying');return {status:'closed',ticket:id,url:approved.tracker.url};
}
if(isMain(import.meta.url))cli(()=>{const a=args(process.argv.slice(2),['repo','ticket','authorization']),repo=a.repo||process.cwd();if(a._[0]==='publish')console.log(JSON.stringify(publishGithubCompletion(repo,a.ticket)));else if(a._[0]==='approve')console.log(JSON.stringify(approveGithubTicket(repo,a.ticket,a.authorization)));else if(a._[0]==='list')console.log(JSON.stringify(githubTickets(repo)));else throw Error('Usage: tracker.mjs list|approve|publish --repo path --ticket ID --authorization scope');});
