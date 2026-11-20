import {listInbox,getInboxBytes} from './drive.mjs';
import {extractCandidate} from './ocr.mjs';
import * as DB from './db.mjs';
export async function scanInbox({store=DB,env=process.env,listFiles=listInbox,download=getInboxBytes,extract=extractCandidate}={}){
 const files=await listFiles({environment:env});let newItems=0,failed=0;
 for(const f of files){
   if(await store.hasEvidence(f.id))continue;
   try{
     let recognized=null;
     if(env.GOOGLE_AI_API_KEY&&env.GOOGLE_AI_MODEL){const bytes=await download(f.id,{environment:env});recognized=await extract({bytes,mimeType:f.mimeType,environment:env});}
     // OCR output is a draft, NEVER evidence that funds have been received.
     const created=await store.createPayment({source_provider:'drive',source_reference:f.id,evidence_file_id:f.id,
       customer_name:recognized?.customer_name||'',amount_ils:recognized?.amount_ils||null,
       payment_date:recognized?.payment_date||null,payment_method:recognized?.payment_method||null,
       description:'',customer_email:''});
     await store.markEvidence(f.id,created.id);newItems++;
   }catch{failed++;}
 }
 return {scanned:files.length,new_items:newItems,failed,all_require_verification:true};
}