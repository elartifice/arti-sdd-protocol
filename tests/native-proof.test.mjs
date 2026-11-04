import test from 'node:test';
import assert from 'node:assert/strict';
import {claudeChildText,nativeObject,scoutSourceReads} from '../dev/native-proof.mjs';
test('foreground and background native child reports are read without trusting a parent summary',()=>{
 const parent={type:'assistant',parent_tool_use_id:null,message:{content:[{type:'text',text:'a misleading parent summary'}]}},report='{"status":"DONE"}';
 assert.equal(claudeChildText([parent,{type:'assistant',parent_tool_use_id:'call',message:{content:[{type:'text',text:report}]}}],'call'),report);
 const tool={type:'user',message:{content:[{type:'tool_result',tool_use_id:'call',content:[{type:'text',text:'[Subagent hand-back] Metadata. The report follows:\n  '+report+'\nagentId: native-id\n<usage>metadata</usage>'}]}]}};
 assert.equal(claudeChildText([parent,tool],'call'),report);assert.throws(()=>claudeChildText([parent,tool],'different-call'),/missing/);
});
test('native handoff notes cannot replace the leading structured result',()=>{
 const object={status:'DONE',lesson:'A literal } and an escaped " quote.'};assert.deepEqual(nativeObject(JSON.stringify(object)+'\n\nNotes for the coordinator.'),object);assert.throws(()=>nativeObject('The agent said '+JSON.stringify(object)),/leading/);assert.throws(()=>nativeObject('{"status":'),/Incomplete/);
});
test('a standard native DONE report may end in one JSON block without accepting chatter or contradictory status',()=>{
 const block='```json\n{"status":"DONE","tests_passed":true}\n```',report='STATUS: DONE\nMODIFIED_FILES: src/logic.cjs\nVERIFY_RECEIPT: tests passed\n\nExplanation.\n\n'+block;
 assert.deepEqual(nativeObject(report),{status:'DONE',tests_passed:true});
 for(const text of ['The agent said\n'+block,'STATUS: BLOCKED\n'+block,report+'\nExtra notes',report+'\n'+block])assert.throws(()=>nativeObject(text));
 assert.throws(()=>nativeObject('STATUS: DONE\n```json\n{"status":"BLOCKED"}\n```'),/Contradictory/);
});

test('Scout source proof requires successful native child reads of both files',()=>{
 const files=['src/facts.js','src/secondary.js'],repo='/fixture',output='src/facts.js:1:MAX_RETRIES\nsrc/secondary.js:1:CACHE_TTL';
 const claude={callId:'child',events:[{type:'assistant',parent_tool_use_id:'child',message:{content:[{type:'tool_use',id:'grep',name:'Grep',input:{pattern:'MAX_RETRIES|CACHE_TTL'}}]}},{type:'user',parent_tool_use_id:'child',message:{content:[{type:'tool_result',tool_use_id:'grep',content:output}]}}]};
 assert.equal(scoutSourceReads('claude',claude,files,repo),true);
 const noRead=structuredClone(claude);noRead.events[0].parent_tool_use_id=null;assert.throws(()=>scoutSourceReads('claude',noRead,files,repo));
 const failed=structuredClone(claude);failed.events[1].message.content[0].is_error=true;assert.throws(()=>scoutSourceReads('claude',failed,files,repo));
 const codex={thread:{turns:[{items:[{type:'commandExecution',status:'completed',exitCode:0,commandActions:[{type:'read',path:'/fixture/src/facts.js'},{type:'read',path:'/fixture/src/secondary.js'}]}]}]}};
 assert.equal(scoutSourceReads('codex',codex,files,repo),true);codex.thread.turns[0].items[0].commandActions.pop();codex.thread.turns[0].items.push({type:'agentMessage',text:output});assert.throws(()=>scoutSourceReads('codex',codex,files,repo));
 const search={thread:{turns:[{items:[{type:'commandExecution',status:'completed',exitCode:0,commandActions:[{type:'search'}],cwd:repo,aggregatedOutput:'./src/facts.js:1:x\n./src/secondary.js:1:y'}]}]}};assert.equal(scoutSourceReads('codex',search,files,repo),true);search.thread.turns[0].items[0].aggregatedOutput='/fixture/src/facts.js:1:x\n/fixture/src/secondary.js:1:y';assert.equal(scoutSourceReads('codex',search,files,repo),true);search.thread.turns[0].items[0].cwd='/foreign';assert.throws(()=>scoutSourceReads('codex',search,files,repo));search.thread.turns[0].items[0].cwd=repo;search.thread.turns[0].items[0].aggregatedOutput='/foreign/src/facts.js:1:x\n/foreign/src/secondary.js:1:y';assert.throws(()=>scoutSourceReads('codex',search,files,repo));search.thread.turns[0].items[0].exitCode=1;assert.throws(()=>scoutSourceReads('codex',search,files,repo));
});
