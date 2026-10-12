(function(root){
  'use strict';
  // Additive database: the legacy queue database is never deleted or upgraded.
  const DB='nikkei-figure-artifacts-v1';
  function open(){return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB,1);
    r.onupgradeneeded=()=>{r.result.createObjectStore('current');r.result.createObjectStore('history');};
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    r.onblocked=()=>reject(new Error('画像保存DBを開けません。他の抽出ツールのタブを確認してください。'));
  });}
  async function transact(stores,mode,work){
    const d=await open();try{return await new Promise((resolve,reject)=>{
      const tx=d.transaction(stores,mode);let result;
      tx.oncomplete=()=>resolve(result?.result);
      tx.onerror=tx.onabort=()=>reject(tx.error||new Error('画像保存が中断されました。再読み込みせず再試行してください。'));
      try{result=work(tx);}catch(e){tx.abort();reject(e);}
    });}finally{d.close();}
  }
  function scope(date,edition){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!edition)throw new Error('画像の保存には年を含む日付と版が必要です。');
    return JSON.stringify([date,edition]);
  }
  const identity=a=>JSON.stringify([a.gid,a.title,a.date,a.edition]);
  const complete=x=>Number(x.file?.size)>0&&['起','承','転','結'].every(s=>String(x.explanation||'').includes('【'+s+'】'));
  function merge(existing,incoming,queue){
    const result=existing.slice();
    for(const item of incoming){
      const article=queue[item.queueIndex];
      const index=article?result.findIndex(x=>queue[x.queueIndex]&&identity(queue[x.queueIndex])===identity(article)):-1;
      if(index<0){result.push(item);continue;}
      const old=result[index];
      // A paginated retry may contain the image but not its already captured explanation.
      result[index]={...item,explanation:String(item.explanation||'').trim()?item.explanation:old.explanation||''};
    }
    return result;
  }
  async function save(key,queue,assignments,conversationUrl=''){
    const value={version:1,scope:key,updatedAt:new Date().toISOString(),conversationUrl,
      items:assignments.map(x=>({...x,article:queue[x.queueIndex]?{...queue[x.queueIndex],source:undefined}:x.article,
        filename:x.file?.name||x.filename||'image',mime:x.file?.type||x.mime||'',state:complete(x)?'ARTIFACTS_CAPTURED':'PARTIALLY_GENERATED'}))};
    // File/Blob structured cloning keeps the bytes, without depending on custom File properties.
    return transact(['current','history'],'readwrite',tx=>{
      const s=tx.objectStore('current'),old=s.get(key);
      old.onsuccess=()=>{if(old.result)tx.objectStore('history').put(old.result,key+':'+crypto.randomUUID());s.put(value,key);};
      return old;
    });
  }
  async function restore(key,queue){
    const value=await transact(['current'],'readonly',tx=>tx.objectStore('current').get(key));
    if(!value)return {items:[],conversationUrl:''};
    return {...value,items:value.items.map(x=>({...x,
      file:x.file instanceof Blob?new File([x.file],x.filename,{type:x.mime}):null,
      queueIndex:x.article?queue.findIndex(a=>identity(a)===identity(x.article)):-1}))};
  }
  root.FigureRecovery={scope,identity,complete,merge,save,restore};
})(window);
