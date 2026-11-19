// Goal and criterion wording are authoritative; progress/evidence are not.
function* contractLines(body){
 let fence=null;
 for(const line of body.split('\n')){
  const marker=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if(marker){if(!fence)fence={char:marker[1][0],length:marker[1].length};else if(marker[1][0]===fence.char&&marker[1].length>=fence.length&&!marker[2].trim())fence=null;yield {line,literal:true};}
  else yield {line,literal:!!fence};
 }
}
export function contractBody(body){
 let dod=false,evidence=false;const out=[];
 for(const {line,literal} of contractLines(body)){
  if(literal){if(!evidence)out.push(line);continue;}
  if(/^## /.test(line)){dod=/^## DoD[ \t]*$/.test(line);evidence=/^## Evidence[ \t]*$/.test(line);}
  if(!evidence)out.push(dod?line.replace(/^- \[[ xX]\]/,'- [ ]'):line);
 }
 return out.join('\n').trimEnd();
}
export function dodItems(body){let dod=false;const items=[];for(const {line,literal} of contractLines(body)){if(literal)continue;if(/^## /.test(line))dod=/^## DoD[ \t]*$/.test(line);else if(dod&&/^- \[[ xX]\].+/.test(line))items.push(line);}return items;}
