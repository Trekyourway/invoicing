import test from 'node:test';
import assert from 'node:assert/strict';
import {planLedgerUpsert,syncToLedger,accessToken,SYNC_MARKER,LEDGER_ID,LEDGER_TAB} from '../src/ledger-sync.mjs';
const headers=['תאריך הכנסה','הערות','קטגוריה','פרטים נוספים','גורם','קבלה','אמצעי','סכום (₪)','סוג פעולה','הערות קבלה'];
const company='קבוצת עמק איילון ס.ב בע״מ';
const key='a'.repeat(64);
const payment={source_provider:'owner_direct',source_reference:'bank-838979',customer_name:company,
  customer_email:'nancy@example.test',description:'ייעוץ AI – מפגש עם זוהר כהן',payment_date:'2026-11-22',
  amount_ils:400,payment_method:'bank_transfer',owner_confirmed_received:true,owner_authorizes_issue:true};
const original=()=>[
  [...headers],
  ['20/11/2026','עסקי','ליווי / הדרכת AI','הדרכת AI','עדי בן דור',1,'Bit',400,'הכנסה','קבלה הופקה'],
  ['22/11/2026','עסקי','ליווי / הדרכת AI','ייעוץ AI',company,1,'העברה בנקאית',400,'הכנסה','אסמכתא 838979; קבלה הופקה ב-HYP Production'],
  [null,null,null,null,null,null,'סה״כ',800],
  [null,null,null,null,null,null,'Bit',400],
  [null,null,null,null,null,null,'העברה בנקאית',400]
];
const plan=(args={})=>planLedgerUpsert({values:args.values||original(),payment:args.payment||payment,key:args.key||key,sheetId:22,provider:args.provider||{emailAcknowledged:true,documentNumber:'500001'}});
test('matches already-accounted transfer without double booking income',()=>{
  const x=plan();assert.equal(x.kind,'reconciled_existing');
  assert.ok(x.requests.every(r=>!r.insertDimension));
  assert.deepEqual(x.requests.map(r=>r.updateCells.range.startColumnIndex),[5,9]);
  const note=x.requests[1].updateCells.rows[0].values[0].userEnteredValue.stringValue;
  assert.ok(note.includes('HYP_SYNC_ID:')&&note.includes('500001')&&note.includes('838979'));
  assert.ok(!JSON.stringify(x.requests).includes('api_key'));
});
test('repeated reconciliation is idempotent',()=>{
  const first=plan();
  const changed=original();
  changed[2][9]=first.requests[1].updateCells.rows[0].values[0].userEnteredValue.stringValue;
  const next=plan({values:changed});assert.equal(next.kind,'already_synced');assert.deepEqual(next.requests,[]);
});
test('new payment inserts above summary and rewrites all summary formulas',()=>{
  const newPayment={...payment,source_reference:'bank-new',customer_name:'לקוח נוסף',amount_ils:250};
  const x=plan({payment:newPayment});
  assert.equal(x.kind,'inserted');
  assert.equal(x.requests[0].insertDimension.range.startIndex,3);
  const inserted=x.requests[1].updateCells.rows[0].values;
  assert.equal(inserted[4].userEnteredValue.stringValue,'לקוח נוסף');
  assert.equal(inserted[7].userEnteredValue.numberValue,250);
  assert.equal(x.requests[2].updateCells.rows[0].values[0].userEnteredValue.formulaValue,'=SUM(H2:H4)');
  const formulas=x.requests.slice(3).map(r=>r.updateCells.rows[0].values[0].userEnteredValue.formulaValue);
  assert.equal(formulas.length,2);assert.ok(formulas.every(f=>f.includes('$H$2:$H$4')));
});
test('duplicate same-day same-payer transactions must be reviewed, not blindly merged',()=>{
  const rows=original();rows.splice(2,0,[...rows[2]]);
  assert.throws(()=>plan({values:rows}),/ambiguous_duplicate_payment/);
});
test('a different amount for the same opaque marker fails closed',()=>{
  const rows=original();rows[2][9]=SYNC_MARKER+key;rows[2][7]=600;
  assert.throws(()=>plan({values:rows}),/existing_marker_conflict/);
});
test('unissued payments, wrong headers and missing totals cannot synchronize',()=>{
  assert.throws(()=>plan({payment:{...payment,owner_confirmed_received:false}}),/not_confirmed_receipt/);
  const rows=original();rows[0][4]='different';assert.throws(()=>plan({values:rows}),/ledger_schema_mismatch/);
  const noTotals=original().slice(0,3);assert.throws(()=>plan({values:noTotals}),/ledger_totals/);
});
test('source-reference and customer data are literal sheet strings, never formulas',()=>{
  const x=plan({payment:{...payment,source_reference:'=HYPERLINK("bad")',customer_name:'=HYPERLINK("bad")'}});
  assert.equal(x.kind,'inserted');
  assert.equal(x.requests[1].updateCells.rows[0].values[4].userEnteredValue.stringValue,'=HYPERLINK("bad")');
});
test('OAuth refresh token is only used in a server request, not leaked in return',async()=>{
  let seen=0;
  const token=await accessToken({GOOGLE_CLIENT_ID:'fake',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_REFRESH_TOKEN:'refresh'},async(url,options)=>{
    seen++;assert.equal(url,'https://oauth2.googleapis.com/token');
    assert.equal(options.method,'POST');
    assert.ok(String(options.body).includes('refresh_token=refresh'));
    return {ok:true,json:async()=>({access_token:'short-lived-token'})};
  });
  assert.equal(seen,1);assert.equal(token,'short-lived-token');
  assert.equal(await accessToken({},async()=>{throw Error('should not call')}),null);
});
test('API upsert verifies after write and never sends HYP createDoc',async()=>{
  let calls=[],note='';
  const f=async(url,opts)=>{
    calls.push({url,method:opts.method||'GET'});
    if(url.includes('?fields='))return {ok:true,json:async()=>({spreadsheetId:LEDGER_ID,sheets:[{properties:{sheetId:22,title:LEDGER_TAB}}]})};
    if(url.includes('/values/')) {
      const rows=original();
      if(note) rows[2][9]=note;
      return {ok:true,json:async()=>({values:rows})};
    }
    if(url.includes(':batchUpdate')){
      const body=JSON.parse(opts.body);
      note=body.requests[1].updateCells.rows[0].values[0].userEnteredValue.stringValue;
      return {ok:true,json:async()=>({replies:body.requests.map(()=>({}))})};
    }
    throw Error('unexpected request');
  };
  const result=await syncToLedger({payment,key,provider:{emailAcknowledged:true},token:'fake',fetchFn:f});
  assert.equal(result.kind,'reconciled_existing');
  assert.equal(calls.filter(x=>x.method==='POST').length,1);
  assert.ok(calls.every(x=>x.url.startsWith('https://sheets.googleapis.com/')));
});
