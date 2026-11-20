import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {encryptReceipt} from './receipt-crypto.mjs';
// Usage: node src/receipt-queue-encrypt.mjs --stdin
// Accepts sensitive request JSON only via stdin, never CLI args or tracked files.
if(process.argv.length!==3||process.argv[2]!=='--stdin') {
  console.error('Usage: node src/receipt-queue-encrypt.mjs --stdin < private_request.json');
  process.exit(2);
}
const publicKey=await readFile(new URL('../keys/receipt_queue_public.pem',import.meta.url),'utf8');
let body='';for await(const part of process.stdin){body+=part;if(body.length>10000)throw new Error('Input too large');}
const envelope=encryptReceipt(JSON.parse(body),publicKey);
const dir=new URL('../requests/',import.meta.url);await mkdir(dir,{recursive:true});
const out=new URL(`../requests/${envelope.id}.enc.json`,import.meta.url);
await writeFile(out,JSON.stringify(envelope,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(`Prepared encrypted receipt request: requests/${envelope.id}.enc.json (no customer data printed)`);