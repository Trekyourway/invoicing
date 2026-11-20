import {test} from 'node:test';import assert from 'node:assert/strict';
import {createApp} from '../src/server.mjs';
async function make(t){const srv=createApp({store:{listPayments:async()=>[]}});await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));t.after(()=>srv.close());return `http://127.0.0.1:${srv.address().port}`;}
test('health reachable and minimum information',async t=>{const b=await make(t);const r=await fetch(b+'/health');assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'ok'});});
test('admin UI served but API is not public',async t=>{const b=await make(t);assert.equal((await fetch(b+'/')).status,200);assert.equal((await fetch(b+'/api/payments')).status,401);});
test('public cannot issue receipts',async t=>{const b=await make(t);const r=await fetch(b+'/api/payments/00000000-0000-0000-0000-000000000001/issue',{method:'POST'});assert.equal(r.status,401);});
test('unknown routes 404',async t=>{const b=await make(t);assert.equal((await fetch(b+'/anything')).status,404);});

test('one step receipt: user click confirms money and requests issue exactly once', async t=>{
 const priorToken=process.env.ADMIN_API_TOKEN, priorEnv=process.env.HYP_ENV, priorLive=process.env.HYP_ENABLE_LIVE;
 process.env.ADMIN_API_TOKEN='test_only_admin_token_32_chars_long';process.env.HYP_ENV='sandbox';process.env.HYP_ENABLE_LIVE='YES';
 t.after(()=>{for(const [k,v] of [['ADMIN_API_TOKEN',priorToken],['HYP_ENV',priorEnv],['HYP_ENABLE_LIVE',priorLive]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const id='b168c726-d62b-43ea-8be9-d0a39adc3db1';let saved=false,verifyCalls=0,issueCalls=0;
 const store={
  createPayment:async x=>{assert.equal(x.source_reference,id);return {id:'payment-1',status:saved?'ISSUED':'NEEDS_DETAILS'};},
  verifyPayment:async(p,note)=>{assert.equal(p,'payment-1');assert.ok(note.includes('funds received'));verifyCalls++;return {id:p,status:'VERIFIED'};},
  listPayments:async()=>[]
 };
 const issuer=async(p)=>{assert.equal(p,'payment-1');issueCalls++;saved=true;return {status:'ISSUED',document_id:'demo-receipt'}};
 const server=createApp({store,issuer});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
 const uri=`http://127.0.0.1:${server.address().port}/api/receipts`;
 const payment={request_id:id,payment_confirmed:true,customer_name:'Test client',customer_email:'test@example.com',description:'AI session',amount_ils:400,payment_date:'2026-11-20',payment_method:'bit'};
 for(let i=0;i<2;i++){
  const res=await fetch(uri,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.ADMIN_API_TOKEN},body:JSON.stringify(payment)});
  assert.equal(res.status,200);assert.equal((await res.json()).status,i===0?'ISSUED':'ALREADY_ISSUED');
 }
 assert.equal(verifyCalls,1);assert.equal(issueCalls,1);
});

test('one step receipt refuses unauthenticated or unconfirmed payment',async t=>{
 const prior=process.env.ADMIN_API_TOKEN,priorEnv=process.env.HYP_ENV,priorLive=process.env.HYP_ENABLE_LIVE;
 process.env.ADMIN_API_TOKEN='test_only_admin_token_32_chars_long';process.env.HYP_ENV='sandbox';process.env.HYP_ENABLE_LIVE='YES';
 t.after(()=>{for(const [k,v] of [['ADMIN_API_TOKEN',prior],['HYP_ENV',priorEnv],['HYP_ENABLE_LIVE',priorLive]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 let created=0;const srv=createApp({store:{createPayment:async()=>{created++;return {id:'x',status:'NEEDS_DETAILS'}}}});await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));t.after(()=>srv.close());
 const uri=`http://127.0.0.1:${srv.address().port}/api/receipts`,payload={request_id:'b168c726-d62b-43ea-8be9-d0a39adc3db1',payment_confirmed:false};
 const r1=await fetch(uri,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});assert.equal(r1.status,401);
 const r2=await fetch(uri,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.ADMIN_API_TOKEN},body:JSON.stringify(payload)});assert.equal(r2.status,400);
 assert.equal(created,0);
});