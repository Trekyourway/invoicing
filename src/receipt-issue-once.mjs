import {readFile,readdir} from 'node:fs/promises';
import {executeReceipt} from './receipt-executor.mjs';
import {createGitHubState} from './gh-receipt-state.mjs';
import {createDocPayload,issueAtProvider} from './hyp.mjs';
import {accessToken,syncToLedger} from './ledger-sync.mjs';

const env=process.env;
if(env.HYP_ENV!=='production'||env.HYP_ENABLE_LIVE!=='YES'||env.HYP_ALLOW_PRODUCTION!=='YES')throw new Error('Production explicitly disabled');
const required=['HYP_API_KEY','HYP_API_EMAIL','HYP_DEVELOPER_EMAIL','RECEIPT_PRIVATE_KEY_B64','GITHUB_TOKEN','GITHUB_REPOSITORY'];
for(const name of required)if(!env[name])throw new Error(`Missing required configuration: ${name}`);
if(env.GITHUB_REPOSITORY!=='Trekyourway/invoicing'||env.GITHUB_REF!=='refs/heads/main')throw new Error('This workflow only runs on trusted main');
const privateKey=Buffer.from(env.RECEIPT_PRIVATE_KEY_B64,'base64').toString('utf8');
if(!privateKey.includes('BEGIN PRIVATE KEY'))throw new Error('Receipt decrypt key invalid');
const {claim,finish}=createGitHubState({repo:env.GITHUB_REPOSITORY,token:env.GITHUB_TOKEN});
const reqDir=new URL('../requests/',import.meta.url);
let files=[];try{files=(await readdir(reqDir)).filter(x=>/^[0-9a-f-]{36}\.enc\.json$/.test(x)).sort();}catch(e){if(e.code!=='ENOENT')throw e;}
if(files.length>25)throw new Error('Too many pending requests; split batch');
let issued=0,review=0,skipped=0,ledgerPending=0,ledgerUnconfigured=0,ledgerUpdated=0;
for(const file of files) {
  const raw=await readFile(new URL(`../requests/${file}`,import.meta.url),'utf8');
  let req;try{req=JSON.parse(raw);}catch{throw new Error('Invalid encrypted request file');}
  if(req.id+'.enc.json'!==file)throw new Error('Request filename mismatch');
  // Important: this is the only path to HYP PRODUCTION. Every entry contains
  // owner's encrypted explicit confirmation and issue authorization.
  const outcome=await executeReceipt(req,{privateKey,claim,finish,
    preflight:async p=>createDocPayload(p,env),
    provider:async p=>issueAtProvider(p,{environment:env}),
    onIssued:async({payment,key,provider})=>{
      if(!payment.payment_date.startsWith('2026-'))return {kind:'other_year_not_synced'};
      const token=await accessToken(env);
      if(!token)return {kind:'not_configured'};
      return syncToLedger({payment,key,provider:{
        documentNumber:provider.document_number,
        pdfUrl:provider.pdf_url,
        emailAcknowledged:provider.email_acknowledged
      },token});
    },
  });
  if(outcome.status==='ISSUED'){
    issued++;
    if(['inserted','reconciled_existing','enriched','already_synced'].includes(outcome.ledger_status))ledgerUpdated++;
    else if(outcome.ledger_status==='not_configured')ledgerUnconfigured++;
    else ledgerPending++;
  }else if(outcome.status==='ALREADY_RESERVED')skipped++;
  else review++;
}
console.log(JSON.stringify({status:'completed',issued,needs_review:review,already_reserved:skipped,ledger_synced:ledgerUpdated,ledger_not_configured:ledgerUnconfigured,ledger_pending:ledgerPending}));
if(review||ledgerPending)process.exitCode=1;