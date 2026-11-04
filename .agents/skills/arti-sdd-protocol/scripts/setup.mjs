import fs from 'node:fs';
import path from 'node:path';
import { skillRoot,version,invariant,readText,readJson,atomic,writeJson,digest,repoInfo,args,isMain,cli,integrationBranch,git } from './lib.mjs';
import { loadConfig,validateConfig,detectFacts,mergeFacts } from './schema.mjs';
import { mergeHooks,ownedHooks,codexConfig } from './hooks.mjs';
import { teamOperations,binding } from './team.mjs';

const START='<!-- arti-sdd:start -->', END='<!-- arti-sdd:end -->';
export function marked(text,block) {
  const starts=text.split(START).length-1, ends=text.split(END).length-1;
  invariant(starts===ends&&starts<=1,'Malformed or duplicate protocol markers');
  if(!starts)return `${text.trimEnd()}${text.trim()?'\n\n':''}${block}\n`;
  const a=text.indexOf(START),b=text.indexOf(END)+END.length;
  invariant(b>a,'Malformed protocol marker order');
  return `${text.slice(0,a)}${block}${text.slice(b)}`;
}
function blockOf(text){const a=text.indexOf(START),b=text.indexOf(END);return a<0?'':text.slice(a,b+END.length);}
function files(dir,base=dir) {return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{invariant(!e.isSymbolicLink(),'Source package must not contain symlinks');const p=path.join(dir,e.name);return e.isDirectory()?files(p,base):[path.relative(base,p).split(path.sep).join('/')];});}
function present(p){try{return fs.lstatSync(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function inspect(p){const st=present(p);if(!st)return null;invariant(st.isFile()||st.isSymbolicLink(),`Expected a file/link: ${p}`);return st.isSymbolicLink()?{type:'link',target:fs.readlinkSync(p)}:{type:'file',content:fs.readFileSync(p,'utf8')};}
function safeDestination(root,rel) {
  invariant(!path.isAbsolute(rel)&&!rel.split('/').some(x=>x==='..'||x===''),'Invalid setup path');
  let p=root;
  for(const part of rel.split('/').slice(0,-1)) {p=path.join(p,part);const st=present(p);if(st?.isSymbolicLink()) {const resolved=fs.realpathSync(p);invariant(resolved===root||resolved.startsWith(root+path.sep),`Setup path escapes repository through link: ${rel}`);}}
  return path.join(root,rel);
}
export function planSetup(repo,configInput,{team=null}={}) {
  const info=repoInfo(repo),root=info.root;
  let config=validateConfig(configInput);
  if(config.decisions.team==='custom')team??=present(path.join(root,'.agents/team.json'))?readJson(path.join(root,'.agents/team.json')):null;
  if(['required','risk'].includes(config.decisions.review)){invariant(team?.enabled_roles?.includes('reviewer'),'Required review needs an enabled reviewer role');for(const host of ['claude','codex'])binding(team,host,'reviewer');}
  const priorConfig=safeDestination(root,'arti_sdd/config.json');
  const settled=present(priorConfig)?loadConfig(priorConfig):null;
  config.default_branch??=settled?.default_branch||integrationBranch(root,config);
  integrationBranch(root,config);
  if(settled)invariant(digest({...settled,default_branch:settled.default_branch||config.default_branch})===digest(config),'Existing decisions differ; reconcile arti_sdd/config.json explicitly before setup');
  invariant(config.decisions.qa!=='recorded'&&config.decisions.board!=='visual','Selected optional module is not shipped by this core');
  const manifestFile=safeDestination(root,'.agents/install.json');
  const prior=present(manifestFile)?readJson(manifestFile):{files:{}};
  invariant(prior.files&&typeof prior.files==='object','Invalid prior installation manifest');
  const operations=[], add=(rel,after,kind='managed')=>{
    const dest=safeDestination(root,rel),before=inspect(dest),old=prior.files[rel];
    if(kind==='seed'&&before)return;
    if(old&&before&&kind!=='config'&&digest(old.kind==='block'?blockOf(before.content||''):old.kind==='hooks'?ownedHooks(before.content):before)!==old.sha256)throw new Error(`Managed content changed: ${rel}; reconcile it before upgrade`);
    if(!old&&before&&kind==='managed'&&digest(before)!==digest(after))throw new Error(`Existing unowned file: ${rel}`);
    operations.push({path:rel,before,after,kind});
  };
  const routing=config.decisions.team==='custom'?'\nBefore delegating, run scripts/dispatch.mjs in the installed arti-sdd-protocol skill to prepare the host/surface/role request. Use its exact model/effort and role source; generic inherited-model workers are not the configured team. Verify actual native evidence with dispatch.mjs before accepting a result. Codex desktop needs explicit model/reasoning_effort and fork_turns:none; its collaboration tool cannot select a native profile.':'',block=`${START}\n## Shared SDD workflow\nRead arti_sdd/config.json, the active ticket/spec and .agents/memory/INDEX.md before work. Durable rules live here; shared skills and roles live under .agents. Record lasting lessons in shared knowledge with source/date.\nOne active ticket and explicit territory protect product edits. Read-only planning and minimal ticket creation/repair need no claim. Preserve active tasks and prior approvals through resume, compaction and repeated startup. Headless review skips orientation only.\nMerge policy: ${config.decisions.merge}. Cross-lab policy: ${config.decisions.review}${config.decisions.review==='risk'?` for ${config.decisions.review_risks.join(', ')}`:''}. Required checks and review must cover the exact candidate; unavailable, incomplete or stale evidence is not a pass.${routing}\nUse the installed arti-start, arti-grab-ticket, arti-plan, arti-land-ticket and arti-handoff skills or invoke their scripts directly. Unsupported optional modules remain unverified. External publishing, deployment and messaging need existing owner authorisation.\n${END}`;
  const agentsPath=path.join(root,'AGENTS.md'),oldAgents=inspect(agentsPath);
  invariant(!oldAgents||oldAgents.type==='file','AGENTS.md must be the canonical regular source');
  add('AGENTS.md',{type:'file',content:marked(oldAgents?.content||'',block)},'block');
  const ignore=inspect(path.join(root,'.gitignore'));
  invariant(!ignore||ignore.type==='file','.gitignore must be a regular file');
  const ignoreBlock=`${START}\n/arti_sdd/.state/\n${END}`;
  add('.gitignore',{type:'file',content:marked(ignore?.content||'',ignoreBlock)},'block');
  add('arti_sdd/config.json',{type:'file',content:JSON.stringify(config,null,2)+'\n'},'config');
  add('.agents/memory/INDEX.md',{type:'file',content:'# Shared project knowledge\n\nRead AGENTS.md for rules, arti_sdd/DECISIONS.md for decisions, and the active ticket/handoff for current work. Add topic links only for durable lessons, with source/date and supersession. Host-private histories are not shared state.\n'},'seed');
  add('arti_sdd/DECISIONS.md',{type:'file',content:'# Decisions\n\nSetup choices live in config.json. Record rationale and approved changes here.\n'},'seed');
  add('arti_sdd/BACKLOG.md',{type:'file',content:'# Backlog\n\nGive unresolved work a milestone and an explicit home.\n'},'seed');
  const ticketDir=path.join(root,'arti_sdd/tickets'),existingT001=present(ticketDir)?fs.readdirSync(ticketDir).filter(f=>/^T001(?:-[^/]+)?\.md$/.test(f)):[];
  invariant(existingT001.length<=1,'Existing planning has duplicate T001 tickets; reconcile before setup');
  if(!existingT001.length)add('arti_sdd/tickets/T001.md',{type:'file',content:readText(path.join(skillRoot,'templates/ticket.md.tmpl'))},'seed');
  for(const f of files(skillRoot)) add(`.agents/skills/arti-sdd-protocol/${f}`,{type:'file',content:readText(path.join(skillRoot,f))});
  const rituals={
    'arti-start':'Read AGENTS.md, arti_sdd/config.json, .agents/memory/INDEX.md and the active ticket. Orient once; continue an active authorised task on resume/compaction. Recommend only dependency-ready work. Report missing checks honestly.',
    'arti-grab-ticket':'Read the selected ticket/spec and shared knowledge. Run node .agents/skills/arti-sdd-protocol/scripts/claim.mjs claim --ticket <ID> --session <stable-id>. Use a ticket worktree for isolated coding. Explain its goal, territory and evidence; preserve existing approval.',
    'arti-plan':'Investigate the active ticket read-only. Present concrete changes, choices and checks mapped to its DoD. Honour prior authorisation; resolve actual missing decisions before dependent writes. For a custom team, prepare every delegation with the installed scripts/dispatch.mjs plan and verify native execution evidence with dispatch.mjs verify before accepting the worker result.',
    'arti-land-ticket':'Run scope and behavioral checks, then the configured review gate on the committed candidate. Required review must be fresh and findings resolved. Under manual merge, stop in review until merge is confirmed. Post-merge close-out preserves dirty work and reports actual claim/lock release. Never publish without authority.',
    'arti-handoff':'Record completed work, exact evidence, current revision, relevant shared lessons and next step in the ticket. Home follow-ups. Preserve the active claim or release it explicitly. Do not mark unfinished work done or archive the chat.'
  };
  const claudeSkills=path.join(root,'.claude/skills');
  const wholeSharedLink=present(claudeSkills)?.isSymbolicLink()&&fs.realpathSync(claudeSkills)===path.join(root,'.agents/skills');
  for(const [name,body]of Object.entries(rituals)) {
    add(`.agents/skills/${name}/SKILL.md`,{type:'file',content:`---\nname: ${name}\ndescription: ${body.split('. ')[0]}.\n---\n\n${body}\n\nClaude Code: invoke /${name}. Codex: invoke $${name}. Other agents: read this file and run the named helpers directly.\n`});
    if(config.hosts.includes('claude')&&!wholeSharedLink) {
      const rel=`.claude/skills/${name}`,wanted=path.relative(path.dirname(path.join(root,rel)),path.join(root,`.agents/skills/${name}`));
      add(rel,{type:'link',target:wanted});
    }
  }
  if(config.hosts.includes('claude')&&!wholeSharedLink){const rel='.claude/skills/arti-sdd-protocol';add(rel,{type:'link',target:path.relative(path.dirname(path.join(root,rel)),path.join(root,'.agents/skills/arti-sdd-protocol'))});}
  if(config.hosts.includes('claude')) {
    const old=inspect(path.join(root,'CLAUDE.md'));
    if(old?.type==='file') {
      const content=old.content.match(/^@AGENTS\.md\s*$/m)?old.content:`@AGENTS.md\n\n${old.content}`;
      add('CLAUDE.md',{type:'file',content},'owner');
    } else add('CLAUDE.md',{type:'link',target:'AGENTS.md'});
  }
  for(const host of config.hosts.filter(h=>h==='claude'||h==='codex')) {
    const rel=host==='claude'?'.claude/settings.json':'.codex/hooks.json';
    const existing=inspect(path.join(root,rel));invariant(!existing||existing.type==='file','Host hook config must be a regular file');
    add(rel,{type:'file',content:mergeHooks(existing?.content||'{}')},'hooks');
  }
  if(config.hosts.includes('codex')) {
    const existing=inspect(path.join(root,'.codex/config.toml'));invariant(!existing||existing.type==='file','Codex config must be a regular file');
    add('.codex/config.toml',{type:'file',content:codexConfig(existing?.content||'',team?.max_concurrent??null)},'owner');
  }
  if(config.decisions.team==='custom') {
    const stored=path.join(root,'.agents/team.json');team??=present(stored)?readJson(stored):null;
    invariant(team,'Custom team requires an explicit team mapping');
    for(const o of teamOperations(root,team,config.hosts))add(o.path,{type:'file',content:o.content},o.kind);
  }
  for(const [rel,old] of Object.entries(prior.files))if(!operations.some(o=>o.path===rel)) {
    const before=inspect(safeDestination(root,rel));if(!before)continue;
    invariant(digest(old.kind==='block'?blockOf(before.content||''):old.kind==='hooks'?ownedHooks(before.content):before)===old.sha256,`Retired managed content changed: ${rel}; reconcile before removal`);
    let after=null;
    if(old.kind==='hooks') {const object=JSON.parse(before.content);for(const event of Object.keys(object.hooks||{}))object.hooks[event]=object.hooks[event].filter(b=>!b.hooks.some(h=>h.command?.includes('ARTI_SDD_HOOK_VERSION=1')));after={type:'file',content:JSON.stringify(object,null,2)+'\n'};}
    operations.push({path:rel,before,after,kind:'retire'});
  }
  const {conflicts}=mergeFacts(config,detectFacts(root));
  return {schema_version:1,version,repo_id:info.id,root,config,conflicts,operations,manifest_before:inspect(manifestFile)};
}
function alive(pid) {try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}}
function restoreOperation(root,o) {
  const dest=safeDestination(root,o.path),current=inspect(dest);
  if(digest(current)===digest(o.before))return;
  invariant(digest(current)===digest(o.after),`Recovery found a concurrent edit: ${o.path}; preserve it and reconcile manually`);
  if(present(dest))fs.unlinkSync(dest);
  if(o.before?.type==='file')atomic(dest,o.before.content);
  else if(o.before?.type==='link')fs.symlinkSync(o.before.target,dest);
}
export function recoverSetup(repo) {
  const info=repoInfo(repo),file=path.join(info.state,'setup-journal.json'),lock=path.join(info.state,'setup.lock');
  if(!fs.existsSync(file)){invariant(!fs.existsSync(lock),'Setup lock exists without a recovery journal; inspect before proceeding');return {recovered:false};}
  const journal=readJson(file);invariant(journal.repo_id===info.id&&Array.isArray(journal.operations),'Invalid recovery journal');
  invariant(journal.root===info.root,'Recovery belongs to another worktree; run recover from its originating root');
  invariant(!alive(journal.pid),'Another setup process is still active');
  const recovery=path.join(info.state,'setup-recovery.lock');fs.mkdirSync(recovery);
  try {
    for(const o of [...journal.operations].reverse())restoreOperation(info.root,o);
    fs.unlinkSync(file);
    if(fs.existsSync(path.join(lock,'owner.json')))fs.unlinkSync(path.join(lock,'owner.json'));
    if(fs.existsSync(lock))fs.rmdirSync(lock);
    return {recovered:true};
  }finally{fs.rmdirSync(recovery);}
}
export function applySetup(plan,{failAfter=Infinity,onWrite=()=>{},beforeLock=()=>{}}={}) {
  const info=repoInfo(plan.root);invariant(info.id===plan.repo_id,'Plan belongs to another repository');
  const recovered=recoverSetup(plan.root).recovered;
  const changed=plan.operations.filter(o=>digest(o.before)!==digest(o.after));
  fs.mkdirSync(info.state,{recursive:true,mode:0o700});
  beforeLock();
  const lock=path.join(info.state,'setup.lock');fs.mkdirSync(lock);
  const written=[];
  const manifest={schema_version:1,version,files:{}};
  for(const o of plan.operations)if(!['seed','owner','retire'].includes(o.kind))manifest.files[o.path]={kind:o.kind,sha256:digest(o.kind==='block'?blockOf(o.after.content):o.kind==='hooks'?ownedHooks(o.after.content):o.after)};
  const manifestOp={path:'.agents/install.json',before:plan.manifest_before,after:{type:'file',content:JSON.stringify(manifest,null,2)+'\n'}};
  try {
    writeJson(path.join(lock,'owner.json'),{pid:process.pid},0o600);
    for(const o of [...plan.operations,manifestOp])invariant(digest(inspect(safeDestination(plan.root,o.path)))===digest(o.before),`Setup preview is stale: ${o.path}`);
    writeJson(path.join(info.state,'setup-journal.json'),{version,repo_id:info.id,root:info.root,pid:process.pid,operations:[...changed,manifestOp]},0o600);
    for(const o of [...changed,manifestOp]) {
      const dest=safeDestination(plan.root,o.path);fs.mkdirSync(path.dirname(dest),{recursive:true});
      if(!o.after){if(present(dest))fs.unlinkSync(dest);}
      else if(o.after.type==='link') {if(present(dest))fs.unlinkSync(dest);fs.symlinkSync(o.after.target,dest,process.platform==='win32'?'junction':undefined);}
      else atomic(dest,o.after.content);
      written.push(o);
      onWrite(o.path);
      if(written.length===failAfter)throw new Error('Injected interrupted setup');
    }
    fs.unlinkSync(path.join(info.state,'setup-journal.json'));
    git(plan.root,'symbolic-ref','refs/arti/integration',`refs/heads/${plan.config.default_branch}`);
    return {status:'applied',version,recovered,changed:changed.map(o=>o.path),conflicts:plan.conflicts,...(plan.config.hosts.includes('codex')?{codex_launch:{cwd:info.root,argv:['codex','--add-dir',path.join(info.root,'.agents/memory'),'--add-dir',info.state],coordination_env:'Set ARTI_SESSION_ID to a new unique ID for each coordinating session; inherit it in delegated CLI processes'}}:{})};
  } catch(error) {
    for(const o of written.reverse())restoreOperation(plan.root,o);
    if(fs.existsSync(path.join(info.state,'setup-journal.json')))fs.unlinkSync(path.join(info.state,'setup-journal.json'));
    throw error;
  } finally {if(fs.existsSync(path.join(lock,'owner.json')))fs.unlinkSync(path.join(lock,'owner.json'));fs.rmdirSync(lock);}
}
export function checkSetup(repo) {
  const {root}=repoInfo(repo),manifest=readJson(path.join(root,'.agents/install.json'));
  const problems=[];
  for(const [rel,record]of Object.entries(manifest.files)) {
    try{const current=inspect(safeDestination(root,rel));if(digest(record.kind==='block'?blockOf(current?.content||''):record.kind==='hooks'?ownedHooks(current.content):current)!==record.sha256)problems.push(rel);}catch{problems.push(rel);}
  }
  invariant(problems.length===0,`Installation drift: ${problems.join(', ')}`);
  loadConfig(path.join(root,'arti_sdd/config.json'));
  const cfg=loadConfig(path.join(root,'arti_sdd/config.json'));
  if(cfg.hosts.includes('codex'))invariant(codexConfig(readText(path.join(root,'.codex/config.toml')))===readText(path.join(root,'.codex/config.toml')),'Codex hook feature is missing');
  return {status:'configured',files:Object.keys(manifest.files).length,live_verified:false};
}
if(isMain(import.meta.url))cli(()=>{
  const a=args(process.argv.slice(2),['repo','config','team','dry-run']);const action=a._[0],repo=a.repo||process.cwd();
  if(action==='check')return console.log(JSON.stringify(checkSetup(repo)));
  if(action==='recover')return console.log(JSON.stringify(recoverSetup(repo)));
  invariant(['plan','apply'].includes(action),'Usage: setup.mjs plan|apply|check --repo <path> [--config <charter|json>]');
  if(action==='apply')recoverSetup(repo);
  const config=loadConfig(a.config||path.join(repo,'arti_sdd/config.json'));
  const plan=planSetup(repo,config,{team:a.team?readJson(a.team):null});
  if(action==='plan'||a['dry-run'])console.log(JSON.stringify({version,conflicts:plan.conflicts,operations:plan.operations.map(o=>({path:o.path,kind:o.after?.type||'remove',changed:digest(o.before)!==digest(o.after)}))},null,2));
  else console.log(JSON.stringify(applySetup(plan)));
});
