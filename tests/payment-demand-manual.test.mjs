import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemandPayload} from '../src/payment-demand-issue-once.mjs';

const env={HYP_ENV:'production',HYP_ENABLE_LIVE:'YES',HYP_ALLOW_PRODUCTION:'YES',HYP_API_KEY:'dummy',HYP_API_EMAIL:'owner@example.com',HYP_DEVELOPER_EMAIL:'dev@example.com'};
const bank={bank_name:'Demo bank',bank_code:'11',branch:'100',account:'1234567',account_holder:'Provider'};
const base={kind:'payment_demand',payment_received:false,owner_authorizes_issue:true,source_provider:'owner_direct',source_reference:'demand-test-one',customer_name:'Example Company Ltd',customer_email:'billing@example.com',description:'Consulting service',currency:'ILS',amount_ils:100,bank};
const tid='a'.repeat(64);
test('manual delivery never sends HYP email or claims payment received',()=>{
  const p=createDemandPayload({...base,delivery_mode:'owner_manual',billing_company_number:'123456789',service_recipient:'Example recipient',contact_person:'Billing officer'},{environment:env,transactionId:tid});
  assert.equal(p.type,300);
  assert.equal(p.dont_send_email,1);
  assert.equal(p.customer_name,'Example Company Ltd');
  assert.equal(p.customer_email,'billing@example.com');
  assert.equal(p.transaction_id.length,44);
  assert.equal(Object.hasOwn(p,'email_text'),false);
  assert.equal(Object.hasOwn(p,'payment'),false);
  assert.match(p.comment,/123456789/);
  assert.match(p.comment,/Example recipient/);
  assert.match(p.comment,/Billing officer/);
});
test('old demands preserve existing email behavior',()=>{
  const p=createDemandPayload(base,{environment:env,transactionId:tid});
  assert.equal(p.dont_send_email,0);
  assert.ok(p.email_text);
});
test('amount, authorization and delivery are guarded',()=>{
  assert.throws(()=>createDemandPayload({...base,owner_authorizes_issue:false},{environment:env,transactionId:tid}));
  assert.throws(()=>createDemandPayload({...base,delivery_mode:'unknown'},{environment:env,transactionId:tid}));
  assert.throws(()=>createDemandPayload({...base,amount_ils:0},{environment:env,transactionId:tid}));
  assert.throws(()=>createDemandPayload(base,{environment:{...env,HYP_ALLOW_PRODUCTION:'NO'},transactionId:tid}));
});
