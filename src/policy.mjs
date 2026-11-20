import crypto from 'node:crypto';
const METHODS=new Set(['bit','paybox','bank_transfer','other']);
const ALLOWED_FIELDS=['source_provider','source_reference','customer_name','customer_email','description','amount_ils','payment_date','payment_method','evidence_file_id'];
const str=(v,max=250)=>typeof v==='string'?v.trim().slice(0,max):'';
export function amount(value) {
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0||!Number.isInteger(Math.round(n*100))||Math.abs(n*100-Math.round(n*100))>1e-7)throw new Error('invalid amount');
  return Number(n.toFixed(2));
}
export function dateISO(v) {
  if(v===undefined||v===null||v==='')return null;
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))throw new Error('invalid date');
  const [y,m,d]=v.split('-').map(Number);
  const date=new Date(Date.UTC(y,m-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw new Error('invalid date');
  return v;
}
export function normalizedPayment(raw) {
  if(!raw || typeof raw!=='object'||Array.isArray(raw))throw new Error('invalid payment');
  const o={}; for(const key of ALLOWED_FIELDS)if(Object.hasOwn(raw,key))o[key]=raw[key];
  o.source_provider=str(o.source_provider,24).toLowerCase();
  o.source_reference=str(o.source_reference,180);
  if(!o.source_provider||!o.source_reference)throw new Error('source and reference required');
  o.customer_name=str(o.customer_name,180);
  o.customer_email=str(o.customer_email,254).toLowerCase();
  o.description=str(o.description,280);
  o.amount_ils=amount(o.amount_ils);
  o.payment_date=dateISO(o.payment_date);
  o.payment_method=o.payment_method?str(o.payment_method,30).toLowerCase():null;
  if(o.payment_method&&!METHODS.has(o.payment_method))throw new Error('invalid method');
  o.evidence_file_id=str(o.evidence_file_id,200);
  o.source_key=crypto.createHash('sha256').update(`${o.source_provider}\0${o.source_reference}`).digest('hex');
  return o;
}
export function assertReadyForVerification(p) {
  if(!p.customer_name||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.customer_email||'')||!p.description||!p.amount_ils||!p.payment_date||!METHODS.has(p.payment_method)) throw new Error('customer, email, description, amount, date and method are required');
  if(p.source_provider==='drive'&&!p.evidence_file_id)throw new Error('evidence file id required');
  return p;
}
export function assertMayIssue(p) {
  assertReadyForVerification(p);
  if(p.status!=='VERIFIED'||!p.verified_at)throw new Error('Payment not verified as received');
  return p;
}
export function publicStatus(environment={}) {
 const env=environment.HYP_ENV||'sandbox';
 if(!['sandbox','production'].includes(env))return {mode:'blocked',issuance_enabled:false};
 return {mode:env,issuance_enabled:environment.HYP_ENABLE_LIVE==='YES'&&(env==='sandbox'||environment.HYP_ALLOW_PRODUCTION==='YES'),archive_configured:Boolean(environment.GOOGLE_CLIENT_ID&&environment.GOOGLE_CLIENT_SECRET&&environment.GOOGLE_REFRESH_TOKEN&&environment.GOOGLE_ARCHIVE_FOLDER_ID),inbox_configured:Boolean(environment.GOOGLE_INBOX_FOLDER_ID)};
}
export function assertProviderEnabled(environment=process.env) {
 const s=publicStatus(environment);
 if(!s.issuance_enabled)throw new Error('Provider issuance is disabled by deployment policy');
 return s;
}
export function sanityProviderResult(out,status=200) {
  if(status<200||status>=300||out?.success!==true)return {status:'ISSUANCE_UNKNOWN',reason:'provider_rejected_or_ambiguous'};
  const documentID=out?.doc_uuid||out?.uuid||out?.doc_id||out?.id||out?.document_id||null;
  const pdf=out?.pdf_link||null;
  if(!documentID&&!pdf)return {status:'ISSUANCE_UNKNOWN',reason:'missing_document_reference'};
  const sent=Array.isArray(out?.sent_mails)?out.sent_mails:[];
  return {status:'ISSUED',document_id:String(documentID||''),pdf_url:pdf,email_acknowledged:sent};
}