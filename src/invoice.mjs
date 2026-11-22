import {sanityProviderResult,assertProviderEnabled} from './policy.mjs';
import {validateReceiptInput} from './receipt-crypto.mjs';

// A transaction invoice is a non-tax proforma. NEVER use type 305/320 for an exempt dealer.
// No payment array: these transactions were receipted previously.
export function createTransactionInvoicePayload(input, {environment=process.env, transactionId}={}) {
  const p=validateReceiptInput(input);
  assertProviderEnabled(environment);
  if(environment.HYP_ENV!=='production') throw new Error('Production only');
  if(!environment.HYP_API_KEY || !environment.HYP_API_EMAIL || !environment.HYP_DEVELOPER_EMAIL)throw new Error('HYP credentials missing');
  if(!p.owner_confirmed_received || !p.owner_authorizes_issue)throw new Error('Owner approval required');
  if(typeof transactionId!=='string' || !/^[a-f0-9]{64}$/.test(transactionId))throw new Error('Stable opaque transaction id required');
  const hypTransactionId='inv-'+transactionId.slice(0,40); // 44 characters; HYP max is 45
  return {
    api_key:environment.HYP_API_KEY, api_email:environment.HYP_API_EMAIL,
    developer_email:environment.HYP_DEVELOPER_EMAIL,
    type:300, transaction_id:hypTransactionId,
    customer_name:p.customer_name, customer_email:p.customer_email,
    dont_send_email:0, currency:'ILS',
    item:[{details:p.description,amount:1,price:p.amount_ils,vat_type:'NON'}],
    comment:'שולם במלואו',
    email_text:'מצורפת חשבונית עסקה עבור שירותים ששולמו במלואם.',
  };
}
export async function issueTransactionInvoice(input,{environment=process.env, transactionId,fetchFn=fetch}={}) {
  const body=createTransactionInvoicePayload(input,{environment,transactionId});
  const response=await fetchFn('https://www.ezcount.co.il/api/createDoc',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body), signal:AbortSignal.timeout(35000)
  });
  const parsed=sanityProviderResult(await response.json(),response.status);
  if(parsed.status==='ISSUED')parsed.email_acknowledged=parsed.email_acknowledged.some(
    x=>typeof x==='string' && x.trim().toLowerCase()===input.customer_email.trim().toLowerCase()
  );
  return parsed;
}
