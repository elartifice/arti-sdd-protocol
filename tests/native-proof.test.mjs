import test from 'node:test';
import assert from 'node:assert/strict';
import {claudeChildText,nativeObject} from '../dev/native-proof.mjs';
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
