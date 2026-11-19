import fs from 'node:fs';
import {dodItems} from './contracts.mjs';
import {trackerConfig,githubTickets,publishGithubCompletion} from './tracker.mjs';
import path from 'node:path';
import { invariant,repoInfo,git,command,readJson,writeJson,readText,atomic,digest,packageDigest,args,isMain,cli,integrationBranch } from './lib.mjs';
import { loadTicket,approvedTicket,loadTicketAt,parseTicket,checkPaths,diffPaths,ticketStatus,peerOverlap } from './scope.mjs';
import { loadConfig } from './schema.mjs';
import {validationPlan,finalAcceptance} from './acceptance.mjs';
import {ticketContract} from './scope.mjs';
import { baseline } from './baseline.mjs';
import { checkCandidate,freshReview,reviewRequired,requireKnownFindings } from './review.mjs';
import { releaseClaim,landingLock,reserveCloseout } from './claim.mjs';

export function lintTickets(repo) {
  const dir=path.join(repoInfo(repo).root,'arti_sdd/tickets'),tickets=trackerConfig(repo)?githubTickets(repo):fs.readdirSync(dir).filter(f=>f.endsWith('.md')).map(f=>parseTicket(readText(path.join(dir,f)))),byId=new Map();
  for(const t of tickets){invariant(!byId.has(t.id),`Duplicate ticket ${t.id}`);invariant(['open','blocked','done','archived','in-review','closed-unverified'].includes(t.status),`Invalid ticket status ${t.status}`);byId.set(t.id,t);}
  const visiting=new Set(),visited=new Set();
  function visit(id){invariant(byId.has(id),`Missing dependency ${id}`);invariant(!visiting.has(id),`Dependency cycle at ${id}`);if(visited.has(id))return;visiting.add(id);for(const d of [...byId.get(id).depends_on,...(byId.get(id).landing_depends_on||[])])visit(d);visiting.delete(id);visited.add(id);}
  for(const t of tickets)visit(t.id);
  return tickets;
}
export function status(repo) {
  const info=repoInfo(repo),tickets=lintTickets(repo);
  return tickets.map(t=>{
    const claim=path.join(info.state,'claims',`${t.id}.json`);let state=ticketStatus(info.root,t);
    if(state!=='done'&&state!=='archived'&&fs.existsSync(claim))state='claimed';
    return {id:t.id,title:t.title,status:state,depends_on:t.depends_on,landing_depends_on:t.landing_depends_on||[]};
  }).map((t,_i,all)=>{
    const dependencies=t.depends_on.filter(d=>all.find(p=>p.id===d)?.status!=='done');
    const ticket=tickets.find(p=>p.id===t.id),overlaps=t.status==='open'?peerOverlap(info.root,ticket):[];
    const blockers=[...dependencies.map(id=>({kind:'dependency',ticket:id,reason:'Required prerequisite has not completed'})),...overlaps.map(o=>({kind:'territory',ticket:o.ticket,reason:`Reserved ${o.b} overlaps ${o.a}`}))];
    const landing_blockers=t.landing_depends_on.filter(id=>all.find(p=>p.id===id)?.status!=='done').map(id=>({kind:'landing-dependency',ticket:id,reason:'Implementation may proceed; prerequisite must land before this ticket'}));
    return {...t,landing_blockers,dependency_ready:t.status==='open'&&dependencies.length===0,claim_available:t.status==='open'&&blockers.length===0,ready:t.status==='open'&&blockers.length===0,blockers,coordination:'local claims and territory only; cross-clone work needs explicit disjoint allocation'};
  });
}
export function verifyTicket(repo,id,base) {
  const info=repoInfo(repo),candidate=checkCandidate(repo,id,base),t=candidate.ticket;
  const integration_sha=git(info.root,'rev-parse',`refs/heads/${integrationBranch(info.root)}`);invariant(command('git',['merge-base','--is-ancestor',integration_sha,candidate.head_sha],{cwd:info.root}).code===0,'Integrate the current integration branch before validation');
  const plan=validationPlan(t),provenance=baseline(info.root,Object.values(plan.stages).flat());
  const changed=diffPaths(info.root,candidate.merge_base);if(changed.length)checkPaths(info.root,id,changed,{approved:t});
  writeJson(path.join(info.state,'checks',`${id}.json`),{status:'running',ticket:id,head_sha:candidate.head_sha},0o600);
  const results=[];
  for(const [stage,commands] of Object.entries(plan.stages))for(const argv of commands){invariant(Array.isArray(argv)&&argv.length>0&&argv.every(x=>typeof x==='string'),'Invalid check argument array');const r=command(argv[0],argv.slice(1),{cwd:info.root,timeout:180000});results.push({stage,command:argv,exit:r.code,stdout_sha256:digest(r.stdout),stderr_sha256:digest(r.stderr)});}
  invariant(git(info.root,'rev-parse','HEAD')===candidate.head_sha&&git(info.root,'status','--porcelain','--untracked-files=all')==='','Checks changed the candidate; commit and repeat validation');
  invariant(git(info.root,'rev-parse',`refs/heads/${integrationBranch(info.root)}`)===integration_sha,'Integration advanced during checks; integrate and repeat the affected gate');
  const receipt={schema_version:1,ticket:id,head_sha:candidate.head_sha,base_sha:candidate.base_sha,merge_base:candidate.merge_base,integration_sha,package_sha256:packageDigest(),commands_sha256:digest(Object.values(plan.stages).flat()),contract_sha256:digest(ticketContract(t)),validation_sha256:digest(plan),baseline:provenance,status:results.every(r=>r.exit===0)?'passed':'failed',results};
  writeJson(path.join(info.state,'checks',`${id}.json`),receipt,0o600);invariant(receipt.status==='passed','Ticket checks failed');return receipt;
}
export function closeout(repo,id,{merge,defaultBranch=null,session,review=null,onCleanup=()=>{}}={}) {
  session??=process.env.ARTI_SESSION_ID;
  const info=repoInfo(repo),t=approvedTicket(info.root,id),config=loadConfig(path.join(info.root,'arti_sdd/config.json'));
  const integration=integrationBranch(info.root,config);invariant(!defaultBranch||defaultBranch===integration,'Closeout must use the configured Git integration branch');defaultBranch=integration;
  for(const dep of t.landing_depends_on||[])invariant(ticketStatus(info.root,loadTicket(info.root,dep))==='done',`Landing prerequisite ${dep} is not verified complete`);
  invariant(merge,'Merge confirmation is required; opening or queuing a PR is not a merge');
  const mergeCommit=git(info.root,'rev-parse','--verify',`${merge}^{commit}`);invariant(!merge.startsWith('-')&&!defaultBranch.startsWith('-'),'Invalid merge reference');
  invariant(command('git',['merge-base','--is-ancestor',mergeCommit,`refs/heads/${defaultBranch}`],{cwd:info.root}).code===0,'Merge is not present on the default branch');
  const checks=readJson(path.join(info.state,'checks',`${id}.json`)),head=git(info.root,'rev-parse','HEAD');
  invariant(checks.status==='passed'&&checks.head_sha===head&&checks.package_sha256===packageDigest()&&checks.commands_sha256===digest(Object.values(validationPlan(t).stages).flat())&&checks.contract_sha256===digest(ticketContract(t)),'Checks are missing, failed or stale');
  const acceptance=finalAcceptance(repo,id);invariant(acceptance.head_sha===head&&acceptance.checks_sha256===digest(checks),'Acceptance belongs to another candidate or changed checks; repeat closeout');
  invariant(command('git',['merge-base','--is-ancestor',checks.integration_sha,mergeCommit],{cwd:info.root}).code===0,'Merge predates the verified integration revision');
  invariant(Number(loadTicketAt(info.root,id,mergeCommit).generation||1)===Number(t.generation||1),'Merge belongs to another ticket generation');
  invariant(git(info.root,'status','--porcelain','--untracked-files=all')==='','Dirty worktree cannot close out');
  const items=dodItems(t.text);
  invariant(items.length>0&&items.every(x=>/^- \[[xX]\]/.test(x)),'Incomplete Definition of Done');
  for(const file of git(info.root,'diff','--no-renames','--name-only','-z',checks.merge_base,head).split('\0').filter(Boolean))invariant(git(info.root,'ls-tree',head,'--',file)===git(info.root,'ls-tree',mergeCommit,'--',file),`Merged content differs: ${file}`);
  invariant(git(info.root,'rev-parse',`${head}^{tree}`)===git(info.root,'rev-parse',`${mergeCommit}^{tree}`),'Merged tree differs from the tested candidate; integrate and validate the actual result');
  const parents=git(info.root,'rev-list','--parents','-n','1',mergeCommit).split(' ').slice(1);
  invariant(parents.every(parent=>command('git',['merge-base','--is-ancestor',parent,head],{cwd:info.root}).code===0),'Landing includes integration history absent from the tested candidate; integrate and validate before landing');
  if(reviewRequired(config,t))invariant(review?.completed===true&&review.status==='passed'&&review.gate==='passed','Required review receipt missing or incomplete');
  if(review){freshReview(repo,review,checks.base_sha,{ticket:id});invariant(review.gate!=='blocked','Review findings remain unresolved');}
  else requireKnownFindings(repo,id,head,digest(ticketContract(t)));
  invariant(digest(finalAcceptance(repo,id))===digest(acceptance)&&git(info.root,'status','--porcelain','--untracked-files=all')==='','Candidate acceptance changed during closeout; repeat the affected gate');
  const finalTicket=approvedTicket(info.root,id),finalItems=dodItems(finalTicket.text);invariant(digest(ticketContract(finalTicket))===checks.contract_sha256&&finalItems.length>0&&finalItems.every(x=>/^- \[[xX]\]/.test(x)),'Ticket contract or Definition of Done changed during closeout');
  invariant(command('git',['merge-base','--is-ancestor',mergeCommit,`refs/heads/${defaultBranch}`],{cwd:info.root}).code===0,'Landing branch changed during closeout');
  const preliminary={schema_version:1,ticket:id,contract_sha256:digest(ticketContract(t)),generation:Number(t.generation||1),candidate_head:head,merge_commit:mergeCommit,default_branch:defaultBranch,worktree_cleanup:'manual-preserve'},reserved=reserveCloseout(repo,id,session,preliminary);let lock='already-released';
  const claimFile=path.join(info.state,'claims',`${id}.json`);let claim='already-released';
  if(fs.existsSync(claimFile)){releaseClaim(repo,id,session);claim='released';}
  if(reserved.owned_lock){landingLock(repo,'release',id,session);lock='released';}
  onCleanup();const receipt={...preliminary,status:'done',claim,lock};
  writeJson(path.join(info.state,'closeout',`${id}.json`),receipt,0o600);if(trackerConfig(repo))publishGithubCompletion(repo,id);return receipt;
}
export function reopen(repo,id) {
  const info=repoInfo(repo),t=loadTicket(info.root,id);invariant(!trackerConfig(repo),'Reopen the GitHub contract with a new generation and explicit approval');let text=t.text.replace(/^status:.*$/m,'status: "open"');const generation=Number(t.generation||1)+1;
  text=/^generation:/m.test(text)?text.replace(/^generation:.*$/m,`generation: ${generation}`):text.replace(/^---\n/,`---\ngeneration: ${generation}\n`);
  atomic(path.join(info.root,t.file),text);return {ticket:id,generation,status:'open'};
}
if(isMain(import.meta.url))cli(()=>{const a=args(process.argv.slice(2),['repo','ticket','base','merge','default-branch','session','review']),repo=a.repo||process.cwd(),action=a._[0];let result;
 if(action==='status')result=status(repo);else if(action==='lint')result={status:'passed',tickets:lintTickets(repo).length};else if(action==='verify')result=verifyTicket(repo,a.ticket,a.base);else if(action==='reopen')result=reopen(repo,a.ticket);else if(action==='closeout')result=closeout(repo,a.ticket,{merge:a.merge,defaultBranch:a['default-branch']||null,session:a.session,review:a.review?readJson(a.review):null});else throw new Error('Usage: workflow.mjs status|lint|verify|reopen|closeout --ticket T001 [--base ref --merge commit]');console.log(JSON.stringify(result,null,2));});
