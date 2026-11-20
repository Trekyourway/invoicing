import {decryptReceipt,opaquePaymentKey} from './receipt-crypto.mjs';

export function verifiedProviderPayment(p){
  return {...p,status:'VERIFIED',verified_at:new Date().toISOString()};
}

// Claim must persist a one-way fingerprint BEFORE calling HYP. A lost network reply
// must never trigger an automatic second receipt.
export async function executeReceipt(envelope,{privateKey,claim,finish,provider,preflight}) {
  const p=decryptReceipt(envelope,privateKey);
  const verified=verifiedProviderPayment(p);
  await preflight(verified); // check production configuration prior to reservation
  const key=opaquePaymentKey(p,privateKey);
  const reservation=await claim(key,envelope.id);
  if(!reservation.claimed)return {status:'ALREADY_RESERVED'};
  let outcome={status:'ISSUANCE_UNKNOWN'};
  try {
    outcome=await provider(verified);
  } catch {
    // The provider might have issued the document before the connection failed.
    outcome={status:'ISSUANCE_UNKNOWN'};
  }
  const finalState={
    status:outcome.status==='ISSUED'?'ISSUED':'RECONCILE_WITH_HYP',
    email_acknowledged:outcome.status==='ISSUED'&&outcome.email_acknowledged===true,
    updated_utc:new Date().toISOString(),
  };
  // No name, email, amount, document URL or HYP document ID in the PUBLIC repo.
  await finish(key,reservation.sha,finalState);
  return {status:finalState.status,email_acknowledged:finalState.email_acknowledged};
}