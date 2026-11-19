import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {repo} from './harness.mjs';
import {reserveOrientation} from '../.agents/skills/arti-sdd-protocol/scripts/orientation.mjs';
import {repoInfo} from '../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
test('orientation presentation is independent from ownership, native identity and corrupt-state recovery',t=>{
 const dir=repo(t),input={cwd:dir,session_id:'native',source:'startup'};
 assert.throws(()=>reserveOrientation(input,{CODEX_THREAD_ID:'foreign'}),/mismatch/);
 assert.equal(reserveOrientation({...input,source:'resume'}).show,false);
 assert.equal(reserveOrientation(input,{ARTI_SESSION_ID:'coordinator'}).show,true);
 assert.equal(reserveOrientation(input).show,false);
 const file=path.join(repoInfo(dir).state,'presentation/native.json');fs.writeFileSync(file,'broken');
 assert.ok(reserveOrientation(input).diagnostic);assert.equal(reserveOrientation(input).show,false);assert.equal(fs.readFileSync(file,'utf8'),'broken');
 assert.equal(fs.existsSync(path.join(repoInfo(dir).state,'claims')),false);
});
test('two real processes reserve at most one automatic introduction',async t=>{
 const dir=repo(t),module=path.resolve('.agents/skills/arti-sdd-protocol/scripts/orientation.mjs');
 const code=`import {reserveOrientation} from ${JSON.stringify('file://'+module)};console.log(JSON.stringify(reserveOrientation({cwd:${JSON.stringify(dir)},session_id:'concurrent',source:'startup'})));`;
 const run=()=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',code]);let out='';p.stdout.on('data',d=>out+=d);p.on('error',reject);p.on('close',c=>c===0?resolve(JSON.parse(out)):reject(Error('child failed')));});
 const results=await Promise.all([run(),run()]);assert.equal(results.filter(r=>r.show).length,1);
});

test('registered host identity ignores a different lab parent environment',t=>{
 const dir=repo(t);assert.equal(reserveOrientation({cwd:dir,source:'startup',session_id:'claude-native'},{ARTI_NATIVE_HOST:'claude',CLAUDE_CODE_SESSION_ID:'claude-native',CODEX_THREAD_ID:'codex-parent'}).show,true);
 assert.throws(()=>reserveOrientation({cwd:dir,source:'startup',session_id:'wrong'},{ARTI_NATIVE_HOST:'claude',CLAUDE_CODE_SESSION_ID:'actual'}),/mismatch/);
});
