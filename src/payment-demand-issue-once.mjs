import crypto from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {createGitHubState} from './gh-receipt-state.mjs';
import {sanityProviderResult,assertProviderEnabled} from './policy.mjs';

const env=process.env;
const EMAIL=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const bankFields=['bank_name','bank_code','branch','account','account_holder'];
function decrypt(envelope, privateKey) {
  if(envelope?.version!==1 || envelope.alg!=='RSA-OAEP-256+A256GCM' || !/^[0-9a-f-]{36}$/.test(envelope.id||''))throw Error('Invalid envelope');
  for(const field of ['key','iv','tag','ciphertext'])if(typeof envelope[field]!=='string'||envelope[field].length>10000)throw Error('Invalid encrypted data');
  const key=crypto.privateDecrypt({key:privateKey,oaepHash:'sha256'},Buffer.from(envelope.key,'base64url'));
  const dec=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64url'));
  dec.setAAD(Buffer.from(envelope.id));
  dec.setAuthTag(Buffer.from(envelope.tag,'base64url'));
  return JSON.parse(Buffer.concat([dec.update(Buffer.from(envelope.ciphertext,'base64url')),dec.final()]).toString('utf8'));
}
function validate(p) {
  if(!p||p.kind!=='payment_demand'||p.payment_received!==false||p.owner_authorizes_issue!==true)throw Error('Unpaid demand and explicit authorization required');
  if(p.source_provider!=='owner_direct'||typeof p.source_reference!=='string'||!p.source_reference.startsWith('demand-')||p.source_reference.length>180)throw Error('Invalid source');
  if(typeof p.customer_name!=='string'||!p.customer_name.trim()||p.customer_name.length>100)throw Error('Invalid customer');
  if(typeof p.customer_email!=='string'||!EMAIL.test(p.customer_email)||p.customer_email.length>254)throw Error('Invalid recipient');
  if(typeof p.description!=='string'||!p.description.trim()||p.description.length>280)throw Error('Invalid description');
  if(p.currency!=='ILS'||!Number.isFinite(p.amount_ils)||p.amount_ils<=0||p.amount_ils>1000000||Math.round(p.amount_ils*100)!==p.amount_ils*100)throw Error('Invalid amount');
  if(!p.bank||bankFields.some(k=>typeof p.bank[k]!=='string'||!p.bank[k].trim()||p.bank[k].length>80))throw Error('Invalid bank details');
  if(!/^\d{1,3}$/.test(p.bank.bank_code)||!/^\d{1,3}$/.test(p.bank.branch)||!/^\d{4,20}$/.test(p.bank.account))throw Error('Invalid bank identifiers');
  return p;
}
export function createDemandPayload(p,{environment=env,transactionId}={}){
  p=validate(p);
  assertProviderEnabled(environment);
  if(environment.HYP_ENV!=='production'||!environment.HYP_API_KEY||!environment.HYP_API_EMAIL||!environment.HYP_DEVELOPER_EMAIL)throw Error('Production configuration missing');
  if(!/^[a-f0-9]{64}$/.test(transactionId||''))throw Error('Invalid transaction ID');
  const bank='פרטי העברה בנקאית: '+p.bank.bank_name+' (קוד '+p.bank.bank_code+'), סניף '+p.bank.branch+', חשבון '+p.bank.account+', מוטב: '+p.bank.account_holder+'.';
  return {
    api_key:environment.HYP_API_KEY,api_email:environment.HYP_API_EMAIL,developer_email:environment.HYP_DEVELOPER_EMAIL,
    type:300,transaction_id:'dem-'+transactionId.slice(0,40),
    customer_name:p.customer_name.trim(),customer_email:p.customer_email.trim().toLowerCase(),
    dont_send_email:0,currency:'ILS',
    item:[{details:p.description.trim(),amount:1,price:p.amount_ils,vat_type:'NON'}],
    comment:'דרישת תשלום - טרם שולם. נא לבצע העברה בנקאית בלבד. '+bank,
    email_text:'שלום, מצורפת חשבונית עסקה לתשלום על סך '+p.amount_ils+' ₪. נא לבצע העברה בנקאית בלבד. '+bank+' לאחר העברה נא לשלוח אישור העברה.'
  };
}
async function issue(p,transactionId){
  const payload=createDemandPayload(p,{transactionId});
  const response=await fetch('https://www.ezcount.co.il/api/createDoc',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(35000)
  });
  const parsed=sanityProviderResult(await response.json(),response.status);
  return {status:parsed.status,email_acknowledged:parsed.status==='ISSUED'&&
    Array.isArray(parsed.email_acknowledged)&&parsed.email_acknowledged.some(x=>typeof x==='string'&&x.trim().toLowerCase()===p.customer_email.trim().toLowerCase())};
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  if(env.HYP_ENV!=='production'||env.HYP_ENABLE_LIVE!=='YES'||env.HYP_ALLOW_PRODUCTION!=='YES')throw Error('Live disabled');
  for(const name of ['HYP_API_KEY','HYP_API_EMAIL','HYP_DEVELOPER_EMAIL','RECEIPT_PRIVATE_KEY_B64','GITHUB_TOKEN','GITHUB_REPOSITORY'])if(!env[name])throw Error('Missing configuration: '+name);
  if(env.GITHUB_REPOSITORY!=='Trekyourway/invoicing'||env.GITHUB_REF!=='refs/heads/main')throw Error('Untrusted environment');
  const privateKey=Buffer.from(env.RECEIPT_PRIVATE_KEY_B64,'base64').toString('utf8');
  if(!privateKey.includes('BEGIN PRIVATE KEY'))throw Error('Invalid private key');
  const {claim,finish}=createGitHubState({repo:env.GITHUB_REPOSITORY,token:env.GITHUB_TOKEN,kind:'invoices'});
  const dir=new URL('../payment-demand-requests/',import.meta.url);
  const files=(await readdir(dir)).filter(x=>/^[0-9a-f-]{36}\.enc\.json$/.test(x)).sort();
  if(files.length>10)throw Error('Too many payment demands');
  let issued=0,skipped=0,review=0;
  for(const file of files){
    const e=JSON.parse(await readFile(new URL('../payment-demand-requests/'+file,import.meta.url),'utf8'));
    if(e.id+'.enc.json'!==file)throw Error('Envelope mismatch');
    const p=validate(decrypt(e,privateKey));
    const id=crypto.createHmac('sha256',privateKey).update(p.source_provider+'\0'+p.source_reference).digest('hex');
    createDemandPayload(p,{transactionId:id});
    const reserved=await claim(id,e.id);
    if(!reserved.claimed){skipped++;continue;}
    let result={status:'UNKNOWN',email_acknowledged:false};
    try{result=await issue(p,id);}catch{} // Never retry an ambiguous HYP response
    const state={status:result.status==='ISSUED'?(result.email_acknowledged?'ISSUED':'ISSUED_CHECK_DELIVERY'):'RECONCILE_WITH_HYP',
      email_acknowledged:result.email_acknowledged,updated_utc:new Date().toISOString()};
    await finish(id,reserved.sha,state);
    if(state.status==='ISSUED')issued++;else review++;
  }
  console.log(JSON.stringify({payment_demands_issued:issued,already_reserved:skipped,needs_review:review}));
  if(review)process.exitCode=1;
}
