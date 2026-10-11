import {fileURLToPath as handoffFileURLToPath} from 'node:url';
const HANDOFF_SOURCE=handoffFileURLToPath(new URL('../../',import.meta.url));
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=`${HANDOFF_SOURCE}`;
const script=fs.readFileSync(root+'/figure-sequence.js','utf8');
async function run({existing=0,partialCache=false,auto=true,partial=false}={}){
  const fields=new Map();
  const get=id=>{if(!fields.has(id))fields.set(id,{value:'',checked:auto,disabled:false});return fields.get(id);};
  get('figureConversationInput').value='https://gemini.google.com/app/current';
  const records=Array.from({length:10},(_,i)=>({gid:'10/11_morning_'+(i+1),title:'article '+(i+1)}));
  const jobs=[0,5].map((n,i)=>({id:'job-'+i,articles:records.slice(n,n+5)}));
  const assignments=records.slice(0,existing).map((a,i)=>({queueIndex:i}));
  const stored=new Map(),calls=[];let published=0;
  const context={document:{getElementById:get},figureRecords:records,figureQueue:records,figureAssignments:assignments,
    buildFigureQueue(){},async restoreFigureAssignments(){},async persistFigureAssignments(){},figureScope:'test-publication',figureArticleComplete:a=>assignments.some(x=>records[x.queueIndex]?.gid===a.gid),renderFigureQueue(){},figureLog(){},crypto,TextEncoder,JSON,Date,
    PdfFigurePrompt:{makeBatchJobs:pending=>jobs.filter(j=>j.articles.some(a=>pending.some(p=>p.gid===a.gid)))},
    FigureGeminiBridge:{async step(job,url){calls.push(job.id);assert.equal(url,'https://gemini.google.com/app/current');return {status:'done',url,pack:{articles:partial?job.articles.slice(0,3):job.articles}};}},
    FigureUrlImport:{decode:text=>JSON.parse(text.split('\n').slice(1).join('\n'))},
    async assignFigureFiles(pack){for(const a of pack.articles){const i=records.findIndex(r=>r.gid===a.gid);if(!assignments.some(x=>x.queueIndex===i))assignments.push({queueIndex:i});}},
    async publishFigures(){published++;get('figureSequenceStatus').textContent='saved';},
    setTimeout:fn=>{queueMicrotask(fn);return 1;},
    indexedDB:{open(){const request={};queueMicrotask(()=>{
      request.result={close(){},transaction(){const tx={objectStore(){return {getAllKeys(){const r={};queueMicrotask(()=>{r.result=[...stored.keys()];});return r;},getAll(){const r={};queueMicrotask(()=>{r.result=[...stored.values()];tx.oncomplete();});return r;},get(key){const r={};queueMicrotask(()=>{r.result=structuredClone(stored.get(key));tx.oncomplete();});return r;},put(value,key){stored.set(key,structuredClone(value));const r={result:key};queueMicrotask(()=>tx.oncomplete());return r;}};}};return tx;}};
      request.onsuccess();
    });return request;}}
  };
  if(partialCache){const snapshot=JSON.stringify(records);const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot+'\n'));const key='batch-ten-v1:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');stored.set(key,{jobs,results:{'job-0':{articles:records.slice(0,3)}}});}
  context.window=context;
  vm.runInNewContext(script,context);
  await get('startFigureSequenceBtn').onclick();
  return {calls,published,assignments,status:get('figureSequenceStatus').textContent};
}
let result=await run();assert.deepEqual(result.calls,['job-0','job-1']);assert.equal(result.assignments.length,10);assert.equal(result.published,1);
result=await run({existing:5,partialCache:true});assert.deepEqual(result.calls,['job-1']);assert.equal(result.assignments.length,10);assert.equal(result.published,1);
result=await run({existing:10});assert.deepEqual(result.calls,[]);assert.equal(result.published,1);
result=await run({auto:false});assert.equal(result.published,0);assert.equal(result.assignments.length,10);
result=await run({partial:true});assert.deepEqual(result.calls,['job-0']);assert.equal(result.assignments.length,3);assert.equal(result.published,0);assert.match(result.status,/不足2記事/);
console.log('PASS: two five-article batches auto-import and publish; manually imported five skip stale partial cache; all-complete sends nothing; opt-out does not publish; partial result retained without regeneration.');
