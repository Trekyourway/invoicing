import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubState} from '../src/gh-receipt-state.mjs';
const key='a'.repeat(64),id='9f99090c-104b-4835-a344-2993a3cc004b';
const make=(fetchFn)=>createGitHubState({repo:'Trekyourway/invoicing',token:'fake-test-token',fetchFn});
test('create durable RESERVED marker before provider call',async()=>{
 let n=0,stored;
 const api=make(async(url,opts)=>{n++;if(opts.method==='GET')return {status:404};stored=JSON.parse(opts.body);return {status:201,json:async()=>({content:{sha:'stored-sha'}})};});
 const result=await api.claim(key,id);assert.deepEqual(result,{claimed:true,sha:'stored-sha'});assert.equal(n,2);
 const text=Buffer.from(stored.content,'base64').toString('utf8');assert.ok(text.includes('RESERVED'));assert.ok(text.includes(id));assert.ok(!text.includes('client@'));
});
test('existing marker blocks reissue without PUT',async()=>{
 let calls=0;const api=make(async()=>{calls++;return {status:200};});assert.equal((await api.claim(key,id)).claimed,false);assert.equal(calls,1);
});
test('reservation conflict 422 blocks reissue',async()=>{
 const api=make(async(url,opts)=>opts.method==='GET'?{status:404}:{status:422});assert.equal((await api.claim(key,id)).claimed,false);
});
test('GitHub rate limit/error does not authorize issuance',async()=>{
 const api=make(async()=>({status:403}));await assert.rejects(api.claim(key,id));
});
test('finish persists only non-PII status and requires SHA',async()=>{
 let payload;const api=make(async(url,opts)=>{payload=JSON.parse(opts.body);return {status:200};});
 await api.finish(key,'rev-1',{status:'ISSUED',email_acknowledged:true,updated_utc:'2026-11-20T00:00:00Z',customer_email:'PII-should-drop@example.com',pdf_url:'secret.pdf'});
 const result=Buffer.from(payload.content,'base64').toString('utf8');assert.ok(result.includes('ISSUED'));assert.ok(!result.includes('example.com'));assert.ok(!result.includes('secret.pdf'));assert.equal(payload.sha,'rev-1');
});
test('failed finish leaves marker protected',async()=>{
 const api=make(async()=>({status:500}));await assert.rejects(api.finish(key,'rev-1',{status:'ISSUED',email_acknowledged:true}));
});