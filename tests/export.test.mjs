import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { auditFiles,zip,publicAgentRules } from '../dev/package.mjs';
test('public export rejects private paths, account context and secret-looking material',()=>{
 for(const entry of [{name:'.local-evidence/private.log',data:Buffer.from('private')},{name:'safe.md',data:Buffer.from('/Users/'+'example-user/private')},{name:'safe.md',data:Buffer.from('sk-'+'a'.repeat(40))}])assert.throws(()=>auditFiles([entry]));
 assert.doesNotThrow(()=>auditFiles([{name:'README.md',data:Buffer.from('Generic project guidance')}]));
});
test('public contributor rules exclude temporary chat authority and export repeatedly',()=>{
 const text='Private planning context\n<!-- arti-public:rules:start -->\n# Contributor rules\nUse shared sources.\n<!-- arti-public:rules:end -->\nTemporary batch authorisation';const out=publicAgentRules(text);assert.ok(out.includes('Use shared sources.'));assert.equal(out.includes('Private planning'),false);assert.equal(out.includes('Temporary batch'),false);assert.equal(publicAgentRules(out),out);assert.throws(()=>publicAgentRules(text+text),/one explicit/);
});
test('deterministic ZIP contains only the exact named payload without path traversal',()=>{
 const entries=[{name:'arti-sdd-protocol/SKILL.md',data:Buffer.from('hello')}],a=zip(entries),b=zip(entries);assert.deepEqual(a,b);assert.equal(a.readUInt32LE(0),0x04034b50);const len=a.readUInt16LE(26);assert.equal(a.subarray(30,30+len).toString(),entries[0].name);assert.equal(a.subarray(30+len,30+len+5).toString(),'hello');
});
