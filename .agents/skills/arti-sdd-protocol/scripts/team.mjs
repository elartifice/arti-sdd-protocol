import fs from 'node:fs';
import path from 'node:path';
import { invariant,skillRoot,readJson,readText,digest,repoInfo,args,isMain,cli,packageDigest,command,writeJson } from './lib.mjs';

export const roles=readJson(path.join(skillRoot,'assets/roles.json'));
export function validateTeam(team,hosts) {
  invariant(team&&team.schema_version===2,'Team needs named-role schema_version 2; migrate tier IDs explicitly');
  for(const k of Object.keys(team))invariant(['schema_version','enabled_roles','bindings','max_concurrent'].includes(k),`Unknown team key ${k}`);
  invariant(Array.isArray(team.enabled_roles)&&team.enabled_roles.length>0&&new Set(team.enabled_roles).size===team.enabled_roles.length,'enabled_roles must be a unique nonempty list');
  invariant(Number.isInteger(team.max_concurrent)&&team.max_concurrent>=1&&team.max_concurrent<=4,'max_concurrent must be 1..4');
  for(const role of team.enabled_roles)invariant(Object.hasOwn(roles,role),`Unknown role ${role}; do not reuse old tier IDs`);
  invariant(team.bindings&&typeof team.bindings==='object','Missing per-host bindings');
  for(const host of hosts.filter(h=>h!=='other')) {
    invariant(team.bindings[host],'Missing host bindings');
    for(const role of team.enabled_roles)binding(team,host,role);
  }
  return structuredClone(team);
}
export function binding(team,host,role) {
  invariant(['claude','codex'].includes(host),'Unknown host');
  const b=team.bindings?.[host]?.[role];invariant(b&&typeof b==='object',`Unresolved ${host}/${role} binding`);
  for(const k of Object.keys(b))invariant(['model','effective_model','effort'].includes(k),`Unknown binding field ${k}`);
  for(const k of ['model','effective_model'])invariant(typeof b[k]==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:@/-]{0,127}$/.test(b[k]),`Invalid ${host}/${role} ${k}`);
  const openai=id=>/^(?:gpt-|o[1-9](?:-|$)|codex-)/.test(id),anthropic=id=>/^claude-/.test(id);
  invariant(host!=='codex'||(openai(b.model)&&openai(b.effective_model)),'Wrong-lab or unsupported Codex binding');
  invariant(host!=='claude'||((['opus','sonnet','haiku'].includes(b.model)||anthropic(b.model))&&anthropic(b.effective_model)),'Wrong-lab or unsupported Claude binding');
  invariant(['low','medium','high','xhigh','max'].includes(b.effort),'Unsupported effort; qualify a supported setting');
  return b;
}
export function roleText(role,base=roles[role]?.instructions) {
  invariant(roles[role],`Unknown role ${role}`);
  return `Role: ${role}\n\nRead AGENTS.md, .agents/memory/INDEX.md and the active ticket/spec before work. Shared knowledge is the durable project source; host-private memory is not a substitute. Preserve user scope and authorisation. Never read secret files or print credentials.\n\n${base}\n\nUse only real tools available in this host. Never bypass an enforced denial. For read-only work in Codex, the parent must be read-only or use the separately restricted CLI runner; role instructions alone do not create a sandbox.\n\nUnless a structured JSON response was requested, start your report with STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED; MODIFIED_FILES: paths or none; VERIFY_RECEIPT: actual command/result or NOT_RUN.\n`;
}
export function nativeRole(host,role,b,text) {
  const def=roles[role],name=`arti_${role}`;
  if(host==='claude')return `---\nname: ${name}\ndescription: ${JSON.stringify(def.description)}\nmodel: ${b.model}\neffort: ${b.effort}\ntools: ${def.tools.join(', ')}\ndisallowedTools: ${role==='coordinator'?'Edit, Write':'Agent'}\nmaxTurns: ${def.max_turns}\n---\n\n${text}`;
  return `name = ${JSON.stringify(name)}\ndescription = ${JSON.stringify(def.description)}\nmodel = ${JSON.stringify(b.model)}\nmodel_reasoning_effort = ${JSON.stringify(b.effort)}\ndeveloper_instructions = ${JSON.stringify(text)}\n\n[features]\napps = false\nplugins = false\nmemories = false\nrequest_permissions_tool = false\n`;
}
export function teamOperations(repo,team,hosts) {
  validateTeam(team,hosts);const operations=[];
  operations.push({path:'.agents/team.json',content:JSON.stringify(team,null,2)+'\n',kind:'config'});
  for(const role of team.enabled_roles) {
    const rel=`.agents/roles/${role}.md`,file=path.join(repo,rel),text=fs.existsSync(file)?readText(file):roleText(role);
    operations.push({path:rel,content:text,kind:'seed'});
    for(const host of hosts.filter(h=>h!=='other'))operations.push({path:host==='claude'?`.claude/agents/arti_${role}.md`:`.codex/agents/arti_${role}.toml`,content:nativeRole(host,role,binding(team,host,role),text),kind:'managed'});
  }
  return operations;
}
export function teamFingerprint(repo,team,hosts) {
  const operations=teamOperations(repo,team,hosts);
  return digest(operations.map(o=>({path:o.path,content:o.content})));
}
const installedVersion=host=>{const r=command(host,['--version']);invariant(r.code===0,`${host} CLI unavailable`);return r.stdout.trim();};
export function inspectTeam(repo,{requireLive=false,versionOf=installedVersion}={}) {
  const info=repoInfo(repo),config=readJson(path.join(info.root,'arti_sdd/config.json')),team=readJson(path.join(info.root,'.agents/team.json'));
  validateTeam(team,config.hosts);
  for(const o of teamOperations(info.root,team,config.hosts))invariant(fs.existsSync(path.join(info.root,o.path))&&readText(path.join(info.root,o.path))===o.content,`Team adapter drift: ${o.path}`);
  const fingerprint=teamFingerprint(info.root,team,config.hosts),receipt=path.join(info.state,'qualification/team.json');
  let qualified=false;
  if(fs.existsSync(receipt)) {
    const r=readJson(receipt);
    qualified=r.status==='passed'&&r.fingerprint===fingerprint&&r.package_sha256===packageDigest()&&Array.isArray(r.native_runs);
    for(const host of config.hosts.filter(h=>h!=='other'))for(const role of team.enabled_roles) {
      const b=binding(team,host,role),run=r.native_runs?.find(x=>x.host===host&&x.role===role);
      qualified=qualified&&run?.status==='passed'&&run.model===b.effective_model&&run.effort===b.effort&&['native-invocation','dispatch-plan','task-correlated','parent-binding-differs','role-task-cases'].every(c=>run.checks?.includes(c))&&r.clients?.[host]===versionOf(host);
    }
  }
  invariant(!requireLive||qualified,'Team is configured but not live-qualified for this mapping');
  return {status:qualified?'qualified':'configured',fingerprint,live_verified:qualified,boundaries:{codex_read_only_roles:'Qualified under a read-only parent; native roles inherit parent permissions',claude_effort:'Requested native setting; effective effort telemetry unavailable',evidence:'Trusted local qualification records, not signed attestations'}};
}
export function recordQualification(repo,report,{versionOf=installedVersion}={}) {
  const info=repoInfo(repo),config=readJson(path.join(info.root,'arti_sdd/config.json')),team=readJson(path.join(info.root,'.agents/team.json'));
  const inspected=inspectTeam(repo,{versionOf}),hosts=config.hosts.filter(h=>h!=='other');
  invariant(report?.status==='passed'&&report.package_sha256===packageDigest(),'Evidence is not a passing qualification for this package');
  invariant(report.team_fingerprint===inspected.fingerprint,'Qualification role sources, adapters or model mapping differ');
  invariant(Array.isArray(report.native_runs)&&Array.isArray(report.review_runs),'Missing qualification trials');
  const entries={};
  for(const host of hosts) {
    invariant(report.clients?.[host]===versionOf(host),'Qualification client version is stale');
    for(const role of team.enabled_roles) {
      const b=binding(team,host,role),r=report.native_runs.find(x=>x.host===host&&x.role===role);
      invariant(r?.status==='passed'&&r.model===b.effective_model&&r.effort===b.effort,`No matching native qualification for ${host}/${role}`);
      invariant(r.effort_verified===(host==='codex')&&typeof r.effort_evidence==='string','Effort evidence is missing or overstated');
      invariant(['native-invocation','dispatch-plan','task-correlated','parent-binding-differs','resolved-model','role-task-cases','shared-memory'].every(c=>r.checks?.includes(c)),`Incomplete role evidence: ${host}/${role}`);
      const write=['implementer','escalation'].includes(role);
      invariant(r.parent_permissions===(write?'workspace-write':'read-only')&&r.checks.includes(write?'assigned-source-only-and-protected-tests':'no-product-mutations'),`Unproven permission boundary: ${host}/${role}`);
    }
  }
  for(const host of team.enabled_roles.includes('reviewer')?['claude','codex'].filter(h=>hosts.includes(h)||team.bindings?.[h]?.reviewer):[]) {
    invariant(report.clients?.[host]===versionOf(host),'External reviewer client version is stale');
    const b=binding(team,host,'reviewer'),trials=report.review_runs.filter(t=>t.reviewer===host&&t.author===(host==='claude'?'codex':'claude'));
    invariant(trials.every(t=>t.status==='passed'&&t.model===b.effective_model&&t.effort===b.effort&&t.cli_version===report.clients[host]),'Review trial model/version mismatch');
    for(const fixture of ['security','quantity'])invariant(new Set(trials.filter(t=>t.fixture===fixture&&t.findings>0).map(t=>t.snapshot_sha256)).size>=3,`Missing distinct repeated ${fixture} trials for ${host}`);
    invariant(trials.some(t=>t.fixture==='clean'&&t.findings===0),'Missing clean review control');
    entries[host]={status:'passed',fingerprint:digest({host,role:'reviewer',binding:b,cli_version:report.clients[host]}),team_fingerprint:inspected.fingerprint,package_sha256:packageDigest(),trials};
  }
  const provenance_sha256=digest(report),common={schema_version:1,status:'passed',package_sha256:packageDigest(),provenance_sha256,recorded_at:new Date().toISOString()};
  writeJson(path.join(info.state,'qualification/bindings.json'),{...common,entries},0o600);
  writeJson(path.join(info.state,'qualification/team.json'),{...common,fingerprint:inspected.fingerprint,clients:report.clients,native_runs:report.native_runs},0o600);
  return inspectTeam(repo,{requireLive:true,versionOf});
}
if(isMain(import.meta.url))cli(()=>{const a=args(process.argv.slice(2),['repo','require-live','evidence']),repo=a.repo||process.cwd();console.log(JSON.stringify(a.evidence?recordQualification(repo,readJson(a.evidence)):inspectTeam(repo,{requireLive:!!a['require-live']})));});
