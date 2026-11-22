import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransactionInvoicePayload,issueTransactionInvoice} from '../src/invoice.mjs';
const p={source_provider:'owner_direct',source_reference:'test-invoice-001',customer_name:'Test client',customer_email:'client@example.com',description:'Previously paid consulting',amount_ils:1200,payment_method:'bit',payment_date:'2026-11-20',owner_confirmed_received:true,owner_authorizes_issue:true};
const environment={HYP_ENV:'production',HYP_ENABLE_LIVE:'YES',HYP_ALLOW_PRODUCTION:'YES',HYP_API_KEY:'test-key',HYP_API_EMAIL:'owner@example.com',HYP_DEVELOPER_EMAIL:'dev@example.com'};
const transactionId='a'.repeat(64);
test('invoice is ONLY proforma, no VAT, no collection and no new receipt',()=>{
  const body=createTransactionInvoicePayload(p,{environment,transactionId});
  assert.equal(body.type,300);
  assert.equal(body.transaction_id,transactionId);
  assert.equal(body.item[0].vat_type,'NON');
  assert.equal(body.item[0].price,1200);
  assert.equal(body.dont_send_email,0);
  assert.equal(Object.hasOwn(body,'payment'),false);
  assert.match(body.comment,/שולם במלואו/);
});
test('requires explicit owner authorization and blocks tax invoice path',()=>{
 assert.throws(()=>createTransactionInvoicePayload({...p,owner_authorizes_issue:false},{environment,transactionId}));
 assert.throws(()=>createTransactionInvoicePayload(p,{environment:{...environment,HYP_ALLOW_PRODUCTION:'NO'},transactionId}));
 assert.throws(()=>createTransactionInvoicePayload(p,{environment,transactionId:'invalid'}));
});
test('mock provider call makes only type 300 request and checks emailed client',async()=>{
 let issued;
 const fetchFn=async(url,opts)=>{
   assert.equal(url,'https://www.ezcount.co.il/api/createDoc');
   issued=JSON.parse(opts.body);
   return {status:200,json:async()=>({success:true,doc_uuid:'test-uuid',sent_mails:['client@example.com']})};
 };
 const result=await issueTransactionInvoice(p,{environment,transactionId,fetchFn});
 assert.equal(issued.type,300);
 assert.equal(result.status,'ISSUED');
 assert.equal(result.email_acknowledged,true);
});
