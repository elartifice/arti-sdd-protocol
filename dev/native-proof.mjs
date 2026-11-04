import path from 'node:path';
// Native Claude emits child text for background agents and a framed tool result
// for foreground agents. Consume only the exact delegated call's output.
export function claudeChildText(events,callId) {
 const direct=events.filter(e=>e.type==='assistant'&&e.parent_tool_use_id===callId).flatMap(e=>e.message?.content||[]).filter(c=>c.type==='text').at(-1)?.text;
 if(direct)return direct;
 for(const e of events.filter(e=>e.type==='user'))for(const c of e.message?.content||[])if(c.type==='tool_result'&&c.tool_use_id===callId) {
  const texts=typeof c.content==='string'?[c.content]:(c.content||[]).filter(x=>x.type==='text').map(x=>x.text);
  for(const text of texts){const marker='The report follows:\n',index=text.indexOf(marker);if(index<0)continue;const report=[];for(const line of text.slice(index+marker.length).split('\n')){if(!line.startsWith('  '))break;report.push(line.slice(2));}if(report.length)return report.join('\n');}
 }
 throw new Error('Native Claude child output missing or unsupported hand-back frame');
}
// Native role reports use a leading object, or a standard DONE report ending
// in one explicit JSON block. Read only the exact delegated child's response.
// This does not relax the production cross-lab review response parser.
export function nativeObject(text) {
 let value=text.trim();
 if(/^STATUS: DONE\r?\n/.test(value)){
  const blocks=[...value.matchAll(/```json[ \t]*\r?\n([\s\S]*?)\r?\n```/g)];
  if(blocks.length===1&&value.endsWith(blocks[0][0])){const result=JSON.parse(blocks[0][1]);if(!result||Array.isArray(result)||typeof result!=='object'||result.status&&result.status!=='DONE')throw new Error('Contradictory native DONE report');return result;}
 }
 value=value.replace(/^```(?:json)?\s*\n/,'');if(value[0]!=='{')throw new Error('Native report needs a leading JSON object or an unambiguous terminal DONE block');
 let depth=0,string=false,escaped=false;
 for(let i=0;i<value.length;i++){const c=value[i];if(string){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')string=false;}else if(c==='"')string=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return JSON.parse(value.slice(0,i+1));}
 throw new Error('Incomplete native JSON object');
}

// Require child-side native reads or content searches, not a parent summary or
// the child's answer. Search output must identify each fixture file.
export function scoutSourceReads(host,evidence,files,repo) {
 const found=new Set(),root=path.resolve(repo),targets=new Map(files.map(file=>[path.resolve(root,file),file]));
 const inside=p=>p===root||p.startsWith(root+path.sep);
 const mark=(p,cwd=root)=>{if(typeof p!=='string'||!inside(cwd))return;const file=targets.get(path.resolve(cwd,p));if(file)found.add(file);};
 const pathsFromOutput=(text,cwd=root)=>{if(typeof text!=='string'||!inside(cwd))return;for(const line of text.split('\n')){const match=line.match(/^(.*?):(?:[0-9]+:|[0-9]+$)/);if(match)mark(match[1],cwd);}};
 if(host==='claude') {
  const {events,callId}=evidence;
  const calls=events.filter(e=>e.type==='assistant'&&e.parent_tool_use_id===callId).flatMap(e=>e.message?.content||[]).filter(c=>c.type==='tool_use'&&['Read','Grep'].includes(c.name));
  const results=events.filter(e=>e.type==='user'&&e.parent_tool_use_id===callId).flatMap(e=>e.message?.content||[]).filter(c=>c.type==='tool_result'&&!c.is_error);
  for(const call of calls){const result=results.find(r=>r.tool_use_id===call.id);if(!result)continue;if(call.name==='Read'){mark(call.input?.file_path);}else {const content=typeof result.content==='string'?result.content:Array.isArray(result.content)?result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'):'';pathsFromOutput(content);}}
 } else if(host==='codex') {
  for(const item of evidence.thread?.turns?.flatMap(t=>t.items||[])||[])if(item.type==='commandExecution'&&item.status==='completed'&&item.exitCode===0)for(const action of item.commandActions||[]) {
   if(action.type==='read'){mark(action.path,path.resolve(item.cwd||root));}
   if(action.type==='search')pathsFromOutput(item.aggregatedOutput,path.resolve(item.cwd||root));
  }
 } else throw new Error('Unsupported Scout evidence host');
 if(!files.every(file=>found.has(file)))throw new Error('Scout native child did not read or content-search both fixture files');
 return true;
}
