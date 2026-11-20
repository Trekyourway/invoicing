'use strict';
const el=id=>document.getElementById(id);
let secret=sessionStorage.getItem('yourway_session_token')||'';let items=[];
const notice=(text,bad=false)=>{el('message').textContent=text;el('message').className=bad?'err':'ok';};
async function api(path,options={}){
 const r=await fetch(path,{...options,headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json',...(options.headers||{})},credentials:'omit'});
 const data=await r.json();if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);return data;
}
const newRequestId=()=>crypto.randomUUID();
let requestId=sessionStorage.getItem('yourway_receipt_request')||newRequestId();
sessionStorage.setItem('yourway_receipt_request',requestId);
function resetForm(){el('payment').reset();requestId=newRequestId();sessionStorage.setItem('yourway_receipt_request',requestId);}
async function login(){secret=el('token').value||secret;try{const status=await api('/api/status');sessionStorage.setItem('yourway_session_token',secret);el('mode').textContent=`HYP: ${status.mode}; הפקת קבלות: ${status.issuance_enabled?'מופעלת':'כבויה (סביבת בדיקות)'}`;el('start').classList.add('hide');el('app').classList.remove('hide');await refresh();notice('מחובר');}catch(e){notice(e.message,true);}}
async function refresh(){
 const result=await api('/api/payments');items=result.items||[];const box=el('items');box.replaceChildren();
 if(!items.length){box.textContent='אין קבלות עדיין';return;}
 for(const p of items){
  const d=document.createElement('div');d.className='entry';
  const title=document.createElement('strong');title.textContent=`${p.customer_name||'לקוח'} · ${p.amount_ils||'?'} ₪ · ${p.status}`;d.appendChild(title);
  const meta=document.createElement('p');meta.className='small';meta.textContent=`${p.payment_method||''} · ${p.payment_date||'?'} · ${p.customer_email||''}`;d.appendChild(meta);
  if(p.document_id){const info=document.createElement('p');info.className='small';info.textContent=`קבלה: ${p.document_id} · מייל: ${p.email_acknowledged?'אושר ע״י HYP':'נדרש מעקב'} · גיבוי: ${p.archive_status||'ממתין'}`;d.appendChild(info);}
  if(p.status==='ISSUED'&&p.archive_status!=='STORED'){
   const bt=document.createElement('button');bt.textContent='גיבוי PDF בלבד';bt.className='gray';bt.onclick=async()=>{try{const x=await api(`/api/payments/${p.id}/archive`,{method:'POST',body:'{}'});notice(x.status);await refresh();}catch(e){notice(e.message,true);}};d.appendChild(bt);
  }
  box.appendChild(d);
 }
}
el('signin').onclick=login;
el('refresh').onclick=()=>refresh().catch(e=>notice(e.message,true));
el('signout').onclick=()=>{sessionStorage.removeItem('yourway_session_token');secret='';el('app').classList.add('hide');el('start').classList.remove('hide');};
el('reset').onclick=resetForm;
el('payment').onsubmit=async e=>{
 e.preventDefault();
 const form=el('payment');const submit=el('issue-submit');
 const v=Object.fromEntries(new FormData(form));
 const obj={request_id:requestId,payment_confirmed:true,customer_name:v.customer_name,customer_email:v.customer_email,
   description:v.description,amount_ils:Number(v.amount_ils),payment_date:v.payment_date,payment_method:v.payment_method};
 submit.disabled=true;
 try{
  const out=await api('/api/receipts',{method:'POST',body:JSON.stringify(obj)});
  if(out.status==='ISSUED'||out.status==='ALREADY_ISSUED'){
   notice('הקבלה הופקה ב-HYP. נבדקת שליחתה במייל ועותק בדרייב.');resetForm();
  }else notice(`נדרש טיפול: ${out.status}. לא תופק קבלה נוספת אוטומטית.`,true);
  await refresh();
 }catch(err){notice('לא הושלמה הפקה מאומתת: '+err.message+'. אל תנסי שוב עם עסקה חדשה לפני בדיקת הסטטוס.',true);}
 finally{submit.disabled=false;}
};
if(secret)login();