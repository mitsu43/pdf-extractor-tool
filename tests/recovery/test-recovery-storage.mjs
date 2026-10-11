import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
const root=new URL('../../',import.meta.url);
const source=name=>fs.readFileSync(new URL(name,root),'utf8');
const html=source('index.html');
const ui=html.slice(html.indexOf("const FIGURE_API_BASE ="),html.indexOf("$('buildFigureQueueBtn').addEventListener"));
const records=Array.from({length:10},(_,i)=>({gid:`10/11_morning_${i+1}`,no:i+1,title:`記事${i+1}`,date:'10/11',edition:'morning',men:'1',body:'本文'}));
const explanation='【起】課題【承】仕組み【転】変化【結】注意';
const fields=()=>new Map();
function environment(input=records,date='2026-10-11'){
 const elements=fields();
 const $=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',checked:false,disabled:false,addEventListener(){},focus(){}});return elements.get(id);};
 $('mapDateInput').value=date;$('mapEditionSelect').value='morning';
 const c=vm.createContext({indexedDB,crypto,TextEncoder,File,Blob,atob,Uint8Array,Date,JSON,URL,structuredClone,console,
  document:{getElementById:$,querySelectorAll:()=>[]},$,state:{articles:input},buildMapRecordsFromCurrent:()=>structuredClone(input),
  setTimeout:fn=>{queueMicrotask(fn);return 1;},clearTimeout(){},confirm:()=>true,escapeHtml:String,createImageBitmap:async()=>({close(){}}),
  localStorage:{setItem(){}},calls:[],records:input});
 c.window=c;
 for(const name of ['figure-recovery.js','figure-url-import.js','figure-prompt.js','figure-job-prompt.js'])vm.runInContext(source(name),c);
 vm.runInContext(ui,c);
 c.FigureGeminiBridge={async step(job){c.calls.push(structuredClone(job));return {status:'done',pack:{version:1,items:job.articles.map(a=>({filename:a.filename,dataUrl:'data:image/png;base64,aW1hZ2U=',explanation})),articles:job.articles.map(a=>({...a,explanation}))}};}};
 vm.runInContext(source('figure-sequence.js'),c);
 return {c,$,run:code=>vm.runInContext(code,c)};
}
let env=environment();await env.run('buildFigureQueue()');
env.c.selected=records.slice(0,5);
await env.run(`assignFigureFiles(selected.map(a=>{const f=new File(['image'],FigurePrompt.imageFilename(a),{type:'image/png'});f.geminiArticles=[{...a,explanation:'${explanation}'}];return f;}))`);
assert.equal(env.run('figureRecords.filter(figureArticleComplete).length'),5);
// Full runtime replacement simulates reloading: only IndexedDB survives.
env=environment(records.map(a=>({...a,body:'本文の校正後'})));
await env.run('buildFigureQueue()');
assert.equal(env.run('figureAssignments.length'),5);
assert.equal(await env.run('figureAssignments[0].file.text()'),'image');
assert.equal(env.run('figureAssignments[0].explanation'),explanation);
await env.$('startFigureSequenceBtn').onclick();
assert.equal(env.c.calls.length,1,env.$('figureSequenceStatus').textContent);
assert.deepEqual(Array.from(env.c.calls[0].articles,a=>a.gid),records.slice(5).map(a=>a.gid));
assert.equal(env.run('figureRecords.filter(figureArticleComplete).length'),10);
// A second reload with all ten completed sends nothing.
env=environment();await env.run('buildFigureQueue()');await env.$('startFigureSequenceBtn').onclick();
assert.equal(env.c.calls.length,0);assert.equal(env.run('figureAssignments.length'),10);
console.log('PASS: File bytes and four-stage explanation survive runtime reload; corrected article body retains progress; only articles 6–10 selected; all-complete reload sends nothing.');
// Different year: same month/day IDs never restore last year's images.
env=environment(records,'2027-10-11');await env.run('buildFigureQueue()');assert.equal(env.run('figureAssignments.length'),0);
// Incomplete artifacts cannot be counted as complete or sent for automatic regeneration.
env.c.selected=records.slice(0,1);
await env.run(`assignFigureFiles(selected.map(a=>{const f=new File(['image'],FigurePrompt.imageFilename(a),{type:'image/png'});f.geminiArticles=[{...a,explanation:''}];return f;}))`);
assert.equal(env.run('figureRecords.filter(figureArticleComplete).length'),0);
await env.$('startFigureSequenceBtn').onclick();assert.equal(env.c.calls.length,0);assert.match(env.$('figureSequenceStatus').textContent,/説明未取得/);
console.log('PASS: year isolation; image-only artifact retained but not complete; no automatic regeneration.');
// Storage failure keeps the in-memory image and blocks the next send.
env=environment(records,'2028-10-11');await env.run('buildFigureQueue()');
env.run("FigureRecovery.save=async()=>{throw new Error('QuotaExceededError')}");
env.c.selected=records.slice(0,1);
await assert.rejects(env.run(`assignFigureFiles(selected.map(a=>{const f=new File(['image'],FigurePrompt.imageFilename(a),{type:'image/png'});f.geminiArticles=[{...a,explanation:'${explanation}'}];return f;}))`),/QuotaExceededError/);
assert.equal(env.run('figureAssignments.length'),1);
await env.$('startFigureSequenceBtn').onclick();assert.equal(env.c.calls.length,0);assert.match(env.$('figureSequenceStatus').textContent,/QuotaExceededError/);
console.log('PASS: storage failure retains in-memory image and blocks generation.');
// Title changes never silently reassign the old image.
env=environment(records.map((a,i)=>i? a:{...a,title:'別の記事'}));await env.run('buildFigureQueue()');
assert.equal(env.run('figureAssignments.filter(x=>x.queueIndex<0).length'),1);
await env.$('startFigureSequenceBtn').onclick();assert.equal(env.c.calls.length,0);assert.match(env.$('figureSequenceStatus').textContent,/対応未確認/);
console.log('PASS: changed title preserves old image as unresolved and prevents a new send.');
// Legacy partial cache: recover original job IDs after the body hash changes.
function legacyAccess(key,value){return new Promise((resolve,reject)=>{
 const r=indexedDB.open('nikkei-figure-sequence',1);
 r.onsuccess=()=>{const d=r.result,tx=d.transaction('queues',value===undefined?'readonly':'readwrite'),s=tx.objectStore('queues'),q=value===undefined?s.get(key):s.put(value,key);tx.oncomplete=()=>{d.close();resolve(q.result)};tx.onerror=()=>reject(tx.error);};
});}
env=environment(records,'2029-10-11');await env.run('buildFigureQueue()');
const jobs=env.run('PdfFigurePrompt.makeBatchJobs(figureRecords)');
const legacyKey='batch-ten-v1:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(records)+'\n'))),b=>b.toString(16).padStart(2,'0')).join('');
const cache={version:1,items:jobs[0].articles.slice(0,3).map(a=>({filename:a.filename,dataUrl:'data:image/png;base64,aW1hZ2U=',explanation})),articles:jobs[0].articles.slice(0,3).map(a=>({...a,explanation}))};
const legacy={jobs:structuredClone(jobs),results:{[jobs[0].id]:cache}};
await legacyAccess(legacyKey,legacy);
env=environment(records.map(a=>({...a,body:'変更で旧ハッシュとは異なる'})),'2029-10-11');await env.run('buildFigureQueue()');
await env.$('startFigureSequenceBtn').onclick();
assert.equal(env.c.calls.length,2,env.$('figureSequenceStatus').textContent);
assert(env.c.calls.every(j=>j.recoveryOnly));
assert.deepEqual(env.c.calls.map(j=>j.id),Array.from(jobs,j=>j.id));
assert.deepEqual(await legacyAccess(legacyKey),legacy);
assert.equal(env.run('figureRecords.filter(figureArticleComplete).length'),10);
console.log('PASS: legacy partial cache is re-collected read-only using original job IDs despite changed body hash; original queue unchanged.');
// A successful HTTP response with the wrong count must not mark site persistence.
env=environment();await env.run('buildFigureQueue()');
env.c.FormData=FormData;env.$('figurePublishTokenInput').value='test-only-token';
env.c.fetch=async()=>({ok:true,json:async()=>({ok:true,uploaded:0})});
await env.run('publishFigures()');assert.match(env.$('figureSequenceStatus').textContent,/保存停止/);
assert.equal(env.run('figureAssignments.filter(x=>x.siteSavedAt).length'),0);
env.c.fetch=async()=>({ok:true,json:async()=>({ok:true,uploaded:10})});
await env.run('publishFigures()');assert.equal(env.run('figureAssignments.filter(x=>x.siteSavedAt).length'),10);
console.log('PASS: mocked site-save count mismatch is not accepted; matching acknowledgement records siteSavedAt separately from local capture.');
