import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {repo} from './harness.mjs';
import {baseline} from '../.agents/skills/arti-sdd-protocol/scripts/baseline.mjs';
test('baseline follows current scripts and lockfiles without executing or silently approving candidates',t=>{
 const dir=repo(t),f=path.join(dir,'package.json');assert.equal(baseline(dir).status,'unsupported-or-no-manifest');
 fs.writeFileSync(f,'{}');assert.equal(baseline(dir).status,'no-baseline-scripts');
 fs.writeFileSync(f,JSON.stringify({scripts:{check:'node -e "throw Error()"'}}));
 const current=baseline(dir,[['npm','run','check']]);assert.equal(current.executed,false);assert.deepEqual(current.candidates[0].argv,['npm','run','check']);
 assert.throws(()=>baseline(dir,[['npm','test']]),/script missing/);assert.throws(()=>baseline(dir,[]),/No approved/);
 fs.writeFileSync(path.join(dir,'package-lock.json'),'changed');assert.notEqual(baseline(dir).fingerprint,current.fingerprint);
 fs.writeFileSync(f,JSON.stringify({scripts:{test:'node --test'}}));assert.throws(()=>baseline(dir,[['npm','run','check']]),/script missing/);
 assert.equal(baseline(dir,[['npm','test']]).status,'scripts-available');
});
