import {readFile,readdir} from 'node:fs/promises';
import {decryptReceipt,opaquePaymentKey} from './receipt-crypto.mjs';
import {accessToken,syncToLedger} from './ledger-sync.mjs';
import {decryptPrivateResult} from './private-result.mjs';

const env=process.env;
if(env.GITHUB_REPOSITORY!=='Trekyourway/invoicing'||env.GITHUB_REF!=='refs/heads/main')throw Error('untrusted_repository_ref');
if(!env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_B64 && !(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.GOOGLE_REFRESH_TOKEN)){
  console.log(JSON.stringify({ledger_sync:'NOT_CONFIGURED',documents_issued:0}));process.exit(0);
}
if(!env.RECEIPT_PRIVATE_KEY_B64||!env.GITHUB_TOKEN)throw Error('missing_sync_configuration');
const privateKey=Buffer.from(env.RECEIPT_PRIVATE_KEY_B64,'base64').toString('utf8');
if(!privateKey.includes('BEGIN PRIVATE KEY'))throw Error('invalid_decryption_configuration');
const token=await accessToken(env);
const dir=new URL('../requests/',import.meta.url);
const files=(await readdir(dir)).filter(name=>/^[0-9a-f-]{36}\.enc\.json$/.test(name)).sort();
if(files.length>500)throw Error('receipt_queue_exceeds_safe_limit');
let updated=0,unchanged=0,pending=0,review=0,skippedOtherYear=0;
for(const file of files){
  try{
    const envelope=JSON.parse(await readFile(new URL('../requests/'+file,import.meta.url),'utf8'));
    if(envelope.id+'.enc.json'!==file)throw Error('request_id_mismatch');
    const payment=decryptReceipt(envelope,privateKey);
    if(!payment.payment_date.startsWith('2026-')){skippedOtherYear++;continue;}
    const key=opaquePaymentKey(payment,privateKey);
    const url='https://api.github.com/repos/Trekyourway/invoicing/contents/receipts/state/'+key+'.json';
    const response=await fetch(url,{headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
    if(response.status===404){pending++;continue;}
    if(!response.ok)throw Error('state_lookup_failed');
    const obj=await response.json();
    const state=JSON.parse(Buffer.from(obj.content,'base64').toString('utf8'));
    if(!['ISSUED','ISSUED_CHECK_DELIVERY'].includes(state.status)){pending++;continue;}
    const privateDoc=decryptPrivateResult(state.private_result,privateKey);
    const result=await syncToLedger({payment,key,provider:{...privateDoc,emailAcknowledged:state.email_acknowledged===true},token});
    if(result.kind==='inserted'||result.kind==='enriched'||result.kind==='reconciled_existing')updated++;else unchanged++;
  }catch{
    review++; // No customer information, exception detail, or credentials in public CI logs.
  }
}
console.log(JSON.stringify({ledger_sync:'COMPLETE',updated,unchanged,pending,needs_review:review,skipped_other_year:skippedOtherYear,documents_issued:0}));
if(review)process.exitCode=1;
