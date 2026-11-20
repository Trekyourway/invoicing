import http from 'node:http';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as DB from './db.mjs';
import {issueReceipt,retryArchive} from './service.mjs';
import {scanInbox} from './inbox.mjs';
import {publicStatus} from './policy.mjs';
const MAX=16384;
const uiPath=fileURLToPath(new URL('./admin.html',import.meta.url));
const jsPath=fileURLToPath(new URL('./admin.js',import.meta.url));
const send=(res,status,json)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(json));};
function authenticated(req){const secret=process.env.ADMIN_API_TOKEN||'';if(secret.length<32)return false;const supplied=(req.headers.authorization||'').replace(/^Bearer /,'');if(!supplied)return false;const lhs=crypto.createHash('sha256').update(secret).digest(),rhs=crypto.createHash('sha256').update(supplied).digest();return crypto.timingSafeEqual(lhs,rhs);}
async function body(req){let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>MAX)throw new Error('Payload too large');parts.push(chunk);}if(!size)return {};const data=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!data||Array.isArray(data)||typeof data!=='object')throw new Error('JSON object expected');return data;}
export function createApp({store=DB,issuer=issueReceipt,archiver=retryArchive,scanner=scanInbox}={}){
 return http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{status:'ok'});
   if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",'Cache-Control':'no-store','X-Frame-Options':'DENY'});return res.end(await readFile(uiPath));}
   if(req.method==='GET'&&url.pathname==='/admin.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(await readFile(jsPath));}
   if(!url.pathname.startsWith('/api/'))return send(res,404,{error:'not_found'});
   if(!authenticated(req))return send(res,401,{error:'unauthorized'});
   // The API supports no cross-origin browser access. The Bearer token stays in browser session memory.
   if(req.headers.origin){const origin=new URL(req.headers.origin);if(origin.host!==req.headers.host)return send(res,403,{error:'invalid_origin'});}
   if(req.method==='GET'&&url.pathname==='/api/status')return send(res,200,publicStatus(process.env));
   // One-step manual issuance: pressing "Issue" is the owner's confirmation
   // that the funds have already been received. No bank/Bit API integration.
   if(req.method==='POST'&&url.pathname==='/api/receipts'){
    if(!publicStatus(process.env).issuance_enabled)return send(res,409,{error:'issuance_disabled'});
    const input=await body(req);
    if(input.payment_confirmed!==true) return send(res,400,{error:'payment_confirmation_required'});
    if(typeof input.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id))
      return send(res,400,{error:'valid_request_id_required'});
    const data={source_provider:'manual',source_reference:input.request_id,
      customer_name:input.customer_name,customer_email:input.customer_email,
      description:input.description,amount_ils:input.amount_ils,
      payment_date:input.payment_date,payment_method:input.payment_method};
    const saved=await store.createPayment(data);
    if(saved.status==='SOURCE_CONFLICT_NEEDS_REVIEW'||saved.status==='DUPLICATE_SUSPECT')
      return send(res,409,{status:saved.status,payment_id:saved.id});
    if(saved.status==='ISSUED')return send(res,200,{status:'ALREADY_ISSUED',payment_id:saved.id});
    if(['ISSUANCE_UNKNOWN','ISSUING'].includes(saved.status))
      return send(res,409,{status:'RECONCILE_WITH_HYP_BEFORE_RETRY',payment_id:saved.id});
    if(['NEEDS_DETAILS','PENDING_VERIFICATION'].includes(saved.status)){
      const verified=await store.verifyPayment(saved.id,'User requested a receipt after confirming funds received.');
      if(verified.status!=='VERIFIED')return send(res,409,{status:verified.status,payment_id:saved.id});
    }else if(saved.status!=='VERIFIED')return send(res,409,{status:saved.status,payment_id:saved.id});
    const result=await issuer(saved.id,{store});
    return send(res,result.status==='ISSUED'||result.status==='ALREADY_ISSUED'?200:202,{...result,payment_id:saved.id});
   }
   if(req.method==='GET'&&url.pathname==='/api/payments')return send(res,200,{items:await store.listPayments()});
   if(req.method==='GET'&&url.pathname==='/api/report'){const month=url.searchParams.get('month')||new Date().toISOString().slice(0,7);return send(res,200,{month,items:await store.monthlyReport(month)});}
   if(req.method==='POST'&&url.pathname==='/api/payments')return send(res,201,await store.createPayment(await body(req)));
   if(req.method==='POST'&&url.pathname==='/api/inbox/scan')return send(res,200,await scanner({store}));
   const m=/^\/api\/payments\/([0-9a-fA-F-]{36})(?:\/(update|verify|issue|archive|ignore))?$/.exec(url.pathname);
   if(m&&req.method==='POST'){
    const [,id,action]=m;
    if(action==='update')return send(res,200,await store.updatePayment(id,await body(req)));
    if(action==='ignore'){const b=await body(req);return send(res,200,await store.ignorePayment(id,b.reason));}
    if(action==='verify'){const b=await body(req);return send(res,200,await store.verifyPayment(id,b.note));}
    if(action==='issue')return send(res,200,await issuer(id,{store}));
    if(action==='archive')return send(res,200,await archiver(id,{store}));
   }
   return send(res,404,{error:'not_found'});
  }catch(e){const error=e?.message||'internal_error';const expected=/invalid|required|missing|not found|Cannot|Payment|duplicate|disabled|already|Unsupported|too large|JSON|verified|code not|permission|not configured/i.test(error);return send(res,expected?400:500,{error:expected?error:'internal_error'});}
 });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 if((process.env.ADMIN_API_TOKEN||'').length<32)throw new Error('Set ADMIN_API_TOKEN to 32+ random characters before deployment');
 const port=Number(process.env.PORT||3000);createApp().listen(port,'0.0.0.0',()=>console.log(`YOURWAY invoicing listening on port ${port}`));
}