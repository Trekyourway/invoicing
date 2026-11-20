import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {connectForMigration} from './db.mjs';
const db=await connectForMigration();
try{
 const sql=fs.readFileSync(fileURLToPath(new URL('./schema.sql',import.meta.url)),'utf8');
 await db.query(sql);
 console.log('Schema applied');
} finally {await db.end();}