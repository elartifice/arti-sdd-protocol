import {invariant} from './lib.mjs';
export const CONSEQUENCES=['security','privacy','credentials_permissions','destructive','migrations','concurrent_state','external_sends','shared_contracts','architecture'];
export function validateConsequences(value){
 invariant(value&&typeof value==='object'&&!Array.isArray(value),'Consequences must be an explicit object');
 invariant(Object.keys(value).every(k=>CONSEQUENCES.includes(k)),'Unknown consequence category');
 invariant(Object.values(value).every(v=>typeof v==='boolean'),'Consequences must be confirmed booleans');
 return value;
}
export function consequenceDecision(ticket){
 if(ticket.consequences==null)return {required:true,reason:'consequence-classification-missing'};
 const value=validateConsequences(ticket.consequences),unknown=CONSEQUENCES.filter(k=>!Object.hasOwn(value,k)),present=CONSEQUENCES.filter(k=>value[k]===true);
 return {required:unknown.length>0||present.length>0,unknown,present,reason:unknown.length?'consequences-incomplete':present.length?'high-consequence':'explicit-low-consequence'};
}
