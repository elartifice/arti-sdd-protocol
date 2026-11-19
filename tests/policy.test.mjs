import test from 'node:test';
import assert from 'node:assert/strict';
import {CONSEQUENCES,consequenceDecision} from '../.agents/skills/arti-sdd-protocol/scripts/policy.mjs';
import {reviewRequired} from '../.agents/skills/arti-sdd-protocol/scripts/review.mjs';
import {config} from './harness.mjs';
test('risk policy requires review for unknown or high consequences regardless of ticket size or chosen label spelling',()=>{
 const cfg=config();cfg.decisions.review='risk';cfg.decisions.review_risks=['custom-label'];const ticket={risks:[]};assert.equal(reviewRequired(cfg,ticket),true);
 const low=Object.fromEntries(CONSEQUENCES.map(k=>[k,false]));assert.equal(reviewRequired(cfg,{...ticket,consequences:low}),false);
 for(const k of CONSEQUENCES)assert.equal(reviewRequired(cfg,{...ticket,consequences:{...low,[k]:true}}),true);
 assert.equal(consequenceDecision({...ticket,consequences:{security:false}}).required,true);
 assert.throws(()=>consequenceDecision({consequences:{invented:false}}),/Unknown/);
 for(const mode of ['disabled','opportunistic']){cfg.decisions.review=mode;assert.equal(reviewRequired(cfg,ticket),false);}
});
