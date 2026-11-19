import test from 'node:test';
import assert from 'node:assert/strict';
import {claudeChildText,nativeObject,scoutSourceReads,nativeTestRun} from '../dev/native-proof.mjs';
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

test('child test proof requires exact successful native child tool execution',()=>{
 const cmd='node --test src/logic.test.cjs',claude={callId:'child',events:[{type:'assistant',parent_tool_use_id:'child',message:{content:[{type:'tool_use',name:'Bash',id:'test',input:{command:cmd}}]}},{type:'user',parent_tool_use_id:'child',message:{content:[{type:'tool_result',tool_use_id:'test',is_error:false,content:'passed'}]}}]};assert.equal(nativeTestRun('claude',claude,cmd),true);
 for(const mutate of [x=>x.events[0].parent_tool_use_id=null,x=>x.events[1].message.content[0].is_error=true,x=>x.events[0].message.content[0].input.command=cmd+'; echo ok',x=>x.events[1].message.content=[]]){const x=structuredClone(claude);mutate(x);assert.throws(()=>nativeTestRun('claude',x,cmd));}
 const codex={thread:{turns:[{status:'completed',items:[{type:'commandExecution',status:'completed',exitCode:0,commandActions:[{type:'unknown',command:cmd}]}]}]}};assert.equal(nativeTestRun('codex',codex,cmd),true);
 for(const mutate of [x=>x.thread.turns[0].items[0].exitCode=1,x=>x.thread.turns[0].items[0].commandActions.push({command:'echo ok'}),x=>x.thread.turns[0].items[0].commandActions[0].command=cmd+' && echo ok',x=>x.thread.turns.push({status:'inProgress',items:[]}),x=>x.thread.turns[0].items=[{type:'agentMessage',text:'tests passed'}]]){const x=structuredClone(codex);mutate(x);assert.throws(()=>nativeTestRun('codex',x,cmd));}
});

test('primary command proof consumes exact successful tool output despite misleading assistant prose',async()=>{
 const {nativeCommandOutput,exactNativeCommand}=await import('../dev/native-proof.mjs');
 const cmd=`node 'helper.mjs' --issues '["owner/repo"]'`,output='{"status":"verified"}';
 const claude=[{type:'assistant',message:{content:[{type:'tool_use',id:'run',name:'Bash',input:{command:cmd}}]}},{type:'user',message:{content:[{type:'tool_result',tool_use_id:'run',is_error:false,content:output}]},tool_use_result:{stdout:output,interrupted:false}},{type:'assistant',message:{content:[{type:'text',text:'I ran it successfully.'}]}}];
 assert.equal(nativeCommandOutput('claude',claude,cmd),output);
 for(const mutate of [x=>x[0].message.content[0].input.command+='; echo forged',x=>x[1].message.content[0].tool_use_id='unrelated',x=>x[1].message.content[0].is_error=true,x=>x[1].tool_use_result.interrupted=true,x=>x[0].parent_tool_use_id='child',x=>x.push(x[1])]){const x=structuredClone(claude);mutate(x);assert.throws(()=>nativeCommandOutput('claude',x,cmd));}
 const wrapped='/bin/zsh -lc "'+cmd.replace(/[\\"$`]/g,c=>'\\'+c)+'"';assert.equal(exactNativeCommand(wrapped,cmd),true);
 const codex=[{type:'item.completed',item:{type:'command_execution',command:wrapped,status:'completed',exit_code:0,aggregated_output:output}},{type:'item.completed',item:{type:'agent_message',text:'This is only a recap'}}];
 assert.equal(nativeCommandOutput('codex',codex,cmd),output);
 for(const mutate of [x=>x[0].item.command+='; echo forged',x=>x[0].item.exit_code=1,x=>x[0].item.status='failed',x=>x[0].type='item.started',x=>x.push(x[0])]){const x=structuredClone(codex);mutate(x);assert.throws(()=>nativeCommandOutput('codex',x,cmd));}
 for(const raw of [wrapped+' && true','/bin/zsh -lc "'+cmd+'"','echo '+cmd])assert.equal(exactNativeCommand(raw,cmd),false);
 assert.throws(()=>nativeCommandOutput('claude',[claude[2]],cmd));assert.throws(()=>nativeCommandOutput('codex',[codex[1]],cmd));
});
