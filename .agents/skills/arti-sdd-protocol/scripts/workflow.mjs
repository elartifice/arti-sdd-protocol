import fs from 'node:fs';
import path from 'node:path';
import { invariant,repoInfo,git,command,readJson,writeJson,readText,atomic,digest,packageDigest,args,isMain,cli,integrationBranch } from './lib.mjs';
import { loadTicket,loadTicketAt,parseTicket,checkPaths,diffPaths,ticketStatus } from './scope.mjs';
import { loadConfig } from './schema.mjs';
import { snapshot,freshReview,reviewRequired } from './review.mjs';
import { releaseClaim,landingLock,reserveCloseout } from './claim.mjs';

export function lintTickets(repo) {
  const dir=path.join(repoInfo(repo).root,'arti_sdd/tickets'),tickets=fs.readdirSync(dir).filter(f=>f.endsWith('.md')).map(f=>parseTicket(readText(path.join(dir,f)))),byId=new Map();
  for(const t of tickets){invariant(!byId.has(t.id),`Duplicate ticket ${t.id}`);invariant(['open','blocked','done','archived','in-review'].includes(t.status),`Invalid ticket status ${t.status}`);byId.set(t.id,t);}
  const visiting=new Set(),visited=new Set();
  function visit(id){invariant(byId.has(id),`Missing dependency ${id}`);invariant(!visiting.has(id),`Dependency cycle at ${id}`);if(visited.has(id))return;visiting.add(id);for(const d of byId.get(id).depends_on)visit(d);visiting.delete(id);visited.add(id);}
  for(const t of tickets)visit(t.id);
  return tickets;
}
export function status(repo) {
  const info=repoInfo(repo),tickets=lintTickets(repo);
  return tickets.map(t=>{
    const claim=path.join(info.state,'claims',`${t.id}.json`);let state=ticketStatus(info.root,t);
    if(state!=='done'&&state!=='archived'&&fs.existsSync(claim))state='claimed';
    return {id:t.id,title:t.title,status:state,depends_on:t.depends_on};
  }).map((t,_i,all)=>({...t,ready:t.status==='open'&&t.depends_on.every(d=>all.find(p=>p.id===d)?.status==='done')}));
}
export function verifyTicket(repo,id,base) {
  const info=repoInfo(repo),t=loadTicket(info.root,id),candidate=snapshot(repo,id,base);
  invariant(Array.isArray(t.checks)&&t.checks.length>0,'Ticket requires explicit checks as JSON arrays of executable/arguments');
  checkPaths(info.root,id,diffPaths(info.root,candidate.merge_base));
  const results=[];
  for(const argv of t.checks){invariant(Array.isArray(argv)&&argv.length>0&&argv.every(x=>typeof x==='string'),'Invalid check argument array');const r=command(argv[0],argv.slice(1),{cwd:info.root,timeout:180000});results.push({command:argv,exit:r.code,stdout_sha256:digest(r.stdout),stderr_sha256:digest(r.stderr)});}
  const receipt={schema_version:1,ticket:id,head_sha:candidate.head_sha,base_sha:candidate.base_sha,merge_base:candidate.merge_base,integration_sha:git(info.root,'rev-parse',`refs/heads/${integrationBranch(info.root)}`),package_sha256:packageDigest(),commands_sha256:digest(t.checks),status:results.every(r=>r.exit===0)?'passed':'failed',results};
  writeJson(path.join(info.state,'checks',`${id}.json`),receipt,0o600);invariant(receipt.status==='passed','Ticket checks failed');return receipt;
}
export function closeout(repo,id,{merge,defaultBranch=null,session,review=null,onCleanup=()=>{}}={}) {
  const info=repoInfo(repo),t=loadTicket(info.root,id),config=loadConfig(path.join(info.root,'arti_sdd/config.json'));
  const integration=integrationBranch(info.root,config);invariant(!defaultBranch||defaultBranch===integration,'Closeout must use the configured Git integration branch');defaultBranch=integration;
  invariant(merge,'Merge confirmation is required; opening or queuing a PR is not a merge');
  const mergeCommit=git(info.root,'rev-parse','--verify',`${merge}^{commit}`);invariant(!merge.startsWith('-')&&!defaultBranch.startsWith('-'),'Invalid merge reference');
  invariant(command('git',['merge-base','--is-ancestor',mergeCommit,defaultBranch],{cwd:info.root}).code===0,'Merge is not present on the default branch');
  const checks=readJson(path.join(info.state,'checks',`${id}.json`)),head=git(info.root,'rev-parse','HEAD');
  invariant(checks.status==='passed'&&checks.head_sha===head&&checks.package_sha256===packageDigest()&&checks.commands_sha256===digest(t.checks),'Checks are missing, failed or stale');
  invariant(command('git',['merge-base','--is-ancestor',checks.integration_sha,mergeCommit],{cwd:info.root}).code===0,'Merge predates the verified integration revision');
  invariant(Number(loadTicketAt(info.root,id,mergeCommit).generation||1)===Number(t.generation||1),'Merge belongs to another ticket generation');
  invariant(git(info.root,'status','--porcelain','--untracked-files=all')==='','Dirty worktree cannot close out');
  const items=t.text.split(/^## DoD\s*$/m)[1]?.split(/^## /m)[0]?.match(/^- \[[ xX]\].+$/gm)||[];
  invariant(items.length>0&&items.every(x=>/^- \[[xX]\]/.test(x)),'Incomplete Definition of Done');
  for(const file of git(info.root,'diff','--name-only','-z',checks.merge_base,head).split('\0').filter(Boolean))invariant(git(info.root,'ls-tree',head,'--',file)===git(info.root,'ls-tree',mergeCommit,'--',file),`Merged content differs: ${file}`);
  if(reviewRequired(config,t))invariant(review?.completed===true&&review.status==='passed'&&review.gate==='passed','Required review receipt missing or incomplete');
  if(review){freshReview(repo,review,checks.base_sha,{ticket:id});invariant(review.gate!=='blocked','Review findings remain unresolved');}
  const preliminary={schema_version:1,ticket:id,generation:Number(t.generation||1),candidate_head:head,merge_commit:mergeCommit,default_branch:defaultBranch,worktree_cleanup:'manual-preserve'},reserved=reserveCloseout(repo,id,session,preliminary);let lock='already-released';
  const claimFile=path.join(info.state,'claims',`${id}.json`);let claim='already-released';
  if(fs.existsSync(claimFile)){releaseClaim(repo,id,session);claim='released';}
  if(reserved.owned_lock){landingLock(repo,'release',id,session);lock='released';}
  onCleanup();const receipt={...preliminary,status:'done',claim,lock};
  writeJson(path.join(info.state,'closeout',`${id}.json`),receipt,0o600);return receipt;
}
export function reopen(repo,id) {
  const info=repoInfo(repo),t=loadTicket(info.root,id);let text=t.text.replace(/^status: .*$/m,'status: "open"');const generation=Number(t.generation||1)+1;
  text=/^generation: /m.test(text)?text.replace(/^generation: .*$/m,`generation: ${generation}`):text.replace(/^---\n/,`---\ngeneration: ${generation}\n`);
  atomic(path.join(info.root,t.file),text);return {ticket:id,generation,status:'open'};
}
if(isMain(import.meta.url))cli(()=>{const a=args(process.argv.slice(2),['repo','ticket','base','merge','default-branch','session','review']),repo=a.repo||process.cwd(),action=a._[0];let result;
 if(action==='status')result=status(repo);else if(action==='lint')result={status:'passed',tickets:lintTickets(repo).length};else if(action==='verify')result=verifyTicket(repo,a.ticket,a.base);else if(action==='reopen')result=reopen(repo,a.ticket);else if(action==='closeout')result=closeout(repo,a.ticket,{merge:a.merge,defaultBranch:a['default-branch']||null,session:a.session,review:a.review?readJson(a.review):null});else throw new Error('Usage: workflow.mjs status|lint|verify|reopen|closeout --ticket T001 [--base ref --merge commit]');console.log(JSON.stringify(result,null,2));});
