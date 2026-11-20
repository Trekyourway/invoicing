import crypto from 'node:crypto';
const clean=(s)=>String(s||'').replace(/[^a-zA-Z0-9_\-]/g,'_').slice(0,80);
async function getToken(env=process.env,fetchFn=fetch){
 if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.GOOGLE_REFRESH_TOKEN)throw new Error('Drive OAuth not configured');
 const b=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:env.GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'});
 const res=await fetchFn('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b,signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw new Error('Google OAuth refresh failed');
 const data=await res.json();if(!data.access_token)throw new Error('Google token missing');return data.access_token;
}
function assertHYPpdfURL(s){
 let u;try{u=new URL(s);}catch{throw new Error('Missing PDF URL');}
 if(u.protocol!=='https:'||!/(^|\.)(ezcount\.co\.il|hyp\.co\.il)$/.test(u.hostname)||u.username||u.password||u.port)throw new Error('PDF URL not recognized as HYP');
 return u.href;
}
export function allowedProviderPdfUrl(s){return assertHYPpdfURL(s);}
export async function backupPDF(pdfURL,{payment,documentId,environment=process.env,fetchFn=fetch}={}){
 const env=environment;
 if(!env.GOOGLE_ARCHIVE_FOLDER_ID||!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.GOOGLE_REFRESH_TOKEN)return {ok:false,reason:'Drive not configured'};
 if(!pdfURL)return {ok:false,reason:'PDF URL missing'};
 const safeURL=assertHYPpdfURL(pdfURL);
 const response=await fetchFn(safeURL,{redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(!response.ok||response.status>=300)throw new Error('PDF download failed or redirected');
 const contentLength=Number(response.headers.get('content-length')||'0');if(contentLength>12*1024*1024)throw new Error('PDF too large');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length<20||bytes.length>12*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('Invalid PDF bytes');
 const checksum=crypto.createHash('sha256').update(bytes).digest('hex');
 const filename=`${clean(payment.payment_date)}_receipt_${clean(documentId||payment.id)}.pdf`;
 const metadata={name:filename,mimeType:'application/pdf',parents:[env.GOOGLE_ARCHIVE_FOLDER_ID],description:`YOURWAY/HYP ${clean(documentId||'')}`};
 const boundary=`yw_${crypto.randomBytes(12).toString('hex')}`;
 const head=Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
 const tail=Buffer.from(`\r\n--${boundary}--\r\n`);
 const payload=Buffer.concat([head,bytes,tail]);
 const token=await getToken(env,fetchFn);
 const upload=await fetchFn('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':`multipart/related; boundary=${boundary}`},body:payload,signal:AbortSignal.timeout(20000)});
 if(!upload.ok)throw new Error('Google Drive upload failed');
 const body=await upload.json();if(!body.id||body.mimeType!=='application/pdf')throw new Error('Drive upload not acknowledged');
 return {ok:true,id:body.id,sha256:checksum};
}
export async function listInbox({environment=process.env,fetchFn=fetch}={}){
 const env=environment;if(!env.GOOGLE_INBOX_FOLDER_ID)return [];
 const token=await getToken(env,fetchFn),files=[];let nextPageToken='';
 for(let pages=0;pages<10;pages++){
  const qs=new URLSearchParams({q:`'${env.GOOGLE_INBOX_FOLDER_ID.replaceAll("'",'')}' in parents and trashed = false`,fields:'nextPageToken,files(id,name,mimeType,size,createdTime)',pageSize:'100'});
  if(nextPageToken)qs.set('pageToken',nextPageToken);
  const r=await fetchFn(`https://www.googleapis.com/drive/v3/files?${qs}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('Drive inbox listing failed');
  const out=await r.json();files.push(...(out.files||[]));nextPageToken=out.nextPageToken||'';if(!nextPageToken)break;
 }
 return files.filter(f=>['image/png','image/jpeg','application/pdf'].includes(f.mimeType)&&Number(f.size||0)<6*1024*1024);
}
export async function getInboxBytes(fileId,{environment=process.env,fetchFn=fetch}={}){
 if(!/^[\w-]{5,200}$/.test(fileId))throw new Error('Invalid Drive ID');
 const token=await getToken(environment,fetchFn);
 const r=await fetchFn(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('Inbox read failed');const b=Buffer.from(await r.arrayBuffer());if(b.length>6*1024*1024)throw new Error('Evidence too large');return b;
}