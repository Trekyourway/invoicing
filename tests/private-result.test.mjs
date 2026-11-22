import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {encryptPrivateResult,decryptPrivateResult} from '../src/private-result.mjs';
import {executeReceipt} from '../src/receipt-executor.mjs';
import {encryptReceipt} from '../src/receipt-crypto.mjs';

const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const result={status:'ISSUED',document_id:'PRIVATE_DOC_ID',document_number:'40231',pdf_url:'https://files.ezcount.co.il/front/documents/get/abc123',email_acknowledged:true};
test('official provider document metadata is encrypted before public state persistence',()=>{
  const e=encryptPrivateResult(result,privateKey);const publicText=JSON.stringify(e);
  for(const secret of ['PRIVATE_DOC_ID','40231','https://files.ezcount.co.il'])assert.ok(!publicText.includes(secret));
  const decoded=decryptPrivateResult(e,privateKey);
  assert.equal(decoded.documentId,'PRIVATE_DOC_ID');
  assert.equal(decoded.documentNumber,'40231');
  assert.equal(decoded.pdfUrl,result.pdf_url);
});
test('tampering with ciphertext is rejected',()=>{
  const e=encryptPrivateResult(result,privateKey);e.tag='A'+e.tag.slice(1);
  assert.throws(()=>decryptPrivateResult(e,privateKey));
});
test('non-EZcount PDF links are not persisted',()=>{
  const e=encryptPrivateResult({...result,pdf_url:'https://untrusted.example/client.pdf'},privateKey);
  const value=decryptPrivateResult(e,privateKey);assert.equal(value.pdfUrl,undefined);
});
test('issuer safely stores only ciphertext in status and retries never reissue',async()=>{
  const envelope=encryptReceipt({customer_name:'Demo Client',customer_email:'demo@example.test',description:'Mentoring',amount_ils:200,payment_date:'2026-11-22',payment_method:'bank_transfer',source_reference:'test-123',owner_confirmed_received:true,owner_authorizes_issue:true},publicKey);
  let state,issued=0,claimed=false;
  const opts={privateKey,claim:async()=>{if(claimed)return {claimed:false};claimed=true;return {claimed:true,sha:'sha'};},
    finish:async(key,sha,status)=>{state=status;},
    preflight:async()=>{},
    provider:async()=>{issued++;return result;}};
  const first=await executeReceipt(envelope,opts),second=await executeReceipt(envelope,opts);
  assert.equal(first.status,'ISSUED');assert.equal(second.status,'ALREADY_RESERVED');assert.equal(issued,1);
  const stored=JSON.stringify(state);
  for(const value of ['PRIVATE_DOC_ID','40231','demo@example.test',result.pdf_url])assert.ok(!stored.includes(value));
  assert.equal(decryptPrivateResult(state.private_result,privateKey).documentNumber,'40231');
});
