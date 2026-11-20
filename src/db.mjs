import crypto from 'node:crypto';
import {normalizedPayment, assertReadyForVerification} from './policy.mjs';
let pool;
function config(multipleStatements=false){
 for(const k of ['DB_NAME','DB_USER','DB_PASSWORD'])if(!process.env[k])throw new Error(`Missing ${k}`);
 return {host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,waitForConnections:true,connectionLimit:5,decimalNumbers:false,dateStrings:true,multipleStatements};
}
export async function connectForMigration(){const mysql=await import('mysql2/promise');return mysql.createConnection(config(true));}
async function getPool(){if(!pool){const mysql=await import('mysql2/promise');pool=mysql.createPool(config());}return pool;}
const uuid=()=>crypto.randomUUID();
export async function createPayment(raw){
 const p=normalizedPayment(raw);const db=await getPool();const id=uuid();
 await db.execute(`INSERT INTO payments(id,source_provider,source_reference,source_key,customer_name,customer_email,description,amount_ils,payment_date,payment_method,evidence_file_id,status)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,'NEEDS_DETAILS') ON DUPLICATE KEY UPDATE id=id`,
 [id,p.source_provider,p.source_reference,p.source_key,p.customer_name||null,p.customer_email||null,p.description||null,p.amount_ils,p.payment_date,p.payment_method,p.evidence_file_id||null]);
 const [rows]=await db.execute('SELECT * FROM payments WHERE source_key=?',[p.source_key]);
 const found=rows[0];
 if(found.id!==id && p.amount_ils!==null && found.amount_ils!==null && Number(found.amount_ils)!==p.amount_ils) return {id:found.id,status:'SOURCE_CONFLICT_NEEDS_REVIEW',created:false};
 if(found.id===id){await db.execute('INSERT INTO audit_events(payment_id,action,actor) VALUES (?,?,?)',[id,'CREATED','system']);}
 return {id:found.id,status:found.status,created:found.id===id};
}
export async function listPayments(){const db=await getPool();const [rows]=await db.execute(`SELECT p.*,r.status AS receipt_status,r.document_id,r.pdf_url,r.email_requested,r.email_acknowledged,r.archive_status,r.archive_file_id FROM payments p LEFT JOIN receipt_attempts r ON p.id=r.payment_id ORDER BY p.created_at DESC LIMIT 100`);return rows;}
export async function getPayment(id){const db=await getPool();const [rows]=await db.execute('SELECT * FROM payments WHERE id=?',[id]);return rows[0]||null;}
export async function updatePayment(id,changes){
 const db=await getPool(),cx=await db.getConnection();
 try{await cx.beginTransaction();const [[p]]=await cx.query('SELECT * FROM payments WHERE id=? FOR UPDATE',[id]);if(!p)throw new Error('Payment not found');if(p.status!=='NEEDS_DETAILS'&&p.status!=='PENDING_VERIFICATION')throw new Error('Cannot change verified/issued payment');
 const full=normalizedPayment({...p,...changes,source_provider:p.source_provider,source_reference:p.source_reference});
 await cx.execute(`UPDATE payments SET customer_name=?,customer_email=?,description=?,amount_ils=?,payment_date=?,payment_method=?,status='PENDING_VERIFICATION' WHERE id=?`,[full.customer_name||null,full.customer_email||null,full.description||null,full.amount_ils,full.payment_date,full.payment_method,id]);
 await cx.execute('INSERT INTO audit_events(payment_id,action,actor) VALUES (?,?,?)',[id,'UPDATED','admin']);await cx.commit();return {id,status:'PENDING_VERIFICATION'};
 }catch(e){await cx.rollback();throw e;}finally{cx.release();}
}
export async function verifyPayment(id,note){
 const n=typeof note==='string'?note.trim().slice(0,250):'';
 if(n.length<8)throw new Error('Verification note must document confirmed receipt of funds');
 const db=await getPool(),cx=await db.getConnection();
 try{await cx.beginTransaction();const [[p]]=await cx.query('SELECT * FROM payments WHERE id=? FOR UPDATE',[id]);if(!p)throw new Error('Payment not found');if(!['NEEDS_DETAILS','PENDING_VERIFICATION'].includes(p.status))throw new Error('Payment is already verified or processed');assertReadyForVerification(p);
 const [dups]=await cx.execute(`SELECT id FROM payments WHERE id<>? AND customer_email=? AND amount_ils=? AND payment_date=? AND payment_method=? AND status IN ('VERIFIED','ISSUING','ISSUED','ISSUANCE_UNKNOWN') LIMIT 1`,[id,p.customer_email,p.amount_ils,p.payment_date,p.payment_method]);
 if(dups.length){await cx.execute(`UPDATE payments SET status='DUPLICATE_SUSPECT' WHERE id=?`,[id]);await cx.execute('INSERT INTO audit_events(payment_id,action,actor) VALUES (?, ?, ?)',[id,'DUPLICATE_SUSPECT','system']);await cx.commit();return {id,status:'DUPLICATE_SUSPECT',conflicting_payment_id:dups[0].id};}
 await cx.execute(`UPDATE payments SET status='VERIFIED',verified_at=NOW(3),verified_note=? WHERE id=?`,[n,id]);await cx.execute('INSERT INTO audit_events(payment_id,action,actor) VALUES (?, ?, ?)',[id,'VERIFIED_FUNDS_RECEIVED','admin']);await cx.commit();return {id,status:'VERIFIED'};
 }catch(e){await cx.rollback();throw e;}finally{cx.release();}
}
export async function reserveIssuance(id,env){
 const db=await getPool(),cx=await db.getConnection();
 try{await cx.beginTransaction();const [[payment]]=await cx.query('SELECT * FROM payments WHERE id=? FOR UPDATE',[id]);if(!payment)throw new Error('Payment not found');if(payment.status!=='VERIFIED'){await cx.rollback();return {reserved:false,status:payment.status};}
 const [[prior]]=await cx.query('SELECT status FROM receipt_attempts WHERE payment_id=?',[id]);if(prior){await cx.rollback();return {reserved:false,status:prior.status};}
 const attempt=uuid();
 await cx.execute(`INSERT INTO receipt_attempts(payment_id,attempt_id,provider_env,status) VALUES(?,?,?,'ISSUANCE_UNKNOWN')`,[id,attempt,env]);
 await cx.execute(`UPDATE payments SET status='ISSUING' WHERE id=?`,[id]);
 await cx.execute('INSERT INTO audit_events(payment_id,action,actor) VALUES (?, ?, ?)',[id,'ISSUANCE_RESERVED','system']);await cx.commit();return {reserved:true,payment:{...payment,status:'VERIFIED'},attempt};
 }catch(e){await cx.rollback();throw e;}finally{cx.release();}
}
export async function finishIssuance(id,result){
 const db=await getPool();const issued=result?.status==='ISSUED';const status=issued?'ISSUED':'ISSUANCE_UNKNOWN';
 await db.execute(`UPDATE receipt_attempts SET status=?,document_id=?,pdf_url=?,email_requested=?,email_acknowledged=?,last_error=?,finished_at=NOW(3) WHERE payment_id=?`,[
 status,issued?result.document_id||null:null,issued?result.pdf_url||null:null,issued?1:0,issued&&result.email_acknowledged?1:0,issued?null:String(result?.reason||'network_unknown').slice(0,150),id]);
 await db.execute('UPDATE payments SET status=? WHERE id=?',[status,id]);
 await db.execute('INSERT INTO audit_events(payment_id,action,actor) VALUES (?, ?, ?)',[id,status,'system']);
 return {id,status,email_requested:issued,email_acknowledged:issued&&Boolean(result.email_acknowledged)};
}
export async function pendingArchive(id){const db=await getPool();const [rows]=await db.execute('SELECT * FROM receipt_attempts WHERE payment_id=?',[id]);return rows[0]||null;}
export async function finishArchive(id,result){const db=await getPool();await db.execute('UPDATE receipt_attempts SET archive_status=?,archive_file_id=?,archive_checksum=? WHERE payment_id=?',[result.ok?'STORED':'BACKUP_FAILED',result.id||null,result.sha256||null,id]);await db.execute('INSERT INTO audit_events(payment_id,action,actor) VALUES (?,?,?)',[id,result.ok?'BACKUP_STORED':'BACKUP_FAILED','system']);return {ok:result.ok};}
export async function markEvidence(fileId,paymentId){const db=await getPool();await db.execute('INSERT INTO evidence_files(drive_file_id,payment_id) VALUES(?,?) ON DUPLICATE KEY UPDATE payment_id=payment_id',[fileId,paymentId]);}
export async function hasEvidence(fileId){const db=await getPool();const [rows]=await db.execute('SELECT drive_file_id FROM evidence_files WHERE drive_file_id=?',[fileId]);return rows.length>0;}

export async function ignorePayment(id,reason){
 const note=String(reason||'').trim().slice(0,100);
 if(note.length<5)throw new Error('Ignore reason required');
 const db=await getPool(),cx=await db.getConnection();
 try {await cx.beginTransaction();const [[p]]=await cx.query('SELECT status FROM payments WHERE id=? FOR UPDATE',[id]);
 if(!p)throw new Error('Payment not found');if(!['NEEDS_DETAILS','PENDING_VERIFICATION','DUPLICATE_SUSPECT'].includes(p.status))throw new Error('Cannot ignore verified or issued payment');
 await cx.execute(`UPDATE payments SET status='IGNORED_PRIVATE' WHERE id=?`,[id]);
 await cx.execute('INSERT INTO audit_events(payment_id,action,actor) VALUES (?,?,?)',[id,'IGNORED_PRIVATE','admin']);
 await cx.commit();return {id,status:'IGNORED_PRIVATE'};
 }catch(e){await cx.rollback();throw e;}finally{cx.release();}
}
export async function monthlyReport(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Invalid month');
 const from=month+'-01';const [year,num]=month.split('-').map(Number);
 const until=new Date(Date.UTC(year,num,1)).toISOString().slice(0,10);
 const db=await getPool();const [rows]=await db.execute(`SELECT p.id,p.source_provider,p.source_reference,p.customer_name,p.customer_email,p.amount_ils,p.payment_method,p.payment_date,p.status,r.document_id,r.status AS receipt_status,r.email_requested,r.email_acknowledged,r.archive_status,r.archive_file_id FROM payments p LEFT JOIN receipt_attempts r ON p.id=r.payment_id WHERE p.payment_date>=? AND p.payment_date<? ORDER BY p.payment_date,p.created_at`,[from,until]);
 return rows;
}