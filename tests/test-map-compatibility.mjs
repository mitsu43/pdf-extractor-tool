import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const html=fs.readFileSync(process.argv[2]||new URL('../index.html',import.meta.url),'utf8');
for(const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi))if(!/src=|type="module"/.test(m[1]))new vm.Script(m[2]);
const promptPart=s=>s.slice(s.indexOf('function makeManualPrompt('),s.indexOf('function startManualWorkflow('));
const hash=s=>createHash('sha256').update(s).digest('hex');
// Historical source: f3cff80a3e6914675d2e205c2c83156ace2b568f (active on October 9).
assert.equal(hash(promptPart(html)),'c958a01bf8e5b1c189da88c1e6e67768c5bd61472b3a01e33fc07f1b067e0f05','Historical prompt must be unchanged');
assert.equal(hash(html.match(/const PRESETS = [\s\S]*?\n};/)[0]),'960385173876ba08e24dc2999e2cf35637f2e93e7694eb734498fe3863c9e074');
const elements={mapDateInput:{value:'2026-10-13'},mapEditionSelect:{value:'evening'}};
const c={normalizeArticleRecord:a=>({...a}),$:id=>elements[id],state:{articles:[]},TextEncoder};
vm.createContext(c);
vm.runInContext(html.slice(html.indexOf('function mapAnalysisValues('),html.indexOf('// Token assumptions')),c);
vm.runInContext(html.slice(html.indexOf('let mapArticles = []'),html.indexOf('// Article learning figures:')),c);
vm.runInContext(html.slice(html.indexOf('function mergeMapRecords('),html.indexOf('async function downloadMapData(')),c);
const record=(title,men,no,id,date='10/13',edition='evening')=>({id,no,date,edition,gid:`${date}_${edition}_${no}`,men:String(men),title,cat:'国際情勢',place:'札幌市',lat:43.06,lng:141.35,'内容':'既存本文','理解':'既存解説','思惑':'既存見通し',quiz_q:'既存問い',quiz_a:'既存答え',saved:true,body:'長い原文',article_boxes:'10,20,40,70'});
const existing=[record('既存1面',1,1,41),record('既存6面',6,8,100),record('朝刊記事',1,1,101,'10/13','morning'),record('前日の記事',1,1,102,'10/12')];
vm.runInContext('mapArticles='+JSON.stringify(existing),c);
const incoming={...record('新しい記事',2,1,999),'内容':'追加本文'};
assert.equal(c.mergeMapRecords([incoming]),0);
let merged=vm.runInContext('mapArticles',c);
assert.equal(merged.length,5);
for(const r of existing){const retained=merged.find(a=>a.gid===r.gid);assert.equal(retained.title,r.title);assert.equal(retained.id,r.id);assert.equal(retained.body,r.body);}
const added=merged.find(a=>a.title==='新しい記事');assert.equal(added.no,9);assert.equal(added.gid,'10/13_evening_9');
c.mergeMapRecords([{...record('既存6面',6,1,999),'内容':'更新本文','理解':'','思惑':''}]);
merged=vm.runInContext('mapArticles',c);
const updated=merged.find(a=>a.title==='既存6面');
assert.equal(updated.gid,'10/13_evening_8');assert.equal(updated.id,100);assert.equal(updated['内容'],'更新本文');assert.equal(updated['理解'],'既存解説');assert.equal(updated.saved,true);assert.equal(updated.body,'長い原文');
c.mergeMapRecords([incoming]);assert.equal(vm.runInContext('mapArticles.length',c),5);
assert.equal(new Set(merged.map(a=>a.gid)).size,merged.length);
assert.equal(c.mapAnalysisValues({change_direction:'変化だけ'}).understanding,'変化だけ');
assert.equal(c.mapAnalysisValues({future_outlook:'見通しだけ'}).intent,'見通しだけ');
c.state.articles=[{no:1,page:6,headline:'既存6面',edition:'e',content_detail:'図解の対象'}];
assert.equal(c.buildMapRecordsFromCurrent()[0].gid,'10/13_evening_8','Figure and article export must use same stable ID');
const before=vm.runInContext('JSON.stringify(mapArticles)',c);
assert.throws(()=>c.mergeMapRecords([{...incoming,title:''}]));assert.equal(vm.runInContext('JSON.stringify(mapArticles)',c),before);
const chunks=c.splitMapData(existing,1000);
assert.equal(chunks.length,4);assert.equal(chunks.flat().length,existing.length);
for(const chunk of chunks)assert.ok(new TextEncoder().encode(JSON.stringify(chunk)).length<=1000);
assert.throws(()=>c.splitMapData([{title:'あ'.repeat(100)}],40));
const require=createRequire(import.meta.url);
const zipModule={exports:{}};
vm.runInNewContext(fs.readFileSync(new URL('../jszip.min.js',import.meta.url),'utf8'),{
  module:zipModule,exports:zipModule.exports,require,Buffer,process,setImmediate,setTimeout,clearTimeout,Uint8Array,ArrayBuffer,Promise
});
const JSZip=zipModule.exports;
const archive=new JSZip();
chunks.forEach((chunk,i)=>archive.file(`data-${i+1}.json`,JSON.stringify(chunk)));
const zipBytes=await archive.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
const loaded=await JSZip.loadAsync(zipBytes);
assert.deepEqual(Object.keys(loaded.files),['data-1.json','data-2.json','data-3.json','data-4.json']);
const roundTrip=(await Promise.all(Object.values(loaded.files).map(async file=>JSON.parse(await file.async('string'))))).flat();
assert.equal(roundTrip.length,existing.length);assert.deepEqual(roundTrip.map(a=>a.gid),existing.map(a=>a.gid));
if(process.env.CHECK_MASTER==='1'){
  const base='/Users/mitsumasamatsugane/Library/CloudStorage/OneDrive-個人用/news1共通/';
  const rows=[1,2,3,4].flatMap(i=>JSON.parse(fs.readFileSync(base+`data-${i}.json`,'utf8')));
  const repaired=c.repairMapRecords(rows);
  assert.equal(repaired.length,rows.length);
  rows.forEach((r,i)=>{assert.equal(repaired[i].gid,r.gid);assert.equal(repaired[i].title,r.title);assert.equal(repaired[i]['内容'],r['内容']);});
  const parts=c.splitMapData(repaired);assert.equal(parts.flat().length,rows.length);
  console.log(`PASS: ${rows.length} actual stored articles preserved; four output files each <=20MiB (read-only test)`);
}
console.log('PASS: historical prompts/schema unchanged; partial merge preserves other pages/dates/editions; stable IDs and figure targets; repeat merge deduplication; independent analysis fields; atomic failure; four-file size limit; JS syntax');
