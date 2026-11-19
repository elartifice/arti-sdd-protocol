import fs from 'node:fs';import path from 'node:path';
import {invariant,repoInfo,readJson,writeJson,git,digest,packageDigest,args,isMain,cli} from './lib.mjs';
import {approvedTicket,ticketContract} from './scope.mjs';
export function validationPlan(ticket){
 const p=ticket.validation;if(!p){invariant(Array.isArray(ticket.checks)&&ticket.checks.length>0&&ticket.checks.every(a=>Array.isArray(a)&&a.length>0&&a.every(x=>typeof x==='string')&&a[0].trim()),'Ticket requires valid checks as executable/argument arrays or a validation plan');return {stages:{stable:ticket.checks},human_required:false,selection:'approved ticket checks'};}
 invariant(p&&typeof p.human_required==='boolean'&&Object.keys(p).every(k=>['reproduce','focused','integration','stable','human_required'].includes(k)),'Invalid explicit validation plan');
 const stages={};for(const name of ['reproduce','focused','integration','stable']){const rows=p[name]||[];invariant(Array.isArray(rows)&&rows.every(a=>Array.isArray(a)&&a.length&&a.every(x=>typeof x==='string')&&a[0].trim()),'Invalid validation command');stages[name]=rows;}
 invariant(stages.stable.length>0&&stages.integration.length>0,'Validation plan requires concrete integration and stable gates');return {stages,human_required:p.human_required,selection:'focused iteration; ordered integration and stable final gate'};
}
export function recordHumanAcceptance(repo,ticket,{authorization,source,evidence}){
 const info=repoInfo(repo),head=git(info.root,'rev-parse','HEAD'),t=approvedTicket(info.root,ticket);invariant(git(info.root,'status','--porcelain','--untracked-files=all')==='','Commit the observed candidate before recording human acceptance');invariant(validationPlan(t).human_required,'Human acceptance was not selected');invariant(authorization?.trim()&&source?.trim()&&evidence?.trim(),'Actual owner acceptance, source and observed evidence are required; never synthesize consent');
 const r={ticket,head_sha:head,contract_sha256:digest(ticketContract(t)),package_sha256:packageDigest(),authorization,source,evidence,status:'accepted',created_at:new Date().toISOString()};invariant(git(info.root,'rev-parse','HEAD')===head&&git(info.root,'status','--porcelain','--untracked-files=all')==='','Candidate changed while recording human acceptance; repeat the owner observation');writeJson(path.join(info.state,'acceptance',ticket+'.json'),r,0o600);return r;
}
export function finalAcceptance(repo,ticket){
 const info=repoInfo(repo),t=approvedTicket(info.root,ticket),plan=validationPlan(t),checks=readJson(path.join(info.state,'checks',ticket+'.json')),head=git(repo,'rev-parse','HEAD');
 invariant(checks.status==='passed'&&checks.head_sha===head&&checks.package_sha256===packageDigest()&&checks.commands_sha256===digest(Object.values(plan.stages).flat())&&checks.contract_sha256===digest(ticketContract(t)),'Final review requires current automated acceptance');
 invariant(checks.validation_sha256===digest(plan),'Validation plan changed; repeat affected checks');let human=null;
 if(plan.human_required){human=readJson(path.join(info.state,'acceptance',ticket+'.json'));invariant(human.status==='accepted'&&human.head_sha===head&&human.contract_sha256===digest(ticketContract(t))&&human.package_sha256===packageDigest(),'Human acceptance missing or stale; repeat affected acceptance');}
 return {checks_sha256:digest(checks),human_sha256:human?digest(human):null,head_sha:head,order:'automated integration/stable and applicable human acceptance before final review'};
}
if(isMain(import.meta.url))cli(()=>{const a=args(process.argv.slice(2),['repo','ticket','authorization','source','evidence']);invariant(a._[0]==='human','Usage: acceptance.mjs human --ticket ID --authorization actual-owner-acceptance --source reference --evidence observation');console.log(JSON.stringify(recordHumanAcceptance(a.repo||process.cwd(),a.ticket,a)));});
