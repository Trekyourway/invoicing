import {assertProviderEnabled} from './policy.mjs';
import {createDocPayload,issueAtProvider} from './hyp.mjs';
import * as DB from './db.mjs';
import {backupPDF} from './drive.mjs';
export async function issueReceipt(id,{environment=process.env,store=DB,provider=issueAtProvider,archive=backupPDF}={}) {
 assertProviderEnabled(environment);
 const payment=await store.getPayment(id);
 if(!payment)throw new Error('Payment not found');
 // Check provider credentials/payment map before making an irreversible DB reservation.
 createDocPayload(payment,environment);
 const reservation=await store.reserveIssuance(id,environment.HYP_ENV||'sandbox');
 if(!reservation.reserved)return {status:'BLOCKED_ALREADY_PROCESSED',payment_status:reservation.status};
 let outcome;
 try{outcome=await provider(reservation.payment,{environment});}
 catch {outcome={status:'ISSUANCE_UNKNOWN',reason:'network_or_unknown_response'};}
 const result=await store.finishIssuance(id,outcome);
 if(result.status!=='ISSUED')return {...result,action:'RECONCILE_WITH_HYP_BEFORE_RETRY'};
 // Archiving is not a condition for official document creation. Never re-issue on archive failure.
 let backup={ok:false,reason:'not_configured'};
 if(outcome.pdf_url){try{backup=await archive(outcome.pdf_url,{payment:reservation.payment,documentId:outcome.document_id,environment});}catch{backup={ok:false,reason:'backup_failed'};}}
 await store.finishArchive(id,backup);
 return {...result,document_id:outcome.document_id,archive_status:backup.ok?'STORED':'BACKUP_FAILED'};
}
export async function retryArchive(id,{store=DB,archive=backupPDF,environment=process.env}={}){
 const p=await store.getPayment(id);const a=await store.pendingArchive(id);
 if(!p||!a||a.status!=='ISSUED')throw new Error('Only existing issued receipts can be archived');
 if(a.archive_status==='STORED')return {status:'ALREADY_ARCHIVED'};
 let backup={ok:false};try{backup=await archive(a.pdf_url,{payment:p,documentId:a.document_id,environment});}catch{}
 await store.finishArchive(id,backup);return {status:backup.ok?'STORED':'BACKUP_FAILED'};
}