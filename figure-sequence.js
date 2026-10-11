(function(){
  'use strict';
  let running=false,stop=false;
  const status=document.getElementById('figureSequenceStatus');
  const copyMissing=document.getElementById('copyMissingFigurePromptBtn');
  let missingRecords=[];
  function partialStop(job,complete){
    missingRecords=job.articles.filter(a=>!complete(a)).map(a=>figureRecords.find(r=>r.gid===a.gid)).filter(Boolean);
    if(!missingRecords.length)return;
    if(copyMissing)copyMissing.hidden=true;
    throw new Error(`取得できた画像は保持しました。画像または説明が不足${missingRecords.length}記事：${missingRecords.map(a=>a.gid).join(', ')}。同じ会話の読み込み完了後に再開すると再取得します。自動再生成はしません。`);
  }
  function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('nikkei-figure-sequence',1);r.onupgradeneeded=()=>r.result.createObjectStore('queues');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function access(key,value){const d=await db();try{return await new Promise((resolve,reject)=>{const tx=d.transaction('queues',value===undefined?'readonly':'readwrite');const s=tx.objectStore('queues');const r=value===undefined?s.get(key):s.put(value,key);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('保存が中断されました'));});}finally{d.close();}}
  async function legacyQueues(){
    const d=await db();try{return await new Promise((resolve,reject)=>{
      const tx=d.transaction('queues','readonly'),s=tx.objectStore('queues'),keys=s.getAllKeys(),values=s.getAll();
      tx.oncomplete=()=>resolve(keys.result.map((key,i)=>({key,value:values.result[i]})).filter(x=>String(x.key).startsWith('batch-ten-v1:')&&Array.isArray(x.value?.jobs)));
      tx.onerror=tx.onabort=()=>reject(tx.error);
    });}finally{d.close();}
  }
  window.FigureSequence={async manualJob(records,theme){
    const key='publication-v1:'+figureScope;
    let queue=await access(key);
    if(!queue){
      const legacy=(await legacyQueues()).flatMap(x=>x.value.jobs.filter(j=>j.articles?.some(a=>records.some(r=>r.gid===a.gid&&r.title===a.title))).map(j=>({...j,recoveryOnly:true,legacyKey:x.key})));
      queue={jobs:[...new Map(legacy.map(j=>[j.id,j])).values()],results:{},phase:{}};
    }
    const overlapping=queue.jobs.filter(j=>j.articles.some(a=>records.slice(0,5).some(r=>r.gid===a.gid)));
    if(overlapping.length>1)throw new Error('既存ジョブが複数あります。生成済み会話から先に取り込んでください。');
    let job=overlapping[0];
    if(job&&job.articles.some(a=>figureArticleComplete(a)||!records.some(r=>r.gid===a.gid&&r.title===a.title)))throw new Error('既存ジョブに取得済み・変更済みの記事があります。再生成せず会話から取り込んでください。');
    if(!job){job=PdfFigurePrompt.makeBatchJob(records.slice(0,5),theme);queue.jobs.push(job);}
    queue.phase=queue.phase||{};queue.phase[job.id]='manual';
    await access(key,queue);return job;
  }};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function apply(pack){
    const files=FigureUrlImport.decode('NIKKEI_FIGURES_V1\n'+JSON.stringify(pack));
    await assignFigureFiles(files);
    for(const a of pack.articles||[]){if(!figureAssignments.some(x=>figureQueue[x.queueIndex]?.gid===a.gid))throw new Error('画像を記事へ取り込めませんでした。');}
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
      if(!figureQueue.length)await buildFigureQueue();
      await restoreFigureAssignments();
      if(figureAssignments.some(x=>x.queueIndex<0))throw new Error('対応未確認の画像があります。設定内の対応表を確認してください。新しい生成はしていません。');
      if(!figureQueue.length)throw new Error('先に記事を抽出してください。');
      const snapshot=JSON.stringify(figureRecords),theme=document.getElementById('figureExtraThemeInput').value.trim();
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot+'\n'+theme));
      const legacyKey='batch-ten-v1:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
      const complete=figureArticleComplete;
      const key='publication-v1:'+figureScope;
      let queue=await access(key);
      if(!queue){
        const exact=await access(legacyKey);
        const candidates=exact?[{key:legacyKey,value:exact}]:(await legacyQueues()).filter(x=>x.value.jobs.some(j=>j.articles?.some(a=>figureRecords.some(r=>r.gid===a.gid&&r.title===a.title))));
        const jobs=new Map();
        for(const old of candidates)for(const job of old.value.jobs){
          if(!job.articles?.some(a=>figureRecords.some(r=>r.gid===a.gid&&r.title===a.title)))continue;
          if(!job.articles.every(a=>figureRecords.some(r=>r.gid===a.gid&&r.title===a.title)))throw new Error('旧キューの記事と現在の記事が一部異なります。旧データを保持して停止しました。');
          jobs.set(job.id,{...job,recoveryOnly:true,legacyKey:old.key});
        }
        queue={jobs:[...jobs.values()],results:{},phase:{}};
        await access(key,queue);
      }
      queue.phase=queue.phase||{};
      const owners=new Map();
      for(const job of queue.jobs)for(const a of job.articles){
        if(complete(a))continue;
        if(!figureRecords.some(r=>r.gid===a.gid&&r.title===a.title))throw new Error('保存済みキューと記事タイトルが異なります。生成を停止しました。');
        if(owners.has(a.gid)&&owners.get(a.gid)!==job.id)throw new Error('同じ記事を含む保存済みジョブが複数あります。生成済み会話から画像を先に取り込んでください。再送しません。');
        owners.set(a.gid,job.id);
      }
      const pending=figureRecords.filter(a=>!complete(a)&&!owners.has(a.gid));
      if(pending.some(a=>figureAssignments.some(x=>figureQueue[x.queueIndex]?.gid===a.gid)))throw new Error('画像取得済み・説明未取得の記事があります。生成済み会話から取り込んでください。自動再生成しません。');
      const added=PdfFigurePrompt.makeBatchJobs(pending,theme);
      queue.jobs.push(...added);
      for(const job of added)queue.phase[job.id]='prepared';
      await access(key,queue);
      const doneCount=()=>figureRecords.filter(complete).length;
      for(const job of queue.jobs){
        if(stop)break;
        if(JSON.stringify(figureRecords)!==snapshot)throw new Error('記事データが変更されました。停止しました。');
        if(job.articles.every(complete))continue;
        const cached=queue.results[job.id]||await access(key+':'+job.id)||(job.legacyKey?(await access(job.legacyKey))?.results?.[job.id]||await access(job.legacyKey+':'+job.id):null);
        if(cached){
          await apply(cached);lock();
          if(job.articles.every(complete))continue;
        }
        const recoveryOnly=!!cached||!!job.recoveryOnly||queue.phase[job.id]!=='prepared';
        const began=Date.now();
        while(!stop){
          if(JSON.stringify(figureRecords)!==snapshot)throw new Error('記事データが変更されました。');
          lock();
          const done=doneCount();
          const progress=document.getElementById('figureSequenceProgress');
          if(progress){progress.max=figureRecords.length;progress.value=done;}
          status.textContent=`画像・説明 ${done}/${figureRecords.length}記事 ／ ${recoveryOnly?'既存会話から再取得中（画像再生成なし）':`${job.articles.length}記事を処理中（独立${job.articles.length}枚）`}`;
          if(Date.now()-began>1800000)throw new Error('30分以内にバッチ完了を確認できませんでした。取得済み画像は保持しています。同じボタンで再開できます。自動再送信はしません。');
          queue.phase[job.id]='checking';await access(key,queue);
          const result=await FigureGeminiBridge.step({...job,recoveryOnly},document.getElementById('figureConversationInput').value.trim(),async(pack,url)=>{
            if(url)document.getElementById('figureConversationInput').value=url;
            await access(key+':'+job.id+':page:'+Date.now(),pack);
            await apply(pack);lock();
          });
          if(result.status==='send-attempted')status.textContent=`${job.articles.length}記事の送信を操作しました。Geminiの受信確認待ちです（生成成功は未確認）。`;
          if(result.url&&document.getElementById('figureConversationInput').value!==result.url){document.getElementById('figureConversationInput').value=result.url;await persistFigureAssignments();}
          if(result.status==='done'){
            await access(key+':'+job.id,result.pack);
            await apply(result.pack);
            lock();
            const missing=job.articles.filter(a=>!complete(a));
            if(missing.length)partialStop(job,complete);
            queue.phase[job.id]='captured';await access(key,queue);
            figureLog(`${job.articles.length}枚を端末保存・記事ID照合済み（サイト保存は別）`,'ok');
            break;
          }
          if(result.status==='explaining')status.textContent=`取込 ${done}/${figureRecords.length}件 ／ 生成済み${job.articles.length}枚と記事をGeminiで照合中（再生成なし・操作不要）`;
          await sleep(4000);
        }
        if(!stop)await sleep(4000);
      }
      const progress=document.getElementById('figureSequenceProgress');
      const done=doneCount();
      if(progress){progress.max=figureRecords.length;progress.value=done;}
      status.textContent=stop?`取込 ${done}/${figureRecords.length}件。停止済み。同じボタンで再開できます。`:`${done}件を取り込みました。「まとめてサイト保存」で反映できます。`;
      if(!stop&&done===figureRecords.length&&document.getElementById('autoPublishFigures').checked){
        await publishFigures();
      }
    }catch(e){status.textContent='停止：'+e.message;figureLog(e.message,'warn');}
    finally{running=false;start.disabled=false;start.textContent='開始・続きから再開（5記事ずつ自動）';halt.disabled=true;locks.forEach(id=>document.getElementById(id).disabled=false);renderFigureQueue();}
  };
})();
