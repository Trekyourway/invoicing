import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {encryptReceipt,decryptReceipt,opaquePaymentKey,validateReceiptInput} from '../src/receipt-crypto.mjs';
import {executeReceipt} from '../src/receipt-executor.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const raw={customer_name:'Test Client',customer_email:'client@example.com',description:'Paid mentoring',amount_ils:400,payment_date:'2026-11-20',payment_method:'bit',owner_confirmed_received:true,owner_authorizes_issue:true};
const pack=()=>encryptReceipt(raw,publicKey);
test('asymmetric envelope roundtrip preserves verified payload',()=>{const v=decryptReceipt(pack(),privateKey);assert.equal(v.customer_email,'client@example.com');assert.equal(v.amount_ils,400);assert.equal(v.source_provider,'owner_direct');});
test('public file contains no customer email/name/description',()=>{const text=JSON.stringify(pack());for(const val of ['client@example.com','Test Client','Paid mentoring'])assert.ok(!text.includes(val));});
test('tampered ciphertext fails GCM authentication',()=>{const x=pack();x.ciphertext='A'+x.ciphertext.slice(1);assert.throws(()=>decryptReceipt(x,privateKey));});
test('cross-id tampering fails authentication',()=>{const x=pack();x.id='f9971bc4-0591-40f2-a459-8abf5ade1000';assert.throws(()=>decryptReceipt(x,privateKey));});
test('no owner receipt authorization never encrypts',()=>assert.throws(()=>encryptReceipt({...raw,owner_authorizes_issue:false},publicKey)));
test('no confirmation of funds never encrypts',()=>assert.throws(()=>encryptReceipt({...raw,owner_confirmed_received:false},publicKey)));
test('bad email or payment date rejected',()=>{assert.throws(()=>validateReceiptInput({...raw,customer_email:'invalid'}));assert.throws(()=>validateReceiptInput({...raw,payment_date:'2026-02-30'}));});
test('future payment is rejected',()=>assert.throws(()=>validateReceiptInput({...raw,payment_date:'2099-01-01'})));
test('invalid amount rejected',()=>assert.throws(()=>validateReceiptInput({...raw,amount_ils:-5})));
test('same payment gets same dedupe identity; masked with HMAC',()=>{const a=validateReceiptInput(raw),b=validateReceiptInput(raw);assert.equal(a.source_reference,b.source_reference);const key=opaquePaymentKey(a,privateKey);assert.equal(key,opaquePaymentKey(b,privateKey));assert.notEqual(key,a.source_reference);});
test('two different explicit references are distinct',()=>{const a=validateReceiptInput({...raw,source_reference:'bit-01'}),b=validateReceiptInput({...raw,source_reference:'bit-02'});assert.notEqual(opaquePaymentKey(a,privateKey),opaquePaymentKey(b,privateKey));});
test('only one HYP issue for repeat',async()=>{const seen=new Set();let callCount=0;const claim=async k=>{if(seen.has(k))return {claimed:false};seen.add(k);return {claimed:true,sha:'blob'};};const finish=async()=>{};const provider=async()=>{callCount++;return {status:'ISSUED',email_acknowledged:true};};const env={privateKey,claim,finish,provider,preflight:async()=>{}};const x=pack();const a=await executeReceipt(x,env),b=await executeReceipt(x,env);assert.equal(a.status,'ISSUED');assert.equal(b.status,'ALREADY_RESERVED');assert.equal(callCount,1);});
test('provider timeout remains reserved and never retries',async()=>{let reserved=false,callCount=0;const claim=async()=>{if(reserved)return {claimed:false};reserved=true;return {claimed:true,sha:'blob'};};const finish=async(key,sha,s)=>assert.equal(s.status,'RECONCILE_WITH_HYP');const provider=async()=>{callCount++;throw Error('network timeout');};const opts={privateKey,claim,finish,provider,preflight:async()=>{}};const x=pack();const a=await executeReceipt(x,opts),b=await executeReceipt(x,opts);assert.equal(a.status,'RECONCILE_WITH_HYP');assert.equal(b.status,'ALREADY_RESERVED');assert.equal(callCount,1);});
test('invalid production configuration rejects BEFORE reservation',async()=>{let claimed=false;await assert.rejects(executeReceipt(pack(),{privateKey,claim:async()=>{claimed=true;return {claimed:true,sha:'x'};},finish:async()=>{},provider:async()=>{},preflight:async()=>{throw Error('bad production key');}}));assert.equal(claimed,false);});
test('only non-PII status is persisted after successful issuance',async()=>{let persisted;await executeReceipt(pack(),{privateKey,claim:async()=>({claimed:true,sha:'blob'}),finish:async(key,sha,state)=>{persisted=JSON.stringify(state);},provider:async()=>({status:'ISSUED',document_id:'private-id',pdf_url:'private-url',email_acknowledged:true}),preflight:async()=>{}});for(const secret of ['client@example.com','Test Client','private-id','private-url','400'])assert.ok(!persisted.includes(secret));});

test('same paid event with corrected description remains same dedupe fingerprint',()=>{
 const a=validateReceiptInput(raw), b=validateReceiptInput({...raw,description:'Corrected mentoring description',customer_name:'Corrected Name'});
 assert.equal(a.source_reference,b.source_reference);
});