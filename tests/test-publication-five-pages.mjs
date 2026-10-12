import {fileURLToPath as handoffFileURLToPath} from 'node:url';
const HANDOFF_SOURCE=handoffFileURLToPath(new URL('../source',import.meta.url));
import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const PDFLib = require('pdf-lib');
const root = `${HANDOFF_SOURCE}/pdf-extractor-tool`;
const html = await fs.readFile(root+'/index.html','utf8');
const pick = (start,end) => html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const source = await PDFLib.PDFDocument.create();
for (let i=0;i<27;i++) {const p=source.addPage();p.drawText(`Page ${i+1}`);}
const bytes = await source.save();
const downloads = [], logs = [], blobs = new Map();
const button = {disabled:false,textContent:'public PDF'};
const state = {pdfFile:new File([bytes],'test27.pdf'),pdfPageCount:27,manual:{prepared:true,batches:[{id:0,startPage:1,endPage:27}]}};
const ctx = vm.createContext({state,Blob,File,ArrayBuffer,Uint8Array,log:(...x)=>logs.push(x),$:()=>button,
  URL:{createObjectURL:blob=>{const u='blob:'+blobs.size;blobs.set(u,blob);return u;},revokeObjectURL:()=>{}},
  document:{body:{appendChild:()=>{},removeChild:()=>{}},createElement:()=>({click(){downloads.push({name:this.download,blob:blobs.get(this.href)});}})},
  setTimeout:fn=>fn()});
vm.runInContext(await fs.readFile(require.resolve('pdf-lib/dist/pdf-lib.js'),'utf8'),ctx);
vm.runInContext(pick('function pageRangesFrom(', '\nfunction normalizeDedupText(')+pick('async function splitPdfPages(', "\nif ($('downloadSplitPdfBtn'))")+pick('async function downloadAllBatchPdfs(', '\nasync function downloadBatchPdf('),ctx);
await vm.runInContext('downloadAllBatchPdfs()',ctx);
assert.equal(downloads.length,6,JSON.stringify(logs));
const counts=[];
for(const [i,d] of downloads.entries()){
  const pdf=await PDFLib.PDFDocument.load(await d.blob.arrayBuffer());
  counts.push(pdf.getPageCount());
  assert.equal(d.name,`test27_P${i*5+1}-P${Math.min(i*5+5,27)}.pdf`);
}
assert.deepEqual(counts,[5,5,5,5,5,2]);
assert.equal(state.manual.batches[0].endPage,27);
assert.equal(button.disabled,false);
assert(!html.includes('wholePdfManual'));
assert.match(html,/const batchSize = testOnly \? 1 : 5;/);
// A failed split must not be reported as a successful download.
vm.runInContext('splitPdfPages = async () => {throw new Error("test failure");}',ctx);
logs.length=0;
await vm.runInContext('downloadAllBatchPdfs()',ctx);
assert(logs.some(x=>x[1]==='err'));
assert(!logs.some(x=>x[1]==='ok'));
assert.equal(button.disabled,false);
for(const block of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(block[1]);
const elements=new Map();
const ui=vm.createContext({state:{pdfFile:{name:'20261010m.pdf'},pdfPageCount:27},
  $:id=>{if(!elements.has(id))elements.set(id,{textContent:'',classList:{add(){},remove(){}}});return elements.get(id);},
  ensureDefaultEnrichSetting(){},updateStartBtn(){},renderBatchGrid(){},log(){},logEl:{innerHTML:''}});
vm.runInContext(pick('function startManualWorkflow(', '// Render all batch tiles'),ui);
vm.runInContext('startManualWorkflow()',ui);
assert.deepEqual(JSON.parse(JSON.stringify(ui.state.manual.batches.map(b=>[b.startPage,b.endPage]))),[[1,5],[6,10],[11,15],[16,20],[21,25],[26,27]]);
assert.equal(elements.get('manualStatus').textContent,'6バッチ準備完了');
console.log('PASS: actual preparation function creates six batches; actual download handler creates six PDFs (5/5/5/5/5/2 pages); failure reporting and inline syntax pass.');
