import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { command, git } from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
export const packageRoot=path.resolve('.agents/skills/arti-sdd-protocol');
export function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arti-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return fs.realpathSync(dir);}
export function repo(t){const dir=temp(t);git(dir,'init','-q','-b','main');git(dir,'config','user.name','Fixture Author');git(dir,'config','user.email','fixture@example.invalid');git(dir,'config','commit.gpgsign','false');git(dir,'config','core.hooksPath','/dev/null');fs.writeFileSync(path.join(dir,'README.md'),'fixture\n');git(dir,'add','README.md');git(dir,'commit','-qm','seed');return dir;}
export const config=(extra={})=>({schema_version:2,project:'fixture',facts:{has_ui:false,deploys:false,uses_llm:false},hosts:['claude','codex'],decisions:{merge:'manual',planning:'committed',qa:'checks',team:'single',review:'disabled',review_risks:[],board:'markdown'},...extra});
export function invoke(script,argv=[],cwd=process.cwd(),options={}){return command(process.execPath,[path.join(packageRoot,'scripts',script),...argv],{cwd,...options});}
export function seedTicket(dir,id='T001',territory=['src/**']){fs.mkdirSync(path.join(dir,'arti_sdd/tickets'),{recursive:true});fs.writeFileSync(path.join(dir,`arti_sdd/tickets/${id}.md`),`---\nid: "${id}"\ntitle: "Fixture ticket"\nstatus: "open"\ndepends_on: []\nterritory: ${JSON.stringify(territory)}\n---\n\n## DoD\n- [ ] Behavior passes\n`);}
export function commitPlanning(dir){git(dir,'add','.');git(dir,'commit','-qm','approved planning');}
export function mapping(){const names=['coordinator','scout','implementer','reviewer','escalation'];return {schema_version:2,enabled_roles:names,max_concurrent:2,bindings:Object.fromEntries(['claude','codex'].map(host=>[host,Object.fromEntries(names.map(role=>[role,{model:host==='claude'?'opus':'gpt-6.1-sol',effective_model:host==='claude'?'claude-opus-5-5':'gpt-6.1-sol',effort:'high'}]))]))};}
