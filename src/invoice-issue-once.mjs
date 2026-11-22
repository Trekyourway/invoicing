import {readFile,readdir} from 'node:fs/promises';
import {decryptReceipt,opaquePaymentKey} from './receipt-crypto.mjs';
import {createGitHubState} from './gh-receipt-state.mjs';
import {createTransactionInvoicePayload,issueTransactionInvoice} from './invoice.mjs';

const env=process.env;
if(env.HYP_ENV!=='production'||env.HYP_ENABLE_LIVE!=='YES'||env.HYP_ALLOW_PRODUCTION!=='YES')throw new Error('Live invoice issuance disabled');
for(const name of ['HYP_API_KEY','HYP_API_EMAIL','HYP_DEVELOPER_EMAIL','RECEIPT_PRIVATE_KEY_B64','GITHUB_TOKEN','GITHUB_REPOSITORY'])
  if(!env[name])throw new Error('Missing required configuration: '+name);
if(env.GITHUB_REPOSITORY!=='Trekyourway/invoicing'||env.GITHUB_REF!=='refs/heads/main')throw new Error('Untrusted repository/ref');
const privateKey=Buffer.from(env.RECEIPT_PRIVATE_KEY_B64,'base64').toString('utf8');
if(!privateKey.includes('BEGIN PRIVATE KEY'))throw new Error('Invalid private decryption key');
const {claim,finish}=createGitHubState({repo:env.GITHUB_REPOSITORY,token:env.GITHUB_TOKEN,kind:'invoices'});
const dir=new URL('../invoice-requests/',import.meta.url);
let files=[];try{files=(await readdir(dir)).filter(x=>/^[0-9a-f-]{36}\.enc\.json$/.test(x)).sort();}catch(e){if(e.code!=='ENOENT')throw e;}
if(files.length>5)throw new Error('Too many invoice requests');
let issued=0,skipped=0,review=0;
for(const file of files){
  const req=JSON.parse(await readFile(new URL('../invoice-requests/'+file,import.meta.url),'utf8'));
  if(req.id+'.enc.json'!==file)throw new Error('Invoice request id mismatch');
  const p=decryptReceipt(req,privateKey);
  if(p.source_provider!=='owner_direct'||!p.source_reference.startsWith('invoice-'))throw new Error('Invoice request not authorized for this workflow');
  const id=opaquePaymentKey(p,privateKey);
  // Validate expected document type, VAT-free details, and required approval BEFORE reservation.
  createTransactionInvoicePayload(p,{environment:env,transactionId:id});
  const reservation=await claim(id,req.id);
  if(!reservation.claimed){skipped++;continue;}
  let outcome={status:'ISSUANCE_UNKNOWN'};
  try{outcome=await issueTransactionInvoice(p,{environment:env,transactionId:id});}
  catch{outcome={status:'ISSUANCE_UNKNOWN'};}
  const finalState={status:outcome.status==='ISSUED'?(outcome.email_acknowledged===true?'ISSUED':'ISSUED_CHECK_DELIVERY'):'RECONCILE_WITH_HYP',
    email_acknowledged:outcome.status==='ISSUED'&&outcome.email_acknowledged===true,
    updated_utc:new Date().toISOString()};
  await finish(id,reservation.sha,finalState);
  if(finalState.status==='ISSUED')issued++;else review++;
}
console.log(JSON.stringify({status:'completed',invoice_issued_and_email_acknowledged:issued,already_reserved:skipped,needs_review:review}));
if(review)process.exitCode=1;
