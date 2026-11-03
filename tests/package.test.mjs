import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
test('canonical skill fits the package budget and has valid internal references', () => {
  const result=spawnSync(process.execPath,['dev/check.mjs'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const summary=JSON.parse(result.stdout);
  assert.ok(summary.bytes < 300*1024);
  assert.ok(summary.files <= 35);
});
test('only the real skill entry is discoverable and all templates are inert', () => {
  const root='.agents/skills/arti-sdd-protocol';
  const entries=[];
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(e.name==='SKILL.md')entries.push(f);}}
  walk(root);
  assert.deepEqual(entries,[`${root}/SKILL.md`]);
  assert.ok(fs.readdirSync(`${root}/templates`).every(x=>x.endsWith('.tmpl')));
});
