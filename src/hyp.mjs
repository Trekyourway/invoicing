import {assertMayIssue,assertProviderEnabled,sanityProviderResult} from './policy.mjs';
export function createDocPayload(p,environment=process.env){
  assertMayIssue(p); assertProviderEnabled(environment);
  if(!environment.HYP_API_KEY||!environment.HYP_API_EMAIL||!environment.HYP_DEVELOPER_EMAIL) throw new Error('HYP credentials missing');
  let types;try{types=JSON.parse(environment.HYP_PAYMENT_CODES_JSON||'{}');}catch{throw new Error('Invalid HYP_PAYMENT_CODES_JSON');}
  const code=types?.[p.payment_method];
  if(!Number.isInteger(code)||code<0)throw new Error('HYP payment method code not sandbox verified');
  const [y,m,d]=p.payment_date.split('-');
  return {
    api_key:environment.HYP_API_KEY,api_email:environment.HYP_API_EMAIL,developer_email:environment.HYP_DEVELOPER_EMAIL,
    type:400,customer_name:p.customer_name,customer_email:p.customer_email,dont_send_email:0,currency:'ILS',
    item:[{details:p.description,amount:1,price:Number(p.amount_ils),vat_type:'NON'}],
    payment:[{payment_type:code,payment_sum:Number(p.amount_ils),date:`${d}/${m}/${y}`,...(code===9?{other_payment_type_name:{bit:'Bit',paybox:'PayBox',bank_transfer:'Bank transfer',other:'Other'}[p.payment_method]}:{})}]
  };
}
export async function issueAtProvider(payment,{environment=process.env,fetchFn=fetch}={}) {
 const body=createDocPayload(payment,environment);
 const base=environment.HYP_ENV==='production'?'https://www.ezcount.co.il':'https://demo.ezcount.co.il';
 const response=await fetchFn(`${base}/api/createDoc`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const out=await response.json();
 const parsed=sanityProviderResult(out,response.status);
 if(parsed.status==='ISSUED')parsed.email_acknowledged=parsed.email_acknowledged.some(x=>typeof x==='string'&&x.trim().toLowerCase()===payment.customer_email.trim().toLowerCase());
 return parsed;
}