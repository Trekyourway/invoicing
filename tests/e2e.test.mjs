import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createApp} from '../src/server.mjs';
import {issueReceipt} from '../src/service.mjs';
import {issueAtProvider} from '../src/hyp.mjs';
import {backupPDF} from '../src/drive.mjs';
import {normalizedPayment, assertReadyForVerification} from '../src/policy.mjs';

// Full local wire test: HTTP -> intake -> verification -> reservation -> mocked HYP HTTP
// -> mocked PDF download -> mocked OAuth/Drive upload -> status -> replay protection.
// This is deliberately NOT a live HYP or real-email test.
const env = {
  HYP_ENV:'sandbox', HYP_ENABLE_LIVE:'YES', HYP_ALLOW_PRODUCTION:'NO',
  HYP_API_KEY:'FAKE_DEMO_KEY', HYP_API_EMAIL:'operator@example.test',
  HYP_DEVELOPER_EMAIL:'dev@example.test', HYP_PAYMENT_CODES_JSON:'{"bit":9}',
  GOOGLE_CLIENT_ID:'fake-client', GOOGLE_CLIENT_SECRET:'fake-secret',
  GOOGLE_REFRESH_TOKEN:'fake-refresh', GOOGLE_ARCHIVE_FOLDER_ID:'fake-folder'
};
const request = {
  request_id:'d36c01f1-d9be-486a-b841-55fd6d05a9dd',payment_confirmed:true,
  customer_name:'לקוחה בדיקה',customer_email:'customer@example.test',
  description:'פגישת הדרכה AI',amount_ils:400,payment_date:'2026-11-20',payment_method:'bit'
};

function fakeStore() {
  const payments=new Map(); const keys=new Map(); const attempts=new Map();
  const count={created:0,verified:0,reserved:0,issued:0,archived:0};
  return {
    count,
    async createPayment(raw){
      const p=normalizedPayment(raw);const old=keys.get(p.source_key);
      if(old){const saved=payments.get(old);
        for(const k of ['customer_name','customer_email','description','amount_ils','payment_date','payment_method']){
          if(saved[k]!=null&&p[k]!=null&&String(saved[k])!==String(p[k]))
            return {id:old,status:'SOURCE_CONFLICT_NEEDS_REVIEW'};
        }
        return {id:old,status:saved.status};
      }
      const id=crypto.randomUUID();payments.set(id,{id,...p,status:'NEEDS_DETAILS'});keys.set(p.source_key,id);count.created++;
      return {id,status:'NEEDS_DETAILS'};
    },
    async verifyPayment(id,note){
      const p=payments.get(id);assertReadyForVerification(p);assert.ok(note.length>8);
      if(p.status!=='NEEDS_DETAILS')throw Error('already verified');
      p.status='VERIFIED';p.verified_at=new Date().toISOString();count.verified++;
      return {id,status:'VERIFIED'};
    },
    async getPayment(id){return payments.get(id)||null;},
    async reserveIssuance(id,environment){
      const p=payments.get(id);if(p.status!=='VERIFIED'||attempts.has(id))return {reserved:false,status:p.status};
      attempts.set(id,{status:'ISSUANCE_UNKNOWN',provider_env:environment});p.status='ISSUING';count.reserved++;
      return {reserved:true,payment:{...p,status:'VERIFIED'},attempt:crypto.randomUUID()};
    },
    async finishIssuance(id,result){
      const p=payments.get(id),attempt=attempts.get(id);attempt.status=result.status;
      if(result.status==='ISSUED'){
        p.status='ISSUED';attempt.document_id=result.document_id;attempt.pdf_url=result.pdf_url;
        attempt.email_requested=true;attempt.email_acknowledged=result.email_acknowledged;
        count.issued++;
      }else p.status='ISSUANCE_UNKNOWN';
      return {id,status:p.status,email_requested:result.status==='ISSUED',email_acknowledged:Boolean(result.email_acknowledged)};
    },
    async finishArchive(id,result){
      const a=attempts.get(id);a.archive_status=result.ok?'STORED':'BACKUP_FAILED';a.archive_file_id=result.id||null;
      if(result.ok)count.archived++;
    },
    async listPayments(){return [...payments.values()].map(p=>({...p,...attempts.get(p.id)}));}
  };
}
function mockedProvider(calls,{fail=false}={}){
  return async(url,opts)=>{
    calls.push({url,body:JSON.parse(opts.body)});
    assert.equal(url,'https://demo.ezcount.co.il/api/createDoc');
    assert.equal(opts.method,'POST');
    assert.equal(JSON.parse(opts.body).dont_send_email,0);
    assert.equal(JSON.parse(opts.body).customer_email,request.customer_email);
    if(fail)throw Error('Simulated provider timeout after request may have been processed');
    return {status:200,json:async()=>({success:true,doc_uuid:'DEMO-DOC-101',pdf_link:'https://files.ezcount.co.il/dummy/receipt.pdf',sent_mails:[request.customer_email]})};
  };
}
function mockedDrive(calls,{fail=false}={}){
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF\n');
  return async(url,opts)=>{
    calls.push({url,method:opts?.method||'GET'});
    if(url==='https://files.ezcount.co.il/dummy/receipt.pdf')
      return {ok:true,status:200,headers:new Headers({'content-length':String(pdf.length)}),arrayBuffer:async()=>pdf};
    if(url==='https://oauth2.googleapis.com/token')
      return {ok:true,json:async()=>({access_token:'fake-oauth-token'})};
    if(url.startsWith('https://www.googleapis.com/upload/drive/v3/files')){
      assert.equal(opts.headers.Authorization,'Bearer fake-oauth-token');
      assert.ok(Buffer.from(opts.body).includes(Buffer.from('%PDF-1.4')));
      if(fail)return {ok:false,status:500};
      return {ok:true,json:async()=>({id:'google-drive-test-file',mimeType:'application/pdf'})};
    }
    throw Error('Unexpected network call: '+url);
  };
}
async function start(t,{providerFail=false,driveFail=false}={}){
  const prev={ADMIN_API_TOKEN:process.env.ADMIN_API_TOKEN,HYP_ENV:process.env.HYP_ENV,HYP_ENABLE_LIVE:process.env.HYP_ENABLE_LIVE};
  const token='test-only-32-character-authorization-token';
  Object.assign(process.env,{ADMIN_API_TOKEN:token,HYP_ENV:'sandbox',HYP_ENABLE_LIVE:'YES'});
  const store=fakeStore(),hypCalls=[],driveCalls=[];
  const provider=mockedProvider(hypCalls,{fail:providerFail});
  const archiveFetch=mockedDrive(driveCalls,{fail:driveFail});
  const issuer=(id,options)=>issueReceipt(id,{
    ...options,environment:env,
    provider:(p,{environment})=>issueAtProvider(p,{environment,fetchFn:provider}),
    archive:(pdfUrl,opts)=>backupPDF(pdfUrl,{...opts,fetchFn:archiveFetch})
  });
  const server=createApp({store,issuer});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  t.after(async()=>{await new Promise(ok=>server.close(ok));for(const [k,v] of Object.entries(prev)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
  const url=`http://127.0.0.1:${server.address().port}`;
  const post=async(data=request)=>{
    const res=await fetch(url+'/api/receipts',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(data)});
    return {status:res.status,json:await res.json()};
  };
  return {url,post,token,store,hypCalls,driveCalls};
}

test('E2E HTTP -> HYP demo mocked response -> client mail acknowledgement -> Drive PDF -> idempotency',async t=>{
  const x=await start(t);
  const first=await x.post();
  assert.equal(first.status,200);assert.equal(first.json.status,'ISSUED');
  assert.equal(first.json.archive_status,'STORED');assert.equal(first.json.email_requested,true);
  assert.equal(first.json.email_acknowledged,true);
  const again=await x.post();assert.equal(again.status,200);assert.equal(again.json.status,'ALREADY_ISSUED');
  assert.equal(x.hypCalls.length,1);assert.equal(x.hypCalls[0].body.type,400);
  assert.equal(x.driveCalls.length,3);assert.equal(x.store.count.issued,1);assert.equal(x.store.count.archived,1);
  const list=await fetch(x.url+'/api/payments',{headers:{Authorization:`Bearer ${x.token}`}});
  const items=(await list.json()).items;
  assert.equal(items.length,1);assert.equal(items[0].document_id,'DEMO-DOC-101');
  assert.equal(items[0].archive_file_id,'google-drive-test-file');
});

test('E2E apparent provider timeout -> unknown status; re-submission never calls HYP again',async t=>{
  const x=await start(t,{providerFail:true});
  const first=await x.post();assert.equal(first.status,202);assert.equal(first.json.status,'ISSUANCE_UNKNOWN');
  const second=await x.post();assert.equal(second.status,409);
  assert.equal(second.json.status,'RECONCILE_WITH_HYP_BEFORE_RETRY');
  assert.equal(x.hypCalls.length,1);assert.equal(x.driveCalls.length,0);
});

test('E2E archived PDF failure never causes a second receipt',async t=>{
  const x=await start(t,{driveFail:true});
  const first=await x.post();assert.equal(first.status,200);assert.equal(first.json.status,'ISSUED');
  assert.equal(first.json.archive_status,'BACKUP_FAILED');
  const again=await x.post();assert.equal(again.json.status,'ALREADY_ISSUED');
  assert.equal(x.hypCalls.length,1);assert.equal(x.store.count.issued,1);
});