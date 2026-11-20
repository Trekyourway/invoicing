import {scanInbox} from './inbox.mjs';
const r=await scanInbox();console.log(JSON.stringify({new_items:r.new_items,failed:r.failed}));
if(r.failed)process.exitCode=1;