import {readFile} from 'node:fs/promises';
import {decryptReceipt,opaquePaymentKey} from './receipt-crypto.mjs';
import {createTransactionInvoicePayload} from './invoice.mjs';
import {createGitHubState} from './gh-receipt-state.mjs';
import {sanityProviderResult} from './policy.mjs';

const env=process.env;
if(env.GITHUB_REPOSITORY!=='Trekyourway/invoicing'||env.GITHUB_REF!=='refs/heads/main'||env.HYP_ENV!=='production'||env.HYP_ENABLE_LIVE!=='YES'||env.HYP_ALLOW_PRODUCTION!=='YES')throw new Error('Untrusted context');
for(const n of ['GITHUB_TOKEN','HYP_API_KEY','HYP_API_EMAIL','HYP_DEVELOPER_EMAIL','RECEIPT_PRIVATE_KEY_B64','INVOICE_REQUEST_ID'])if(!env[n])throw new Error('Missing required configuration '+n);
const key=Buffer.from(env.RECEIPT_PRIVATE_KEY_B64,'base64').toString('utf8');
const requestId=env.INVOICE_REQUEST_ID;
if(!/^[a-f0-9-]{36}$/.test(requestId))throw new Error('Invalid request id');
const envelope=JSON.parse(await readFile(new URL('../invoice-requests/'+requestId+'.enc.json',import.meta.url),'utf8'));
if(envelope.id!==requestId)throw new Error('Request mismatch');
const p=decryptReceipt(envelope,key);
if(p.source_provider!=='owner_direct'||!p.source_reference.startsWith('invoice-'))throw new Error('Unauthorized document type');
const tid=opaquePaymentKey(p,key);
const payload=createTransactionInvoicePayload(p,{environment:env,transactionId:tid});
const url=`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/contents/invoices/state/${tid}.json`;
const headers={Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
const stateResponse=await fetch(url,{headers});
if(stateResponse.status!==200)throw new Error('Existing reservation required for reconciliation');
const stored=await stateResponse.json();
const state=JSON.parse(Buffer.from(stored.content,'base64').toString('utf8'));
if(state.status!=='RECONCILE_WITH_HYP')throw new Error('Unexpected state; must not issue again');
// This is a single, intentional recovery of the exact same transaction_id.
// HYP documentation guarantees a repeated transaction_id retrieves the existing document, not a duplicate.
const response=await fetch('https://www.ezcount.co.il/api/createDoc',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(35000)
});
let out;try{out=await response.json();}catch{out={};}
const result=sanityProviderResult(out,response.status);
const detail=JSON.stringify({http_status:response.status,success:out?.success===true,document_ref_present:Boolean(out?.doc_uuid||out?.uuid||out?.doc_id||out?.id||out?.document_id||out?.pdf_link),error_code:(typeof out?.error_code==='number'||/^\\d{1,6}$/.test(String(out?.error_code||'')))?String(out.error_code):null,response_fields:Object.keys(out).filter(k=>/^[a-z_]{2,40}$/.test(k)).slice(0,18)});
console.log('HYP_SAFE_DIAGNOSTICS '+detail);
const hintText=String(out?.errMsg||'').toLowerCase();
const known=['api','key','invalid','type','item','vat','email','company','account','plan','permission','forbidden','not','allowed','document','invoice','receipt','customer','required','missing','transaction','duplicate','date','currency','request','format','failed','error','data','address','number','exempt','support','upgrade'];
console.log('HYP_ERROR_HINTS '+JSON.stringify(known.filter(x=>hintText.includes(x))));
if(result.status!=='ISSUED')throw new Error('HYP returned no confirmed document; no additional retries');
const ack=Array.isArray(result.email_acknowledged)&&result.email_acknowledged.some(x=>typeof x==='string'&&x.trim().toLowerCase()===p.customer_email);
const {finish}=createGitHubState({repo:env.GITHUB_REPOSITORY,token:env.GITHUB_TOKEN,kind:'invoices'});
await finish(tid,stored.sha,{status:ack?'ISSUED':'ISSUED_CHECK_DELIVERY',email_acknowledged:ack,updated_utc:new Date().toISOString()});
console.log(JSON.stringify({status:ack?'ISSUED':'ISSUED_CHECK_DELIVERY',email_acknowledged:ack}));
