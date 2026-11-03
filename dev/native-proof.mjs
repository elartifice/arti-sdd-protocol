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
