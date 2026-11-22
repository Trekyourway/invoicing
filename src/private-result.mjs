import crypto from 'node:crypto';

function safeDocumentResult(result){
  const docId=String(result?.document_id??'').trim();
  const docNumber=String(result?.document_number??'').trim();
  const pdf=String(result?.pdf_url??'').trim();
  const out={};
  if(/^[\w-]{1,100}$/.test(docId))out.documentId=docId;
  if(/^[\w-]{1,60}$/.test(docNumber))out.documentNumber=docNumber;
  if(pdf){
    try{
      const url=new URL(pdf);
      if(url.protocol==='https:'&&(url.hostname==='ezcount.co.il'||url.hostname.endsWith('.ezcount.co.il')))out.pdfUrl=url.href;
    }catch{}
  }
  return out;
}
export function encryptPrivateResult(result,privateKeyPem,{id=crypto.randomUUID()}={}){
  if(!/^[0-9a-f-]{36}$/.test(id))throw Error('invalid_result_id');
  const plain=safeDocumentResult(result);
  if(!Object.keys(plain).length)return null;
  const key=crypto.randomBytes(32),iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(id));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(plain),'utf8'),cipher.final()]);
  const publicKey=crypto.createPublicKey(privateKeyPem);
  const wrapped=crypto.publicEncrypt({key:publicKey,oaepHash:'sha256'},key);
  return {version:1,id,alg:'RSA-OAEP-256+A256GCM',key:wrapped.toString('base64url'),
    iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),
    ciphertext:ciphertext.toString('base64url')};
}
export function decryptPrivateResult(envelope,privateKeyPem){
  if(!envelope)return {};
  if(envelope.version!==1||envelope.alg!=='RSA-OAEP-256+A256GCM'||!/^[0-9a-f-]{36}$/.test(envelope.id||''))throw Error('invalid_encrypted_result');
  for(const k of ['key','iv','tag','ciphertext'])if(typeof envelope[k]!=='string'||envelope[k].length>10000)throw Error('invalid_encrypted_result');
  const key=crypto.privateDecrypt({key:privateKeyPem,oaepHash:'sha256'},Buffer.from(envelope.key,'base64url'));
  const dec=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64url'));
  dec.setAAD(Buffer.from(envelope.id));
  dec.setAuthTag(Buffer.from(envelope.tag,'base64url'));
  const plain=JSON.parse(Buffer.concat([dec.update(Buffer.from(envelope.ciphertext,'base64url')),dec.final()]).toString('utf8'));
  if(!plain||typeof plain!=='object')throw Error('invalid_private_result');
  return safeDocumentResult({document_id:plain.documentId,document_number:plain.documentNumber,pdf_url:plain.pdfUrl});
}
