import {fileURLToPath as handoffFileURLToPath} from 'node:url';
const HANDOFF_SOURCE=handoffFileURLToPath(new URL('../../',import.meta.url));
import assert from 'node:assert/strict';
const root=`${HANDOFF_SOURCE}`;
const values={},session={},tabs=new Map();let listener,created=0,imageSends=0,textSends=0;
const job={id:'00000000-0000-4000-8000-000000000001',gid:'10/10_morning_1',title:'記事1',filename:'001__10%2F10_morning_1__記事1.png',prompt:'記事1\nNIKKEI_JOB: 00000000-0000-4000-8000-000000000001'};
const key='sequence-'+job.id;
values[key]={tabId:10,prompt:job.prompt,submitted:true,url:'https://gemini.google.com/app/fixture',started:Date.now()};
globalThis.chrome={
 runtime:{onMessage:{addListener(fn){listener=fn;}}},
 storage:{local:{async get(k){return {[k]:values[k]};},async set(v){Object.assign(values,v);}},session:{async get(k){return {[k]:session[k]};},async set(v){Object.assign(session,v);}}},
 tabs:{async query(){return [...tabs.values()];},async get(id){if(!tabs.has(id))throw new Error('closed');return tabs.get(id);},async create(p){created++;const t={id:100+created,url:p.url,status:'complete'};tabs.set(t.id,t);return t;}},
 scripting:{async executeScript({func,args}){
   if(func.name==='collectGeminiImages'){
     const j=args[2];
     if(j.articles){assert.equal(j.allowImageOnly,true);return [{frameId:0,result:{version:1,items:j.articles.slice(0,3).map(a=>({filename:a.filename,dataUrl:'test',explanation:''})),articles:j.articles.slice(0,3)}}];}
     return [{frameId:0,result:{version:1,items:[{filename:j.filename,dataUrl:'test',explanation:j.explanation}],articles:[{gid:j.gid}]}}];
   }
   const [j,send]=args;
   if(j.textOnly){
     if(send==='commit'){textSends++;return [{frameId:0,result:{status:'sent'}}];}
     return [{frameId:0,result:send?{status:'armed'}:{status:'ready-text',explanation:'【起】課題【承】理由【転】変化【結】注意'}}];
   }
   if(send==='commit')imageSends++;
   return [{frameId:0,result:{status:'ready',url:'https://gemini.google.com/app/fixture',...(j.articles?{imageCount:3}:{})}}];
 }}
};
await import(root+'/background.mjs');
const sender={frameId:0,url:'https://mitsu43.github.io/pdf-extractor-tool/',tab:{id:1}};
const step=(j,url)=>new Promise(resolve=>{assert.equal(listener({type:'NIKKEI_GEMINI_STEP',job:j,url},sender,resolve),true);});
let result=await step(job);assert.equal(result.status,'explaining');assert.equal(created,1);assert.equal(textSends,1);assert.equal(imageSends,0);
await new Promise(r=>setTimeout(r,0));
result=await step(job);assert.equal(result.status,'done');assert.match(result.pack.items[0].explanation,/【起】/);assert.equal(textSends,1);assert.equal(imageSends,0);
await new Promise(r=>setTimeout(r,0));
result=await step(job);assert.equal(result.status,'done');assert.equal(textSends,1);
console.log('PASS: closed tab recovered from saved URL; explanation fetched once; no image regeneration on retry; exact ID preserved');
await new Promise(r=>setTimeout(r,0));
tabs.get(values[key].tabId).url='https://www.youtube.com/';
result=await step(job);assert.equal(result.status,'done');assert.equal(created,2);assert.equal(imageSends,0);assert.equal(textSends,1);
console.log('PASS: a saved tab reused by another website reopens the saved Gemini conversation without regenerating.');
await new Promise(r=>setTimeout(r,0));
const partial={...job,id:'00000000-0000-4000-8000-000000000002',articles:Array.from({length:5},(_,i)=>({gid:`10/10_morning_${i+1}`,title:`記事${i+1}`,filename:`${i+1}.png`}))};
partial.prompt='5記事\nNIKKEI_JOB: '+partial.id;
values['sequence-'+partial.id]={tabId:values[key].tabId,prompt:partial.prompt,submitted:true,url:'https://gemini.google.com/app/fixture',started:Date.now()};
result=await step(partial);
assert.equal(result.status,'done');assert.equal(result.partial,true);assert.equal(result.pack.items.length,3);
assert.deepEqual(result.missing,['10/10_morning_4','10/10_morning_5']);assert.equal(imageSends,0);assert.equal(textSends,1);
console.log('PASS: five requested / three generated returns three matched images and two missing IDs without resending images or explanations.');
await new Promise(r=>setTimeout(r,0));
const next={...partial,id:'00000000-0000-4000-8000-000000000003'};
next.prompt='next five\nNIKKEI_JOB: '+next.id;
result=await step(next,'https://gemini.google.com/app/fixture');
assert.equal(result.status,'done');assert.equal(created,2);assert.equal(imageSends,0);
await new Promise(r=>setTimeout(r,0));
values['sequence-'+next.id].tabId=10;values['sequence-'+next.id].url=undefined;values['sequence-'+next.id].acknowledged=false;
result=await step(next,'https://gemini.google.com/app/fixture');
assert.equal(result.status,'done');assert.equal(values['sequence-'+next.id].acknowledged,true);assert.equal(created,2);assert.equal(imageSends,0);
console.log('PASS: next batch uses explicit existing conversation; uncertain job rebinds read-only after exact receipt check, without resending.');
await new Promise(r=>setTimeout(r,0));
const unknown={...next,id:'00000000-0000-4000-8000-000000000004',recoveryOnly:true};
unknown.prompt='unknown\nNIKKEI_JOB: '+unknown.id;
let allowSendSeen;
chrome.scripting.executeScript=async({args})=>{allowSendSeen=args[1];return [{frameId:0,result:{status:'missing',url:'https://gemini.google.com/app/fixture'}}];};
result=await step(unknown,'https://gemini.google.com/app/fixture');
assert.equal(result.ok,false);assert.match(result.error,/再送せず停止/);assert.equal(allowSendSeen,false);assert.equal(imageSends,0);
assert.equal(values['sequence-'+unknown.id].submitted,false);
console.log('PASS: unknown recovered job is inspected read-only, missing receipt stops without sending.');
