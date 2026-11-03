import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateConfig, charter, parseCharter, mergeFacts, loadConfig } from '../.agents/skills/arti-sdd-protocol/scripts/schema.mjs';
import { config, temp, invoke } from './harness.mjs';
test('chat charter round trip preserves explicit false, decision IDs, notes and later choices',()=>{
  const c=config({notes:{merge:'We decided against auto | keep manual'},deferred:{recorder:'later'}});
  assert.deepEqual(parseCharter(charter(c,'## Architecture\nUI is planned later.')),c);
  const merged=mergeFacts(c,{has_ui:true,deploys:true});
  assert.equal(merged.config.facts.has_ui,false);
  assert.equal(merged.config.decisions.merge,'manual');
  assert.equal(merged.config.deferred.recorder,'later');
  assert.equal(merged.conflicts.length,2);
});
test('undecided review stays null in chat and blocks installation without a default',()=>{
  const c=config();c.decisions.review=null;
  assert.equal(parseCharter(charter(c),{draft:true}).decisions.review,null);
  assert.throws(()=>validateConfig(c),/undecided/);
});
test('unknown fields, placeholders, old schemas, incomplete facts and duplicate blocks are rejected',()=>{
  assert.throws(()=>validateConfig({...config(),agent_host:'claude'}),/Unknown/);
  assert.throws(()=>validateConfig({...config(),schema_version:1}),/migrate/);
  assert.throws(()=>validateConfig({...config(),project:'{{project}}'}),/slug/);
  assert.throws(()=>validateConfig({...config(),facts:{has_ui:false}}),/Missing/);
  const c=config();c.decisions.review='risk';assert.throws(()=>validateConfig(c),/risk labels/);
  assert.throws(()=>parseCharter(charter(config())+charter(config())),/exactly one/);
});
test('CLI consumes either charter or structured setup and reports parse failures nonzero',t=>{
  const dir=temp(t),f=path.join(dir,'PROJECT-CHARTER.md');fs.writeFileSync(f,charter(config()));
  assert.deepEqual(loadConfig(f),config());
  assert.equal(invoke('schema.mjs',['--config',f]).code,0);
  fs.writeFileSync(f,'<!-- arti-sdd:config -->\n```json\n{oops}\n```\n<!-- /arti-sdd:config -->');
  assert.notEqual(invoke('schema.mjs',['--config',f]).code,0);
});
