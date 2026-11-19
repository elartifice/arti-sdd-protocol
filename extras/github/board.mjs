// Optional adapter: no daemon, local web server, status database or installation.
import {githubApi,validateTracker} from '../../.agents/skills/arti-sdd-protocol/scripts/tracker.mjs';
import {invariant,args,isMain,cli} from '../../.agents/skills/arti-sdd-protocol/scripts/lib.mjs';
const fields='id number title url public closed';
function gql(api,query,variables){const r=api('graphql',{method:'POST',data:{query,variables}});invariant(!r.errors?.length&&r.data,'GitHub Projects operation failed; verify Projects scope, ownership and network');return r.data;}
export function projectIdentity(url){const m=String(url).match(/^https:\/\/github\.com\/(users|orgs)\/([\w.-]+)\/projects\/(\d+)$/);invariant(m,'Explicit GitHub Project URL required');return {kind:m[1]==='users'?'User':'Organization',owner:m[2],number:Number(m[3])};}
export function readBoard(url,{api=githubApi}={}){const p=projectIdentity(url),d=gql(api,`query($owner:String!,$number:Int!){repositoryOwner(login:$owner){... on ${p.kind}{projectV2(number:$number){${fields}}}}}`,{owner:p.owner,number:p.number});const project=d.repositoryOwner?.projectV2;invariant(project?.url===url&&!project.closed,'Project unavailable or closed; never create a replacement automatically');return project;}
export function createBoard(owner,title,authorization,{api=githubApi}={}){
 invariant(/^[\w.-]+$/.test(owner)&&typeof title==='string'&&title.trim()&&authorization?.trim(),'Explicit owner, title and authorization required');
 const identity=gql(api,'query($owner:String!){repositoryOwner(login:$owner){id}}',{owner}).repositoryOwner;invariant(identity?.id,'Unknown project owner');
 const created=gql(api,`mutation($owner:ID!,$title:String!){createProjectV2(input:{ownerId:$owner,title:$title}){projectV2{${fields}}}}`,{owner:identity.id,title}).createProjectV2?.projectV2;invariant(created?.id,'Project creation did not return its identity');
 // Never expose a portfolio by default, even if all selected issues are public.
 gql(api,`mutation($id:ID!){updateProjectV2(input:{projectId:$id,public:false}){projectV2{${fields}}}}`,{id:created.id});
 const current=readBoard(created.url,{api});invariant(current.public===false,'Project privacy readback failed');return {...current,status:'created',next:'Save this stable URL in tracker.project_url; reuse it in every session. A lost create response requires inspecting existing Projects, not blindly creating another.'};
}
export function boardItems(url,{api=githubApi}={}){
 const project=readBoard(url,{api}),items=[];let after=null;
 for(let page=0;page<100;page++){
  const d=gql(api,`query($id:ID!,$after:String){node(id:$id){... on ProjectV2{items(first:100,after:$after){nodes{id isArchived content{... on Issue{id url number state title repository{nameWithOwner}}}} pageInfo{hasNextPage endCursor}}}}}`,{id:project.id,after});
  const connection=d.node?.items;invariant(Array.isArray(connection?.nodes),'Project inventory unavailable');items.push(...connection.nodes);if(!connection.pageInfo.hasNextPage)return {project,items};invariant(connection.pageInfo.endCursor&&connection.pageInfo.endCursor!==after,'Invalid project pagination');after=connection.pageInfo.endCursor;
 }throw Error('Project inventory incomplete; refusing partial portfolio');
}
export function syncBoard(url,repositories,issueUrls,authorization,{api=githubApi,pause=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms)}={}){
 invariant(authorization?.trim()&&Array.isArray(repositories)&&repositories.length&&Array.isArray(issueUrls),'Explicit portfolio scope and authorization required');
 for(const repository of repositories)validateTracker({provider:'github',repository});const before=boardItems(url,{api});
 const selected=[];for(const issueUrl of new Set(issueUrls)){
  const m=String(issueUrl).match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)$/);invariant(m&&repositories.includes(m[1]),'Issue outside the selected portfolio repositories');
  const issue=api(`repos/${m[1]}/issues/${m[2]}`);invariant(!issue.pull_request&&issue.html_url===issueUrl&&issue.node_id,'Expected an authoritative GitHub Issue');
  selected.push(issue);
 }
 for(const issue of selected){
  if(!before.items.some(item=>item.content?.id===issue.node_id))gql(api,'mutation($project:ID!,$issue:ID!){addProjectV2ItemById(input:{projectId:$project,contentId:$issue}){item{id}}}',{project:before.project.id,issue:issue.node_id});
 }
 const visible=board=>[...new Set(issueUrls)].every(issueUrl=>board.items.some(i=>!i.isArchived&&i.content?.url===issueUrl));let after=boardItems(url,{api});
 for(const delay of [200,500,1000]){if(visible(after))break;pause(delay);after=boardItems(url,{api});}
 invariant(visible(after),'Board readback missing selected issue after bounded propagation retries; inspect archived items or connectivity before retrying');
 return {status:'verified',url:after.project.url,public:after.project.public,selected_repositories:repositories,selected_issues:new Set(issueUrls).size,items:after.items.map(i=>({url:i.content?.url||null,repository:i.content?.repository?.nameWithOwner||null,state:i.content?.state||'unavailable',archived:i.isArchived})),completion_authority:'verified ticket closeout, never card position',lifetime:'GitHub-hosted; independent of agent/session lifetime'};
}
if(isMain(import.meta.url))cli(()=>{const a=args(process.argv.slice(2),['url','owner','title','repositories','issues','authorization']);let r;if(a._[0]==='create')r=createBoard(a.owner,a.title,a.authorization);else if(a._[0]==='inspect')r=boardItems(a.url);else if(a._[0]==='sync')r=syncBoard(a.url,JSON.parse(a.repositories||'null'),JSON.parse(a.issues||'null'),a.authorization);else throw Error('Usage: board.mjs create|inspect|sync --url <project-url> [--repositories JSON --issues JSON --authorization scope]');console.log(JSON.stringify(r,null,2));});
