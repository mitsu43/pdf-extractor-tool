import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {IDBFactory}=require('fake-indexeddb');
const source=new URL('../source/pdf-extractor-tool/',import.meta.url);
const text=name=>fs.readFileSync(new URL(name,source),'utf8');
const explanation='【起】状況【承】理由【転】変化【結】注意';
const records=Array.from({length:10},(_,i)=>({gid:`10/10_evening_${i+1}`,title:`記事${i+1}`,date:'10/10',edition:'evening'}));
const queue=records.map((r,i)=>({...r,no:i+1}));
function setup(db=new IDBFactory()){
  const c={indexedDB:db,Blob,File,crypto,Date};c.window=c;
  vm.runInNewContext(text('figure-recovery.js'),c);return c.FigureRecovery;
}
const db=new IDBFactory(),recovery=setup(db),scope=recovery.scope('2026-10-10','evening');
const items=queue.slice(0,5).map((article,i)=>({id:`item-${i}`,queueIndex:i,file:new File(['image-bytes'],`${i}.png`,{type:'image/png'}),explanation}));
await recovery.save(scope,queue,items,'https://gemini.google.com/app/test');
const restored=await setup(db).restore(scope,queue);
assert.equal(restored.items.length,5);
assert.equal(await restored.items[0].file.text(),'image-bytes');
assert.ok(restored.items.every(recovery.complete));
assert.equal((await recovery.restore(recovery.scope('2026-10-11','evening'),queue)).items.length,0);
assert.equal((await recovery.restore(scope,queue.map(a=>({...a,title:a.title+'変更'})))).items[0].queueIndex,-1);
assert.equal(recovery.complete({file:new File([],'empty.png'),explanation}),false);
assert.equal(recovery.complete({file:items[0].file,explanation:'【起】のみ'}),false);
const merged=recovery.merge(restored.items,[{...items[0],explanation:''}],queue);
assert.equal(merged.length,5);assert.equal(merged[0].explanation,explanation);
await recovery.save(scope,queue,merged);
assert.equal((await recovery.restore(scope,queue)).items.length,5);
console.log('PASS storage: bytes and five explanations survive reopen; date/title isolation; empty bytes rejected; partial retry preserves explanation.');

async function sequence({failHandshake=false,failSave=false}={}){
  const indexedDB=new IDBFactory(),r=setup(indexedDB),fields=new Map(),sent=[];
  const get=id=>{if(!fields.has(id))fields.set(id,{value:'',checked:false,disabled:false});return fields.get(id);};
  await r.save(scope,queue,items);
  const context={indexedDB,crypto,TextEncoder,Date,JSON,document:{getElementById:get},figureScope:scope,
    figureQueue:queue,figureRecords:records,figureAssignments:[],figureLog(){},renderFigureQueue(){},
    async buildFigureQueue(){},async persistFigureAssignments(){},
    async restoreFigureAssignments(){context.figureAssignments=(await r.restore(scope,queue)).items;},
    figureArticleComplete(a){return context.figureAssignments.some(x=>queue[x.queueIndex]?.gid===a.gid&&queue[x.queueIndex]?.title===a.title&&r.complete(x));},
    PdfFigurePrompt:{makeBatchJobs(pending){return Array.from({length:Math.ceil(pending.length/5)},(_,i)=>({id:`next-${i}`,articles:pending.slice(i*5,i*5+5)}));}},
    FigureGeminiBridge:{async check(){if(failHandshake)throw new Error('version mismatch');},async step(job){sent.push(job.articles.map(a=>a.gid));return {status:'done',pack:{articles:job.articles}};}},
    FigureUrlImport:{decode:t=>JSON.parse(t.slice(t.indexOf('\n')+1))},
    async assignFigureFiles(pack){if(failSave)throw new Error('quota');context.figureAssignments.push(...pack.articles.map(a=>({queueIndex:queue.findIndex(q=>q.gid===a.gid),file:items[0].file,explanation})));await r.save(scope,queue,context.figureAssignments);},
    async publishFigures(){throw new Error('publishing must not run in this test');},
    setTimeout:fn=>{queueMicrotask(fn);return 1;}};
  context.window=context;
  vm.runInNewContext(text('figure-sequence.js'),context);
  await get('startFigureSequenceBtn').onclick();
  const connection=await new Promise(resolve=>{const req=indexedDB.open('nikkei-figure-sequence');req.onsuccess=()=>resolve(req.result);});
  const stored=await new Promise(resolve=>{const req=connection.transaction('queues').objectStore('queues').get('publication-v1:'+scope);req.onsuccess=()=>resolve(req.result);});connection.close();
  return {sent,stored,status:get('figureSequenceStatus').textContent,complete:(await r.restore(scope,queue)).items};
}
let result=await sequence();
assert.deepEqual(result.sent,[records.slice(5).map(a=>a.gid)]);
assert.equal(result.complete.length,10);assert.equal(result.stored.phase['next-0'],'captured');
result=await sequence({failHandshake:true});assert.equal(result.sent.length,0);assert.equal(result.stored.phase['next-0'],'prepared');
result=await sequence({failSave:true});assert.equal(result.complete.length,5);assert.notEqual(result.stored.phase['next-0'],'captured');assert.match(result.status,/quota/);
console.log('PASS sequence mocks: restored five skipped; only 6-10 dispatched; handshake failure leaves prepared; failed save never captured or published.');
