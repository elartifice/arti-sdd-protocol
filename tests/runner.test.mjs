import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { command } from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
import { temp } from './harness.mjs';
const runner=path.resolve('dev/test.mjs');
test('the development runner counts real skips correctly and rejects an assertion failure or crash',t=>{
 const dir=temp(t);fs.mkdirSync(path.join(dir,'tests'));
 fs.writeFileSync(path.join(dir,'tests/a.test.mjs'),"import test from 'node:test';test('valid',()=>{});test('platform case',{skip:true},()=>{});\n");
 let result=command(process.execPath,[runner],{cwd:dir});assert.equal(result.code,0,result.stderr);assert.match(result.stdout,/skipped 1/);
 fs.writeFileSync(path.join(dir,'tests/b.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';test('broken',()=>assert.fail('real failure'));\n");
 result=command(process.execPath,[runner],{cwd:dir});assert.notEqual(result.code,0);
 fs.writeFileSync(path.join(dir,'tests/b.test.mjs'),'process.exit(1);\n');result=command(process.execPath,[runner],{cwd:dir});assert.notEqual(result.code,0);
});
