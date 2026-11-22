import crypto from 'node:crypto';

export const LEDGER_ID='1b6aXwgN1RWVUXTiEU6AcENkXFM_xDDrL3QkyHLw9204';
export const LEDGER_TAB='הכנסות והוצאות BIT/PAYBOX 2026';
export const SYNC_MARKER='HYP_SYNC_ID:';
const HEADERS=['תאריך הכנסה','הערות','קטגוריה','פרטים נוספים','גורם','קבלה','אמצעי','סכום (₪)','סוג פעולה','הערות קבלה'];
const METHODS={bit:'Bit',paybox:'PayBox',bank_transfer:'העברה בנקאית',other:'אחר'};
const cell=value=>({userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:String(value)}});
const formula=value=>({userEnteredValue:{formulaValue:value}});
const grid=(sheetId,row,column)=>({sheetId,startRowIndex:row,endRowIndex:row+1,startColumnIndex:column,endColumnIndex:column+1});
const ddmmyyyy=iso=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||''))throw Error('invalid_payment_date');return iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);};
const norm=v=>String(v??'').trim();
const amount=v=>typeof v==='number'?v:Number(norm(v).replace(/[₪,\s]/g,''));

function noteFor(p,key,{documentNumber,pdfUrl,emailAcknowledged}={}){
  const parts=[SYNC_MARKER+key,'אסמכתת מקור: '+p.source_reference,'קבלה הופקה ב-HYP Production'];
  if(documentNumber && /^[\w-]{1,60}$/.test(String(documentNumber)))parts.push('מספר קבלה: '+String(documentNumber));
  if(pdfUrl){
    try{const url=new URL(pdfUrl);if(url.protocol==='https:' && (url.hostname==='ezcount.co.il'||url.hostname.endsWith('.ezcount.co.il')))parts.push('PDF: '+url.href);}catch{}
  }
  parts.push(emailAcknowledged===true?'HYP אישרה בקשת שליחה ללקוח':'סטטוס הגעת מייל דורש בדיקה');
  return parts.join(' | ');
}
function normalizeInputs(p,key){
  if(!p||!p.owner_confirmed_received||!p.owner_authorizes_issue||!METHODS[p.payment_method])throw Error('not_confirmed_receipt');
  if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw Error('invalid_sync_key');
  if(!p.customer_name||!p.source_reference||!p.description||!Number.isFinite(p.amount_ils)||p.amount_ils<=0)throw Error('invalid_receipt');
  return {date:ddmmyyyy(p.payment_date),method:METHODS[p.payment_method],name:norm(p.customer_name),amount:p.amount_ils};
}
const noteContains=(row,token)=>norm(row?.[9]).includes(token);
const rowMatches=(row,v)=>norm(row[0])===v.date&&norm(row[4])===v.name&&norm(row[6])===v.method&&amount(row[7])===v.amount;
// Only update F and J: never change the recorded amount, payer, bank method, or formula-backed summary.
function updateExisting(sheetId,index,oldNote,newNote){
  return [
    {updateCells:{range:grid(sheetId,index,5),rows:[{values:[cell(1)]}],fields:'userEnteredValue'}},
    {updateCells:{range:grid(sheetId,index,9),rows:[{values:[cell(oldNote?oldNote+' | '+newNote:newNote)]}],fields:'userEnteredValue'}}
  ];
}
export function planLedgerUpsert({values,payment,key,sheetId,provider={}}){
  const v=normalizeInputs(payment,key);
  if(!Number.isInteger(sheetId)||sheetId<0)throw Error('invalid_sheet_id');
  if(!Array.isArray(values)||!HEADERS.every((h,i)=>norm(values[0]?.[i])===h))throw Error('ledger_schema_mismatch');
  const summaries=values.map((r,i)=>norm(r?.[6])==='סה״כ'?i:-1).filter(i=>i>=0);
  if(summaries.length!==1||summaries[0]<2)throw Error('ledger_totals_missing_or_ambiguous');
  const summary=summaries[0];
  const rows=values.slice(1,summary);
  const token=SYNC_MARKER+key;
  const marked=rows.map((row,i)=>noteContains(row,token)?i+1:-1).filter(i=>i>=0);
  if(marked.length>1)throw Error('duplicate_sync_marker');
  const makeNote=()=>noteFor(payment,key,provider);
  if(marked.length===1){
    const index=marked[0];
    if(!rowMatches(values[index],v))throw Error('existing_marker_conflict');
    const note=norm(values[index][9]);
    const enriched=makeNote();
    const append=enriched.split(' | ').filter(s=>!note.includes(s)).join(' | ');
    return {kind:append?'enriched':'already_synced',requests:append?updateExisting(sheetId,index,note,append):[]};
  }
  const candidates=rows.map((row,i)=>rowMatches(row,v)?i+1:-1).filter(i=>i>=0);
  if(candidates.length>1)throw Error('ambiguous_duplicate_payment');
  if(candidates.length===1){
    const index=candidates[0],row=values[index];
    if(norm(row[5])!=='1'||!norm(row[9]).includes('קבלה'))throw Error('unverified_existing_income');
    return {kind:'reconciled_existing',requests:updateExisting(sheetId,index,norm(row[9]),makeNote())};
  }
  if(values.slice(summary+1).some((r,i)=>norm(r?.[6])==='סה״כ'))throw Error('multiple_totals');
  const summaryMethods=[];
  for(let i=summary+1;i<values.length&&norm(values[i]?.[6]);i++){
    const label=norm(values[i][6]);
    if(label==='סה״כ'||summaryMethods.some(x=>x.label===label))throw Error('invalid_method_summary');
    summaryMethods.push({label,rowIndex:i});
  }
  const dataLastRow=summary+1; // 1-based, inserted row before the old totals
  const note=makeNote();
  const incoming=[v.date,'עסקי','ליווי / הדרכת AI',norm(payment.description),v.name,1,v.method,v.amount,'הכנסה',note];
  const requests=[
    {insertDimension:{range:{sheetId,dimension:'ROWS',startIndex:summary,endIndex:summary+1},inheritFromBefore:true}},
    {updateCells:{range:{sheetId,startRowIndex:summary,endRowIndex:summary+1,startColumnIndex:0,endColumnIndex:10},rows:[{values:incoming.map(cell)}],fields:'userEnteredValue'}},
    {updateCells:{range:grid(sheetId,summary+1,7),rows:[{values:[formula('=SUM(H2:H'+dataLastRow+')')]}],fields:'userEnteredValue'}}
  ];
  for(const s of summaryMethods){
    const range='$G$2:$G$'+dataLastRow,amountRange='$H$2:$H$'+dataLastRow;
    const safe=s.label.replace(/"/g,'""');
    requests.push({updateCells:{range:grid(sheetId,s.rowIndex+1,7),rows:[{values:[formula('=SUMIF('+range+',"'+safe+'",'+amountRange+')')]}],fields:'userEnteredValue'}});
  }
  if(!summaryMethods.some(s=>s.label===v.method)){
    const idx=summary+summaryMethods.length+2;
    if(values[idx-1]?.some(x=>norm(x)))throw Error('cannot_add_method_summary');
    requests.push({updateCells:{range:{sheetId,startRowIndex:idx,endRowIndex:idx+1,startColumnIndex:6,endColumnIndex:8},rows:[{values:[cell(v.method),formula('=SUMIF($G$2:$G$'+dataLastRow+',"'+v.method+'",$H$2:$H$'+dataLastRow+')')]}],fields:'userEnteredValue'}});
  }
  return {kind:'inserted',requests};
}

async function jsonRequest(fetchFn,url,init){
  let response;
  try{response=await fetchFn(url,{...init,signal:AbortSignal.timeout(18000)});}catch{throw Error('remote_request_failed');}
  if(!response.ok)throw Error('remote_http_'+response.status); // Never log provider response; it may include PII.
  try{return await response.json();}catch{throw Error('invalid_remote_response');}
}
export async function accessToken(env=process.env,fetchFn=fetch){
  if(env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_B64){
    let service;
    try{service=JSON.parse(Buffer.from(env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_B64,'base64').toString('utf8'));}catch{throw Error('bad_service_account_configuration');}
    if(!service?.client_email||!service?.private_key)throw Error('bad_service_account_configuration');
    const now=Math.floor(Date.now()/1000);
    const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
    const input=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:service.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3300});
    const assertion=input+'.'+crypto.sign('RSA-SHA256',Buffer.from(input),service.private_key).toString('base64url');
    const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion});
    const result=await jsonRequest(fetchFn,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
    if(!result.access_token)throw Error('missing_google_token');
    return result.access_token;
  }
  if(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.GOOGLE_REFRESH_TOKEN){
    const body=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:env.GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'});
    const result=await jsonRequest(fetchFn,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
    if(!result.access_token)throw Error('missing_google_token');
    return result.access_token;
  }
  return null;
}
export async function syncToLedger({payment,key,provider={},token,fetchFn=fetch}){
  if(!token)return {kind:'not_configured'};
  const base='https://sheets.googleapis.com/v4/spreadsheets/'+LEDGER_ID;
  const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const meta=await jsonRequest(fetchFn,base+'?fields=spreadsheetId,sheets(properties(sheetId,title))',{headers});
  if(meta.spreadsheetId!==LEDGER_ID)throw Error('wrong_spreadsheet');
  const target=meta.sheets?.filter(s=>s.properties?.title===LEDGER_TAB);
  if(target?.length!==1)throw Error('ledger_tab_not_found');
  const range=encodeURIComponent("'"+LEDGER_TAB+"'!A1:J1000");
  const data=await jsonRequest(fetchFn,base+'/values/'+range+'?valueRenderOption=UNFORMATTED_VALUE',{headers});
  const plan=planLedgerUpsert({values:data.values,payment,key,sheetId:target[0].properties.sheetId,provider});
  if(plan.requests.length){
    await jsonRequest(fetchFn,base+':batchUpdate',{method:'POST',headers,body:JSON.stringify({requests:plan.requests})});
    // Re-read and verify idempotency. Never retry a failed/ambiguous write blindly.
    const verify=await jsonRequest(fetchFn,base+'/values/'+range+'?valueRenderOption=UNFORMATTED_VALUE',{headers});
    const check=planLedgerUpsert({values:verify.values,payment,key,sheetId:target[0].properties.sheetId,provider});
    if(check.kind!=='already_synced')throw Error('ledger_write_unverified');
  }
  return {kind:plan.kind};
}
