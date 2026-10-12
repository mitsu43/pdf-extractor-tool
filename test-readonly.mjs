import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {IDBFactory,IDBDatabase,IDBObjectStore,IDBCursor} from 'fake-indexeddb';
const source=fs.readFileSync(new URL('./storage-diagnostic.js',import.meta.url),'utf8');
const seed=(f,name,stores)=>new Promise((resolve,reject)=>{
 const r=f.open(name,1);r.onupgradeneeded=()=>Object.keys(stores).forEach(s=>r.result.createObjectStore(s));
 r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction(Object.keys(stores),'readwrite');
 for(const [s,rows]of Object.entries(stores))for(const [k,v]of rows)t.objectStore(s).put(v,k);
 t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};
});
const job='aaaaaaaaaaaaaaaaaaaa';
const scope='["2026-10-11","morning"]';
async function run(f,{origin='https://mitsu43.github.io',enumerate,failTransaction=false}={}){
 const logs=[],opened=[],modes=[],forbidden=[];const undo=[];
 const patch=(o,k,fn)=>{const old=o[k];o[k]=fn(old);undo.push(()=>o[k]=old);};
 for(const [o,methods]of [[IDBObjectStore.prototype,['put','add','delete','clear']],[IDBCursor.prototype,['update','delete']],[IDBDatabase.prototype,['createObjectStore','deleteObjectStore']]])
  for(const k of methods)patch(o,k,()=>function(){forbidden.push(k);throw new Error('WRITE_FORBIDDEN');});
 patch(IDBDatabase.prototype,'transaction',old=>function(stores,mode){modes.push(mode);assert(['readonly','versionchange'].includes(mode));if(failTransaction)throw new Error('READ_FAILURE');return old.call(this,stores,mode);});
 const api={databases:enumerate||(()=>f.databases()),open:(...args)=>{opened.push(args);assert.equal(args.length,1);return f.open(...args);},deleteDatabase:()=>{forbidden.push('deleteDatabase');throw new Error('DELETE_FORBIDDEN');}};
 const no=()=>{forbidden.push('external-or-storage');throw new Error('FORBIDDEN');};
 const c=vm.createContext({indexedDB:api,location:{origin,pathname:'/pdf-extractor-tool/connection-check.html'},Blob,Date,JSON,setTimeout,clearTimeout,
 console:{log:x=>logs.push(x)},fetch:no,postMessage:no,localStorage:{getItem:no,setItem:no,removeItem:no},navigator:{clipboard:{writeText:no}}});
 try{vm.runInContext(source,c);assert.equal(opened.length,0,'loading does not open DBs');const out=await c.NikkeiStorageDiagnostic.collect();assert.equal(forbidden.length,0);assert(!/SECRET|https:\/\/gemini|data:image/.test(JSON.stringify(out)));return {out,opened,modes};}
 finally{undo.reverse().forEach(fn=>fn());}
}
let tests=0;
async function test(name,fn){await fn();tests++;console.log('PASS '+name);}
await test('existing DB summaries; zero writes/schema changes; no secret/body/image/URL output',async()=>{
 const f=new IDBFactory();
 await seed(f,'pdfExtractorDB',{sessions:[['current',{articles:[{body:'SECRET'}],savedAt:0,token:'SECRET'}]]});
 await seed(f,'nikkei-figure-sequence',{queues:[['publication-v1:'+scope,{jobs:[{id:job,prompt:'SECRET',articles:[{body:'SECRET'}]}],phase:{[job]:'checking'}}],['SECRET',{items:[{dataUrl:'data:image/png;base64,SECRET'}]}]]});
 await seed(f,'nikkei-figure-artifacts-v1',{current:[[scope,{items:[{file:new Blob(['SECRET']),explanation:'【起】【承】【転】【結】SECRET',state:'ARTIFACTS_CAPTURED'}],conversationUrl:'https://gemini.google.com/app/SECRET'}]],history:[['SECRET',{body:'SECRET'}]]});
 const before=await f.databases(),r=await run(f);assert.deepEqual(await f.databases(),before);
 assert.equal(r.out.databases['pdfExtractorDB'].stores.sessions.rows[0].articles,1);
 assert.equal(r.out.databases['nikkei-figure-sequence'].stores.queues.rows.find(x=>x.type==='queue').jobs[0].phase,'checking');
 assert.equal(r.out.databases['nikkei-figure-artifacts-v1'].stores.current.rows[0].blobBytes,6);
 assert.equal(r.out.originalTabMemory,'NOT_INSPECTED');assert.equal(r.out.sendOutcome,'UNKNOWN');
 assert.equal(r.modes.length,4);
});
await test('empty profile: no open calls; no DB created',async()=>{const f=new IDBFactory(),r=await run(f);assert.equal(r.opened.length,0);assert.deepEqual(await f.databases(),[]);});
await test('enumeration/open deletion race: upgrade aborted; no durable DB/schema created',async()=>{
 const f=new IDBFactory(),r=await run(f,{enumerate:async()=>[{name:'pdfExtractorDB'}]});
 assert.equal(r.out.databases.pdfExtractorDB.status,'OPEN_ABORTED_OR_FAILED');assert.deepEqual(await f.databases(),[]);
});
await test('enumeration unsupported or denied: no fallback opens',async()=>{const r=await run(new IDBFactory(),{enumerate:async()=>{throw new Error('SECRET');}});assert.equal(r.opened.length,0);assert.equal(r.out.status,'DATABASE_ENUMERATION_UNAVAILABLE');});
await test('wrong origin: no DB access',async()=>{const r=await run(new IDBFactory(),{origin:'https://nikkei-map.pages.dev'});assert.equal(r.opened.length,0);assert.equal(r.out.status,'WRONG_ORIGIN_OR_PATH');});
await test('missing store: no creation',async()=>{const f=new IDBFactory();await seed(f,'pdfExtractorDB',{unrelated:[]});const r=await run(f);assert.equal(r.out.databases.pdfExtractorDB.stores.sessions.status,'STORE_ABSENT');});
await test('read failure: reports unknown/error, never zero or false success',async()=>{const f=new IDBFactory();await seed(f,'pdfExtractorDB',{sessions:[]});const r=await run(f,{failTransaction:true});assert.equal(r.out.databases.pdfExtractorDB.stores.sessions.status,'READ_SETUP_FAILED');});
console.log(`${tests} scenarios passed. Node/fake-indexeddb only; no Mac/browser E2E.`);
