// Persistent public NON-PII receipt markers. No provider ID, email, names,
// amount or PDF URL may ever be included here.
export function createGitHubState({repo,token,branch='main',fetchFn=fetch}={}) {
  if(!repo||!token)throw new Error('GitHub state configuration missing');
  if(!/^[-\w]+\/[-\w.]+$/.test(repo))throw new Error('Invalid repository');
  const base=`https://api.github.com/repos/${repo}/contents/receipts/state/`;
  const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
  const send=(url,method='GET',body)=>fetchFn(url,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  const path=key=>{if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid receipt state key');return base+key+'.json';};
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64');
  async function claim(key,id) {
    const url=path(key);
    const check=await send(url);
    if(check.status===200)return {claimed:false};
    if(check.status!==404)throw new Error('Cannot check duplicate receipt state');
    const record={id,status:'RESERVED',updated_utc:new Date().toISOString()};
    const created=await send(url,'PUT',{message:'Reserve encrypted receipt '+id,content:encode(record),branch});
    if(created.status===409||created.status===422)return {claimed:false};
    if(created.status!==201)throw new Error('Cannot persist pre-issue receipt reservation');
    const result=await created.json();
    if(!result?.content?.sha)throw new Error('No reservation content SHA');
    return {claimed:true,sha:result.content.sha};
  }
  async function finish(key,sha,status){
    if(!sha)throw new Error('Missing reservation SHA');
    const record={status:status.status,email_acknowledged:status.email_acknowledged,updated_utc:status.updated_utc};
    const res=await send(path(key),'PUT',{message:'Record HYP receipt result',content:encode(record),sha,branch});
    if(res.status!==200)throw new Error('Receipt outcome could not be saved; reconcile in HYP');
  }
  return {claim,finish};
}