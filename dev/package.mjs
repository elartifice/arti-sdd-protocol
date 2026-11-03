import fs from 'node:fs';
import path from 'node:path';
import { invariant,digest,packageDigest,skillRoot,version,isMain } from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';

const root=path.resolve('.'),dist=path.join(root,'dist');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{const p=path.join(dir,e.name);invariant(!e.isSymbolicLink(),`Unexpected symlink in export: ${p}`);return e.isDirectory()?walk(p):[p];});}
function relative(file,base=root){return path.relative(base,file).split(path.sep).join('/');}
export function publicAgentRules(text){const start='<!-- arti-public:rules:start -->',end='<!-- arti-public:rules:end -->';invariant(text.split(start).length===2&&text.split(end).length===2,'Public contributor rules need one explicit export block');const a=text.indexOf(start),b=text.indexOf(end);invariant(b>a,'Public rules marker order is invalid');return text.slice(a,b+end.length)+'\n';}
export function auditFiles(entries,privateTerms=[]) {
 for(const e of entries){invariant(!e.name.startsWith('/')&&!e.name.split('/').some(x=>x==='..'),'Unsafe archive path');invariant(!/(^|\/)(\.local-evidence|\.git|node_modules|\.env(?:\..*)?)($|\/)/.test(e.name),`Private file in public tree: ${e.name}`);
  const text=e.data.toString('utf8');invariant(!/\/Users\/[A-Za-z0-9_.-]+\//.test(text)&&!privateTerms.some(term=>text.toLowerCase().includes(term.toLowerCase())),`Personal/project context in ${e.name}`);invariant(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/.test(text),`Possible secret in ${e.name}`);
 }
}
function crc32(data){let crc=0xffffffff;for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function zip(entries){const parts=[],central=[];let offset=0;
 for(const e of entries){const name=Buffer.from(e.name),data=e.data,crc=crc32(data),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);parts.push(local,name,data);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(33,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=local.length+name.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...parts,directory,end]);
}
export function build({requireQualified=false}={}) {
 const privateTerms=process.env.ARTI_PRIVATE_TERMS_FILE?JSON.parse(fs.readFileSync(process.env.ARTI_PRIVATE_TERMS_FILE)):[];
 const skillEntries=walk(skillRoot).map(p=>({name:`arti-sdd-protocol/${relative(p,skillRoot)}`,data:fs.readFileSync(p)}));auditFiles(skillEntries,privateTerms);
 const allow=['README.md','CONTRIBUTING.md','LICENSE','CHANGELOG.md','AGENTS.md','package.json'];
 let source=allow.map(name=>({name,data:name==='AGENTS.md'?Buffer.from(publicAgentRules(fs.readFileSync(path.join(root,name),'utf8'))):fs.readFileSync(path.join(root,name))}));
 for(const directory of ['.agents/skills/arti-sdd-protocol','dev','tests','docs','.github'])if(fs.existsSync(path.join(root,directory)))source.push(...walk(path.join(root,directory)).filter(p=>!p.endsWith('/dev/ticket.mjs')).map(p=>({name:relative(p),data:fs.readFileSync(p)})));
 source.push({name:'CLAUDE.md',data:Buffer.from('@AGENTS.md\n')},{name:'.gitignore',data:Buffer.from('/.local-evidence/\n/arti_sdd/.state/\n/dist/\n/node_modules/\n/.env\n/.env.*\n**/.DS_Store\n')});
 auditFiles(source,privateTerms);
 const qualification=path.join(root,'docs/qualification.json'),report=fs.existsSync(qualification)?JSON.parse(fs.readFileSync(qualification)):null;
 if(requireQualified)invariant(report?.kind==='release'&&report.status==='passed'&&report.native_runs?.length===10&&report.dispatch_runs?.length===2&&report.package_sha256===packageDigest(),'No fresh passing release qualification for this package');
 fs.mkdirSync(dist,{recursive:true});
 const artifact=zip(skillEntries),archive=path.join(dist,`arti-sdd-protocol-${version}.zip`);fs.writeFileSync(archive,artifact);
 const publicRoot=path.join(dist,'public-repository');if(fs.existsSync(publicRoot))fs.rmSync(publicRoot,{recursive:true});fs.mkdirSync(publicRoot);
 for(const e of source){const p=path.join(publicRoot,e.name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,e.data);}
 const manifest={version,package_sha256:packageDigest(),qualification:report?.package_sha256===packageDigest()?report.status:'not-qualified',skill_files:skillEntries.length,skill_bytes:skillEntries.reduce((n,e)=>n+e.data.length,0),archive_sha256:digest(artifact),public_files:source.map(e=>({path:e.name,sha256:digest(e.data)})).sort((a,b)=>a.path.localeCompare(b.path))};
 fs.writeFileSync(path.join(dist,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return {...manifest,archive:relative(archive),public_repository:relative(publicRoot)};
}
if(isMain(import.meta.url))console.log(JSON.stringify(build({requireQualified:process.argv.includes('--require-qualified')}),null,2));
