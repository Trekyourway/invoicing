import crypto from 'node:crypto';

const METHODS = new Set(['other','bit','paybox','bank_transfer']);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_AMOUNT = 1_000_000;
const clean = (s,limit) => typeof s === 'string' ? s.trim().slice(0,limit) : '';
const b64 = b => Buffer.from(b).toString('base64url');
const deb64 = s => { const data=Buffer.from(s,'base64url'); if(data.toString('base64url')!==s)throw new Error('Non-canonical encrypted field'); return data; };

export function validateReceiptInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid receipt request');
  const p = {
    source_provider: clean(raw.source_provider||'owner_direct',32).toLowerCase(),
    source_reference: clean(raw.source_reference,180),
    customer_name: clean(raw.customer_name,180),
    customer_email: clean(raw.customer_email,254).toLowerCase(),
    description: clean(raw.description,280),
    payment_method: clean(raw.payment_method,24).toLowerCase(),
    payment_date: clean(raw.payment_date,10),
    amount_ils: Number(raw.amount_ils),
    owner_confirmed_received: raw.owner_confirmed_received === true,
    owner_authorizes_issue: raw.owner_authorizes_issue === true,
  };
  if(!p.owner_confirmed_received || !p.owner_authorizes_issue) throw new Error('Owner must explicitly confirm paid and authorize issuing');
  if(!p.customer_name || !EMAIL.test(p.customer_email) || !p.description) throw new Error('Customer name, email and description are required');
  if(!Number.isFinite(p.amount_ils) || p.amount_ils <= 0 || p.amount_ils > MAX_AMOUNT || Math.abs(p.amount_ils*100 - Math.round(p.amount_ils*100)) > 1e-7) throw new Error('Invalid amount');
  p.amount_ils = Number(p.amount_ils.toFixed(2));
  if(!METHODS.has(p.payment_method)) throw new Error('Unsupported payment method');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.payment_date) || !Number.isFinite(Date.parse(p.payment_date+'T00:00:00Z')) || new Date(p.payment_date+'T00:00:00Z').toISOString().slice(0,10) !== p.payment_date) throw new Error('Invalid payment date');
  if(Date.parse(p.payment_date+'T00:00:00Z') > Date.now()+86400000) throw new Error('Future payment is not allowed');
  if(!/^[a-z_]{2,32}$/.test(p.source_provider)) throw new Error('Invalid source provider');
  // When no bank/Bit reference is available, identical receipts share one fingerprint.
  // This deliberately fails closed on possible duplicates and requires explicit reconciliation.
  if(!p.source_reference) {
    const canonical=[p.customer_email,p.amount_ils.toFixed(2),p.payment_date,p.payment_method];
    p.source_reference='owner-fingerprint-'+crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }
  return p;
}

export function encryptReceipt(raw,publicKeyPem,{uuid=crypto.randomUUID()}={}) {
  const p=validateReceiptInput(raw);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid))throw new Error('Invalid request identifier');
  const key=crypto.randomBytes(32),iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(uuid));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(p),'utf8'),cipher.final()]);
  const wrappedKey=crypto.publicEncrypt({key:publicKeyPem,oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},key);
  return {version:1,id:uuid,alg:'RSA-OAEP-256+A256GCM',key:b64(wrappedKey),iv:b64(iv),tag:b64(cipher.getAuthTag()),ciphertext:b64(ciphertext)};
}

export function decryptReceipt(envelope,privateKeyPem) {
  if(!envelope || envelope.version!==1 || envelope.alg!=='RSA-OAEP-256+A256GCM' || typeof envelope.id!=='string' || !/^[0-9a-f-]{36}$/i.test(envelope.id))throw new Error('Unsupported encrypted receipt');
  for(const k of ['key','iv','tag','ciphertext'])if(typeof envelope[k]!=='string'||envelope[k].length>10000)throw new Error('Invalid encrypted envelope');
  const key=crypto.privateDecrypt({key:privateKeyPem,oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},deb64(envelope.key));
  const dec=crypto.createDecipheriv('aes-256-gcm',key,deb64(envelope.iv));
  dec.setAAD(Buffer.from(envelope.id));dec.setAuthTag(deb64(envelope.tag));
  const plain=Buffer.concat([dec.update(deb64(envelope.ciphertext)),dec.final()]).toString('utf8');
  return validateReceiptInput(JSON.parse(plain));
}

export function opaquePaymentKey(payment,privateKeyPem) {
  // Unlike a plain hash, this cannot be reversed by guessing a customer's email/amount.
  return crypto.createHmac('sha256',privateKeyPem).update(`${payment.source_provider}\0${payment.source_reference}`).digest('hex');
}