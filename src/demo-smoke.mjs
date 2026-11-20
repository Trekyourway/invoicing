import crypto from "node:crypto";
import {normalizedPayment} from './policy.mjs';
import {createDocPayload,issueAtProvider} from './hyp.mjs';
// This executes only when an operator manually triggers CI with HYP Demo secrets.
// It generates a real DEMO document, never a production document.
const e=process.env;
if(e.HYP_ENV!=='sandbox'||e.HYP_ENABLE_LIVE!=='YES'||e.HYP_ALLOW_PRODUCTION==='YES')throw new Error('Sandbox-only smoke');
const recipient=e.DEMO_RECIPIENT_EMAIL;
if(!recipient||recipient.endsWith('example.com'))throw new Error('DEMO_RECIPIENT_EMAIL must be real and authorized');
const tx=normalizedPayment({source_provider:'demo_smoke',source_reference:`demo-${new Date().toISOString()}-${crypto.randomUUID()}`,customer_name:'YOURWAY TEST',customer_email:recipient,description:'בדיקת קבלה בסביבת דמו בלבד',amount_ils:1,payment_date:new Date().toISOString().slice(0,10),payment_method:'other'});
const p={...tx,status:'VERIFIED',verified_at:new Date().toISOString()};createDocPayload(p,e);
const result=await issueAtProvider(p,{environment:e});
if(result.status!=='ISSUED')throw new Error('HYP demo did not confirm document');
console.log(JSON.stringify({status:result.status,document_id:result.document_id?'<redacted>':'missing',email_acknowledged:result.email_acknowledged}));