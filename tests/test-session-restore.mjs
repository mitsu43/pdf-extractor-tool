import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const storage=html.slice(html.indexOf("const DB_NAME ="),html.indexOf('const todayStr'));
const extract=(name,next)=>html.slice(html.indexOf('function '+name+'('),html.indexOf('function '+next+'(')).replace(/async\s*$/,'');
const rows=[{no:1,page:1,headline:'保存した記事',分類:'B1 人材戦略の転換',分類理由:'採用する人材の戦略を見直す。'}];
function setup(){
  const fields=new Map();
  const $=id=>{if(!fields.has(id))fields.set(id,{value:id==='runMode'?'manual':'',classList:{remove(){},add(){}}});return fields.get(id);};
  const c={indexedDB:new IDBFactory(),state:{articles:structuredClone(rows),pdfFile:{name:'20261025m.pdf'},pdfPageCount:8,preset:'nikkei',schema:{fields:[{key:'headline',label:'見出し'}]},manual:{parallel:true,batchSize:5,maxPages:8,prepared:true,finalized:false,batches:[{id:0,startPage:1,endPage:5,status:'done',articles:structuredClone(rows),articleCount:1,pdfBytes:new Uint8Array([1,2]),prompt:'一時プロンプト'},{id:1,startPage:6,endPage:8,status:'pending'}]}},$,console:{error(){}},log(){},renderBatchGrid(){},renderResults(){},updateStartBtn(){}};
  vm.createContext(c);vm.runInContext(storage,c);return c;
}
test('save round-trip keeps manual batch progress and schema, excluding PDF bytes and transient prompts',async()=>{
  const c=setup();await c.saveSession();const saved=await c.loadSession();
  assert.equal(saved.articles[0].headline,rows[0].headline);assert.equal(saved.manual.batches[0].status,'done');
  assert.equal(saved.manual.batches[0].pdfBytes,undefined);assert.equal(saved.manual.batches[0].prompt,undefined);
  assert.equal(saved.schema.fields[0].key,'headline');
  const restored=c.restoredManualSession(saved);assert.equal(restored.prepared,false);assert.equal(restored.batches[1].status,'pending');
});
test('aborted save preserves the prior record and an aborted discard is rejected',async()=>{
  const c=setup();await c.saveSession();const db=await c.openDB(),transaction=db.transaction.bind(db);
  db.transaction=(...args)=>{const tx=transaction(...args);if(args[1]==='readwrite'){const store=tx.objectStore.bind(tx);tx.objectStore=(...names)=>{const object=store(...names);for(const method of ['put','delete']){const original=object[method].bind(object);object[method]=(...values)=>{const req=original(...values);req.addEventListener('success',()=>tx.abort());return req;};}return object;};}return tx;};
  c.state.articles=[{headline:'保存に失敗する更新'}];await c.saveSession();assert.equal((await c.loadSession()).articles[0].headline,rows[0].headline);
  await assert.rejects(c.clearSession(),/中断|失敗/);assert.equal((await c.loadSession()).articles[0].headline,rows[0].headline);
});
test('legacy saves keep every article and never invent a completed batch',()=>{
  const c=setup();const original=[...rows,{headline:'ページ未設定',page:0},{headline:'後半',page:7}];
  const restored=c.restoredManualSession({articles:original,pdfPageCount:8});
  assert.equal(restored.batches.flatMap(b=>b.articles).length,3);assert.ok(restored.batches.every(b=>b.status!=='done'));
});
test('reselecting the original PDF preserves articles and reconnects the saved batches without a new extraction',async()=>{
  const c=setup();c.state.manual.prepared=false;c.state.restoredSession={pdfName:'20261025m.pdf',pdfPageCount:8};
  Object.assign(c,{alert:message=>{throw Error(message);},pdfjsLib:{getDocument:()=>({promise:Promise.resolve({numPages:8})})},renderPdfInfo(){},applyNikkeiFileMetadata(){},updateCostEstimate(){},startManualWorkflow(){throw Error('Existing articles must not be cleared');}});
  vm.runInContext('async '+extract('handleFile','renderPdfInfo'),c);
  await c.handleFile({name:'20261025m.pdf',type:'application/pdf',size:20,arrayBuffer:async()=>new ArrayBuffer(1)});
  assert.equal(c.state.articles.length,1);assert.equal(c.state.manual.batches[0].status,'done');assert.equal(c.state.manual.prepared,true);assert.equal(c.state.restoredSession,null);
});
test('a different PDF is refused before replacing the saved article state',async()=>{
  const c=setup();c.state.restoredSession={pdfName:'20261025m.pdf',pdfPageCount:8};const alerts=[];
  Object.assign(c,{alert:m=>alerts.push(m)});vm.runInContext('async '+extract('handleFile','renderPdfInfo'),c);
  await c.handleFile({name:'20261025e.pdf',type:'application/pdf',arrayBuffer(){throw Error('Wrong file must not be read');}});
  assert.equal(c.state.articles.length,1);assert.equal(c.state.pdfFile.name,'20261025m.pdf');assert.match(alerts[0],/同じPDF/);
});
function bannerContext({restoreFails=false,discardFails=false}={}){
  const elements=new Map(),removed=[];
  const el=id=>{if(!elements.has(id))elements.set(id,{classList:{add(){},remove(){}},disabled:false});return elements.get(id);};
  const banner={style:{},setAttribute(){},querySelector:selector=>el(selector.slice(1)),remove:()=>removed.push('banner')};
  const c=setup();Object.assign(c,{structuredClone,PRESETS:{nikkei:{}},document:{getElementById:()=>null,createElement:()=>banner,querySelector:()=>({insertBefore(){},querySelector:()=>({nextSibling:null})})},escapeHtml:String,applyPreset(){},ensureClassificationFields(){},renderSchemaTable(){},renderResults(){if(restoreFails)throw Error('render failed');},clearSession:async()=>{if(discardFails)throw Error('storage failed');},location:{reload:()=>removed.push('reload')}});
  vm.runInContext(html.slice(html.indexOf('function showRestoreBanner(session)'),html.lastIndexOf('</script>')),c);
  c.showRestoreBanner({pdfName:'20261025m.pdf',pdfPageCount:8,articles:rows,manual:c.state.manual});
  return {c,el,removed};
}
test('resume removes the banner only after rendering succeeds; restore failure remains retryable',()=>{
  const ok=bannerContext();ok.el('restoreYes').onclick();assert.deepEqual(ok.removed,['banner']);assert.equal(ok.c.state.articles.length,1);
  const failed=bannerContext({restoreFails:true});failed.el('restoreYes').onclick();assert.deepEqual(failed.removed,[]);assert.match(failed.el('restoreStatus').textContent,/保存データは保持/);
});
test('discard uses an inline confirmation; storage failure keeps its banner and buttons retryable',async()=>{
  const failed=bannerContext({discardFails:true});failed.el('restoreNo').onclick();assert.deepEqual(failed.removed,[]);
  await failed.el('restoreDiscardCommit').onclick();assert.deepEqual(failed.removed,[]);assert.equal(failed.el('restoreYes').disabled,false);assert.match(failed.el('restoreStatus').textContent,/破棄できません/);
  const ok=bannerContext();await ok.el('restoreDiscardCommit').onclick();assert.deepEqual(ok.removed,['reload']);
});
