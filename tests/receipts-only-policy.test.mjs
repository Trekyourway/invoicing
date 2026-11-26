import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat,readdir} from 'node:fs/promises';
import vm from 'node:vm';
const at=p=>new URL('../'+p,import.meta.url);
const exists=async p=>{try{await stat(at(p));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};

test('active workflows have no HYP invoice/type-300 issuers',async()=>{
  const entries=await readdir(at('.github/workflows'));
  for(const name of ['invoices-production.yml','invoice-reconcile.yml','payment-demand-production.yml'])
    assert.ok(!entries.includes(name),'retired workflow still enabled: '+name);
  for(const file of ['src/invoice.mjs','src/invoice-issue-once.mjs','src/invoice-reconcile.mjs','src/payment-demand-issue-once.mjs'])
    assert.equal(await exists(file),false,'deprecated production script remains '+file);
  const active=await readFile(at('.github/workflows/receipts-production.yml'),'utf8');
  assert.match(active,/receipts-production|Issue confirmed real receipts via HYP/);
  assert.match(active,/src\/receipt-issue-once\.mjs/);
  const receipt=await readFile(at('src/hyp.mjs'),'utf8');
  assert.match(receipt,/type:400/);
  assert.doesNotMatch(receipt,/type:300/);
});

test('standalone payment demand is original YOURWAY-style editable form, not HYP',async()=>{
  const html=await readFile(at('templates/yourway-payment-request.html'),'utf8');
  assert.match(html,/<html lang="he" dir="rtl">/);
  assert.match(html,/דרישת תשלום/);
  assert.match(html,/שיר אורן · עוסק פטור/);
  assert.match(html,/shiroren\.ai\/school/);
  for(const phrase of ['Bit','PayBox','העברה בנקאית','הדפס \/ שמור PDF','קבלה רשמית תופק','const catalog=','const bankIDs=','window.print()'])
    assert.ok(html.includes(phrase),'missing original template feature '+phrase);
  assert.match(html,/YW-001/);
  assert.match(html,/YW-006/);
  assert.match(html,/const total=rows\.reduce/);
  assert.doesNotMatch(html,/fetch\s*\(/);
  assert.doesNotMatch(html,/api\/createDoc/);
  assert.doesNotMatch(html,/mailto:/);
  assert.doesNotMatch(html,/חשבונית מס/);
  const match=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match,'script missing');
  assert.doesNotThrow(()=>new vm.Script(match[1],{filename:'yourway-payment-request-inline.js'}));
});
test('public payment demand has no real customer, email or bank identifiers',async()=>{
  const html=await readFile(at('templates/yourway-payment-request.html'),'utf8');
  for(const secret of ['Nancy@emek-ayalon.co.il','511739633','514772342','0007751585','זוהר כהן','עדי בן דור','קבוצת עמק איילון','דור-רפאל עיצובים']){
    assert.ok(!html.includes(secret),'public template leaked a customer/bank value');
  }
  for(const input of ['company','companyId','client','contact','email','bank','branch','account','owner'])
    assert.ok(new RegExp('id="'+input+'"[^>]*value=""').test(html),'unsafe prefilled input '+input);
});

test('canonical skill only authorizes HYP type 400 after payment and does not count demand as revenue',async()=>{
  const skill=await readFile(at('skills/yourway-receipts/SKILL.md'),'utf8');
  assert.match(skill,/HYP\/EasyCount/);
  assert.match(skill,/type 400/);
  assert.match(skill,/דרישת תשלום/);
  assert.match(skill,/לא|אין/);
  assert.match(skill,/אין לרשום דרישה שטרם שולמה בגיליון ההכנסות/);
  assert.match(skill,/templates\/yourway-payment-request\.html/);
});
