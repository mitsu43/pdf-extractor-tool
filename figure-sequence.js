(function(){
  'use strict';
  let running=false,stop=false;
  const status=document.getElementById('figureSequenceStatus');
  function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('nikkei-figure-sequence',1);r.onupgradeneeded=()=>r.result.createObjectStore('queues');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function access(key,value){const d=await db();try{return await new Promise((resolve,reject)=>{const tx=d.transaction('queues',value===undefined?'readonly':'readwrite');const s=tx.objectStore('queues');const r=value===undefined?s.get(key):s.put(value,key);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('保存が中断されました'));});}finally{d.close();}}
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function apply(pack){
    const files=FigureUrlImport.decode('NIKKEI_FIGURES_V1\n'+JSON.stringify(pack));
    await assignFigureFiles(files);
    for(const a of pack.articles){if(!figureAssignments.some(x=>figureQueue[x.queueIndex]?.gid===a.gid))throw new Error('画像を記事へ取り込めませんでした。');}
  }
  document.getElementById('stopFigureSequenceBtn').onclick=()=>{stop=true;status.textContent='停止要求済み（送信済みの生成は継続）';};
  document.getElementById('startFigureSequenceBtn').onclick=async()=>{
    if(running)return;
    running=true;stop=false;
    const start=document.getElementById('startFigureSequenceBtn'),halt=document.getElementById('stopFigureSequenceBtn');
    start.disabled=true;halt.disabled=false;
    const locks=['buildFigureQueueBtn','nextFigurePromptBtn','importFigureConversationBtn','clearFigureFilesBtn','selectFigureFilesBtn','publishFiguresBtn'];
    const lock=()=>locks.forEach(id=>document.getElementById(id).disabled=true);
    try{
      if(!figureQueue.length)buildFigureQueue();
      if(!figureQueue.length)throw new Error('先に記事を抽出してください。');
      const snapshot=JSON.stringify(figureRecords),theme=document.getElementById('figureExtraThemeInput').value.trim();
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot+'\n'+theme));
      const key=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
      let queue=await access(key);
      if(!queue){queue={jobs:figureRecords.map(a=>PdfFigurePrompt.makeJob(a,theme)),results:{}};await access(key,queue);}
      for(const job of queue.jobs){
        if(stop)break;
        if(JSON.stringify(figureRecords)!==snapshot)throw new Error('記事データが変更されました。停止しました。');
        if(queue.results[job.id]){await apply(queue.results[job.id]);lock();continue;}
        if(figureAssignments.some(a=>figureQueue[a.queueIndex]?.gid===job.gid))continue;
        const began=Date.now();
        while(!stop){
          if(JSON.stringify(figureRecords)!==snapshot)throw new Error('記事データが変更されました。');
          lock();
          status.textContent=`${queue.jobs.indexOf(job)+1}/${queue.jobs.length}：${job.title}`;
          if(Date.now()-began>240000)throw new Error('4分以内に完了を確認できませんでした。Geminiを確認後、再開してください。再送信はしません。');
          const result=await FigureGeminiBridge.step(job);
          if(result.url)document.getElementById('figureConversationInput').value=result.url;
          if(result.status==='done'){
            queue.results[job.id]=result.pack;
            await access(key,queue);
            await apply(result.pack);
            lock();
            figureLog(`画像を取得・記事ID照合済み：${job.title}`,'ok');
            break;
          }
          await sleep(4000);
        }
        if(!stop)await sleep(4000);
      }
      status.textContent=stop?'停止済み。同じボタンで再開できます。':'全記事の画像を取得しました。内容を確認して保存してください。';
    }catch(e){status.textContent='停止：'+e.message;figureLog(e.message,'warn');}
    finally{running=false;start.disabled=false;halt.disabled=true;locks.forEach(id=>document.getElementById(id).disabled=false);renderFigureQueue();}
  };
})();
