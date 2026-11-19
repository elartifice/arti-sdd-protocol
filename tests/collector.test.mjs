import test from 'node:test';
import assert from 'node:assert/strict';
import {collectorReceipt,PIN} from '../extras/research/collector.mjs';
test('collector receipts bind actual topic, window and outcomes without inventing source or historical completeness',()=>{
 const plan={topic:'test',days:90,sources:['hackernews','x']};
 const raw={topic:'test',range_from:'2026-08-18',range_to:'2026-11-16',source_status:{hackernews:{source:'hackernews',state:'ok',attempted:true,items_returned:11},x:{source:'x',state:'skipped-unconfigured',attempted:false,items_returned:0}}};
 const r=collectorReceipt(plan,raw);assert.equal(r.collector_revision,PIN);assert.equal(r.all_sources_responded,false);assert.equal(r.historical_completeness,'not-established');
 assert.throws(()=>collectorReceipt(plan,{...raw,topic:'different'}),/topic differs/);
 assert.throws(()=>collectorReceipt(plan,{...raw,range_to:'2026-11-15'}),/window differs/);
 const bad=structuredClone(raw);bad.source_status.x.state='complete';assert.throws(()=>collectorReceipt(plan,bad),/Malformed/);
 const missing=structuredClone(raw);delete missing.source_status.x;assert.equal(collectorReceipt(plan,missing).all_sources_responded,false);
});
