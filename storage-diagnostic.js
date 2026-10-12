// Read-only collector for the diagnostic page. Loading this file opens no databases.
// No app functions, ping, network, storage writes or clipboard writes.
(() => {
  'use strict';
async function collect() {
  const report = {version:'persistent-readonly-20261012-2', observedAt:new Date().toISOString(),
    originalTabMemory:'NOT_INSPECTED', sendOutcome:'UNKNOWN', snapshot:'Per-store only; concurrent changes are possible'};
  const emit = () => report;
  const production = location.origin === 'https://mitsu43.github.io' && location.pathname === '/pdf-extractor-tool/connection-check.html';
  const preview = /^http:\/\/127\.0\.0\.1:\d+$/.test(location.origin) && location.pathname === '/connection-check.html';
  if (!production && !preview) {
    report.status='WRONG_ORIGIN_OR_PATH'; return emit();
  }
  report.context=production?'diagnostic-page':'local-preview';
  report.productionStorage = production;
  const names=['pdfExtractorDB','nikkei-figure-sequence','nikkei-figure-artifacts-v1'];
  const editions=new Set(['morning','evening','regional','plusone','weekly','saturday']);
  const scope = key => {
    try { const x=JSON.parse(key); return Array.isArray(x)&&x.length===2&&/^\d{4}-\d{2}-\d{2}$/.test(x[0])&&editions.has(x[1])?{date:x[0],edition:x[1]}:null; } catch { return null; }
  };
  const timestamp = x => { if(typeof x!=='number'&&typeof x!=='string')return null;const d=new Date(x);return Number.isFinite(d.getTime())?d.toISOString():null; };
  const id = x => typeof x==='string'&&/^[-a-z0-9]{20,80}$/i.test(x)?x:'UNRECOGNIZED_ID';
  const phases=new Set(['prepared','checking','captured','manual']);
  const articles = v => Array.isArray(v)?v.length:null;
  const stats = items => {
    if(!Array.isArray(items))return {items:null};
    let files=0,bytes=0,explanations=0,markedCaptured=0;
    for(const x of items){
      if(x?.file instanceof Blob){files++;bytes+=x.file.size;}
      if(typeof x?.explanation==='string'&&['起','承','転','結'].every(k=>x.explanation.includes('【'+k+'】')))explanations++;
      if(x?.state==='ARTIFACTS_CAPTURED')markedCaptured++;
    }
    return {items:items.length,blobFiles:files,blobBytes:bytes,explanationsWithFourMarkers:explanations,markedCaptured};
  };
  function summary(db,store,key,v){
    if(db==='pdfExtractorDB')return {current:key==='current',articles:articles(v?.articles),savedAt:timestamp(v?.savedAt)};
    if(db==='nikkei-figure-artifacts-v1')return {scope:scope(String(key)),...stats(v?.items),updatedAt:timestamp(v?.updatedAt),hasConversationUrl:!!v?.conversationUrl};
    const s=typeof key==='string'&&key.startsWith('publication-v1:')?scope(key.slice('publication-v1:'.length)):null;
    if(!Array.isArray(v?.jobs))return {type:'cached-result-or-page',items:articles(v?.items),articles:articles(v?.articles)};
    return {type:'queue',scope:s,legacyKey:typeof key==='string'&&key.startsWith('batch-ten-v1:'),jobsTotal:v.jobs.length,jobsTruncated:v.jobs.length>500,
      jobs:v.jobs.slice(0,500).map(j=>({id:id(j?.id),phase:phases.has(v.phase?.[j?.id])?v.phase[j.id]:'UNKNOWN',recoveryOnly:!!j?.recoveryOnly,articles:articles(j?.articles)}))};
  }
  let listed;
  try {
    if(typeof indexedDB.databases!=='function')throw new Error('UNSUPPORTED');
    let timer;
    try {
      listed=await Promise.race([indexedDB.databases(),new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('TIMEOUT')),5000);
      })]);
    } finally { clearTimeout(timer); }
  } catch {report.status='DATABASE_ENUMERATION_UNAVAILABLE';return emit();}
  // Never guess/open an absent name. Abort a race-triggered upgrade before any schema operation.
  const existing=new Set(listed.map(x=>x.name));
  function openExisting(name){return new Promise(resolve=>{
    let finished=false,r;
    const done=value=>{if(finished)return;finished=true;clearTimeout(timer);resolve(value);};
    const timer=setTimeout(()=>done({status:'OPEN_TIMEOUT'}),5000);
    try{r=indexedDB.open(name);}catch{done({status:'OPEN_ERROR'});return;}
    r.onupgradeneeded=()=>{r.transaction.abort();};
    r.onerror=()=>done({status:'OPEN_ABORTED_OR_FAILED'});
    r.onblocked=()=>done({status:'OPEN_BLOCKED'});
    r.onsuccess=()=>{if(finished){r.result.close();return;}done({db:r.result});};
  });}
  function readStore(db,name,store){return new Promise(resolve=>{
    if(!db.objectStoreNames.contains(store)){resolve({status:'STORE_ABSENT'});return;}
    let tx,rows=[],truncated=false,finished=false;
    const done=value=>{if(finished)return;finished=true;clearTimeout(timer);resolve(value);};
    const timer=setTimeout(()=>{try{tx?.abort();}catch{}done({status:'READ_TIMEOUT'});},5000);
    try{
      tx=db.transaction(store,'readonly');
      tx.onabort=tx.onerror=()=>done({status:'READ_FAILED'});
      tx.oncomplete=()=>done({status:'READ_OK',rows,truncated});
      const s=tx.objectStore(store);
      if(store==='history'){
        const r=s.count();r.onsuccess=()=>rows.push({records:r.result});return;
      }
      const r=s.openCursor();
      r.onsuccess=()=>{
        const c=r.result;if(!c)return;
        if(rows.length>=2000){truncated=true;return;}
        try{rows.push(summary(name,store,c.key,c.value));c.continue();}
        catch{try{tx.abort();}catch{}done({status:'SUMMARY_FAILED'});}
      };
    }catch{try{tx?.abort();}catch{}done({status:'READ_SETUP_FAILED'});}
  });}
  report.databases={};
  for(const name of names){
    if(!existing.has(name)){report.databases[name]={status:'ABSENT_IN_THIS_CONTEXT'};continue;}
    const opened=await openExisting(name);
    if(!opened.db){report.databases[name]=opened;continue;}
    const db=opened.db;
    try{
      const stores=name==='pdfExtractorDB'?['sessions']:name==='nikkei-figure-sequence'?['queues']:['current','history'];
      const out={version:db.version,stores:{}};
      for(const s of stores)out.stores[s]=await readStore(db,name,s);
      report.databases[name]=out;
    }finally{db.close();}
  }
  report.status='INSPECTION_FINISHED_CHECK_EACH_STORE';
  return emit();
}
  globalThis.NikkeiStorageDiagnostic = Object.freeze({collect});
})();
