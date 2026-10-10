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
      const key='batch-ten-v1:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
      let queue=await access(key);
      if(!queue){
        const pending=figureRecords.filter(a=>!figureAssignments.some(x=>figureQueue[x.queueIndex]?.gid===a.gid));
        queue={jobs:PdfFigurePrompt.makeBatchJobs(pending,theme),results:{}};await access(key,queue);
      }
      const complete=a=>figureAssignments.some(x=>figureQueue[x.queueIndex]?.gid===a.gid);
      const doneCount=()=>figureRecords.filter(complete).length;
      for(const job of queue.jobs){
        if(stop)break;
        if(JSON.stringify(figureRecords)!==snapshot)throw new Error('記事データが変更されました。停止しました。');
        const cached=queue.results[job.id]||await access(key+':'+job.id);
        if(cached){
          await apply(cached);lock();
          if(!job.articles.every(complete))throw new Error('保存済みバッチに未取得記事があります。取得済み画像は保持しました。1記事ずつの再送はしません。');
          continue;
        }
        if(job.articles.every(complete))continue;
        const began=Date.now();
        while(!stop){
          if(JSON.stringify(figureRecords)!==snapshot)throw new Error('記事データが変更されました。');
          lock();
          const done=doneCount();
          const progress=document.getElementById('figureSequenceProgress');
          if(progress){progress.max=figureRecords.length;progress.value=done;}
          status.textContent=`取込 ${done}/${figureRecords.length}記事 ／ ${job.articles.length}記事を1回で生成中（独立${job.articles.length}枚）`;
          if(Date.now()-began>1800000)throw new Error('30分以内にバッチ完了を確認できませんでした。取得済み画像は保持しています。同じボタンで再開できます。自動再送信はしません。');
          const result=await FigureGeminiBridge.step(job);
          if(result.url)document.getElementById('figureConversationInput').value=result.url;
          if(result.status==='done'){
            await access(key+':'+job.id,result.pack);
            await apply(result.pack);
            lock();
            const missing=job.articles.filter(a=>!complete(a));
            if(missing.length)throw new Error(`${missing.length}記事が未取得です。取得済み画像は保持しました。1記事ずつの送信・自動再送はしません。対象：${missing.map(a=>a.gid).join(', ')}`);
            figureLog(`${job.articles.length}枚を一括取得・記事ID照合済み`,'ok');
            break;
          }
          if(result.status==='explaining')status.textContent=`取込 ${done}/${figureRecords.length}件 ／ ${job.articles.length}記事の説明を取得中`;
          await sleep(4000);
        }
        if(!stop)await sleep(4000);
      }
      const progress=document.getElementById('figureSequenceProgress');
      const done=doneCount();
      if(progress){progress.max=figureRecords.length;progress.value=done;}
      status.textContent=stop?`取込 ${done}/${figureRecords.length}件。停止済み。同じボタンで再開できます。`:`${done}件を10記事単位で自動取込しました。「まとめてサイト保存」で反映できます。`;
    }catch(e){status.textContent='停止：'+e.message;figureLog(e.message,'warn');}
    finally{running=false;start.disabled=false;start.textContent='10記事ずつ一括生成・再開';halt.disabled=true;locks.forEach(id=>document.getElementById(id).disabled=false);renderFigureQueue();}
  };
})();
