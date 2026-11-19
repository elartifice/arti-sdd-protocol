import fs from 'node:fs';
import path from 'node:path';
import {repoInfo,readJson,digest,invariant,args,isMain,cli} from './lib.mjs';

export function baseline(repo,checks=null) {
 const {root}=repoInfo(repo),manifest=path.join(root,'package.json');
 if(!fs.existsSync(manifest))return {status:'unsupported-or-no-manifest',candidates:[],fingerprint:null};
 invariant(!fs.lstatSync(manifest).isSymbolicLink(),'Baseline manifest must be repository-local regular content');
 const pkg=readJson(manifest),scripts=pkg.scripts||{};
 invariant(scripts&&typeof scripts==='object'&&!Array.isArray(scripts),'Malformed package scripts');
 const locks={};for(const name of ['package-lock.json','npm-shrinkwrap.json','pnpm-lock.yaml','yarn.lock']){
  const f=path.join(root,name);if(fs.existsSync(f)){invariant(!fs.lstatSync(f).isSymbolicLink(),'Baseline lockfile link refused');locks[name]=digest(fs.readFileSync(f));}
 }
 const candidates=['check','test','typecheck','lint','build'].filter(k=>typeof scripts[k]==='string'&&scripts[k].trim()).map(k=>({name:k,argv:['npm','run',k]}));
 if(checks!==null){
  invariant(Array.isArray(checks)&&checks.length>0,'No approved baseline checks; do not record a pass');
  for(const argv of checks){
   invariant(Array.isArray(argv)&&argv.length>0&&argv.every(x=>typeof x==='string')&&argv[0].trim(),'Malformed approved check');
   if(argv[0]==='npm'){
    const name=argv[1]==='test'?'test':['run','run-script'].includes(argv[1])?argv[2]:null;
    if(name!==null)invariant(typeof name==='string'&&typeof scripts[name]==='string'&&scripts[name].trim(),`Approved npm script missing: ${name}; reconcile the ticket checks, not a cached audit`);
   }
  }
 }
 return {status:candidates.length?'scripts-available':'no-baseline-scripts',candidates,fingerprint:digest({scripts,locks}),checks_sha256:checks===null?null:digest(checks),executed:false};
}
if(isMain(import.meta.url))cli(()=>{const a=args(process.argv.slice(2),['repo']);console.log(JSON.stringify(baseline(a.repo||process.cwd()),null,2));});
