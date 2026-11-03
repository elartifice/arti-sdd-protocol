import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('.agents/skills/arti-sdd-protocol');
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, entry.name); if (entry.isSymbolicLink()) throw new Error(`Package symlink: ${p}`); if (entry.isDirectory()) walk(p); else files.push(p); } }
walk(root);
const bytes = files.reduce((n,p) => n + fs.statSync(p).size, 0);
if (files.length > 35 || bytes > 300*1024) throw new Error(`Package budget exceeded: ${files.length} files, ${bytes} bytes`);
for (const file of files.filter(x => x.endsWith('.md'))) {
  const text = fs.readFileSync(file,'utf8');
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    if (!/^(https?:|#)/.test(match[1]) && !fs.existsSync(path.resolve(path.dirname(file),match[1].split('#')[0]))) throw new Error(`Broken reference in ${file}: ${match[1]}`);
  }
}
const skill = fs.readFileSync(path.join(root,'SKILL.md'),'utf8');
if (!/^---\nname: arti-sdd-protocol\ndescription: [^\n]+\n/m.test(skill)) throw new Error('Invalid entry point');
if (!fs.existsSync(path.join(root,'LICENSE'))) throw new Error('Missing package licence');
console.log(JSON.stringify({ status:'passed', files:files.length, bytes, entry_words:skill.split(/\s+/).length, version:JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version }));
