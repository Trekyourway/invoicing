import {test} from 'node:test';import assert from 'node:assert/strict';
import {createApp} from '../src/server.mjs';
async function make(t){const srv=createApp({store:{listPayments:async()=>[]}});await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));t.after(()=>srv.close());return `http://127.0.0.1:${srv.address().port}`;}
test('health reachable and minimum information',async t=>{const b=await make(t);const r=await fetch(b+'/health');assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'ok'});});
test('admin UI served but API is not public',async t=>{const b=await make(t);assert.equal((await fetch(b+'/')).status,200);assert.equal((await fetch(b+'/api/payments')).status,401);});
test('public cannot issue receipts',async t=>{const b=await make(t);const r=await fetch(b+'/api/payments/00000000-0000-0000-0000-000000000001/issue',{method:'POST'});assert.equal(r.status,401);});
test('unknown routes 404',async t=>{const b=await make(t);assert.equal((await fetch(b+'/anything')).status,404);});