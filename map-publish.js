(() => {
  'use strict';
  const MAP='https://nikkei-map.pages.dev';
  const CHANNEL='nikkei-import-v1';
  const SESSION_KEY='nikkei-publish-pending-v2';
  const editionLabels={morning:'朝刊',evening:'夕刊',regional:'地方版',plusone:'プラスワン',weekly:'週刊',saturday:'土曜版'};
  const panel=document.querySelector('.map-update-panel');
  if(!panel)return;
  panel.innerHTML=`
    <div class="map-update-head">
      <span class="map-update-title">日経記事マップへ反映</span>
      <div class="map-update-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="publishPreview">1. 更新内容を確認</button>
        <button type="button" class="btn btn-primary btn-sm" id="publishCommit" disabled>2. 本番へ反映</button>
      </div>
    </div>
    <div class="map-update-grid">
      <div class="field"><label>日付</label><input type="date" id="publishDate"></div>
      <div class="field"><label>版</label><output id="publishEdition">-</output></div>
      <div class="field"><label>抽出結果</label><output id="publishCount">0件</output></div>
    </div>
    <div class="map-update-note">既存JSONの読み込み・保存・iCloudへの置換・Codexへの依頼は不要です。対象の日付・版だけを更新し、それ以外の記事は保持します。</div>
    <div class="map-update-log" id="publishStatus" role="status">抽出完了後、「更新内容を確認」を押してください。</div>`;
  const get=id=>document.getElementById(id);
  const say=text=>{get('publishStatus').textContent=text;};
  let popup=null, preview=null, fingerprint='', busy=false;
  const calls=new Map();

  function activeMeta(){
    return typeof parseNikkeiFilename==='function' ? parseNikkeiFilename(state.pdfFile?.name||'') : null;
  }

  function activeEdition(){
    const code=activeMeta()?.edition;
    return ({m:'morning',e:'evening',r:'regional',p:'plusone'})[code]||document.getElementById('mapEditionSelect')?.value||'morning';
  }

  function syncMeta(){
    get('publishDate').value=activeMeta()?.isoDate||document.getElementById('mapDateInput')?.value||new Date().toISOString().slice(0,10);
    const edition=activeEdition();
    get('publishEdition').textContent=editionLabels[edition]||edition;
    get('publishCount').textContent=`${state.articles.length}件`;
  }
  syncMeta();
  addEventListener('nikkei-file-metadata',syncMeta);

  try{
    const saved=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
    if(saved){preview=saved.preview;fingerprint=saved.fingerprint;get('publishCommit').disabled=false;say('前回の反映結果を同じ更新IDで確認できます。');}
  }catch{}

  addEventListener('message',event=>{
    if(event.origin!==MAP||event.source!==popup||event.data?.channel!==CHANNEL)return;
    const call=calls.get(event.data.id);if(!call)return;
    calls.delete(event.data.id);clearTimeout(call.timer);
    if(event.data.error)call.reject(Object.assign(new Error(event.data.error),{status:event.data.status}));
    else call.resolve(event.data.result);
  });

  function rpc(action,body){return new Promise((resolve,reject)=>{
    if(!popup||popup.closed)return reject(new Error('接続画面を開き直してください'));
    const id=crypto.randomUUID();
    const timer=setTimeout(()=>{calls.delete(id);reject(new Error('接続画面から応答がありません。接続状態を確認してください。'));},60000);
    calls.set(id,{resolve,reject,timer});
    popup.postMessage({channel:CHANNEL,id,action,body},MAP);
  });}

  function connect(){
    if(!popup||popup.closed)popup=open(`${MAP}/article-import.html`,'nikkei-map-import');
    return Boolean(popup);
  }

  function input(){
    if(state.preset!=='nikkei')throw new Error('日経新聞用の抽出結果を選んでください');
    if(state.running||state.resume||state.stopRequested||!state.articles.length)throw new Error('抽出が完了していません');
    if(state.manual){
      if(state.manual.testOnly||state.manual.sourceName!==state.pdfFile?.name||state.manual.maxPages!==state.pdfPageCount||!state.manual.batches?.length||!state.manual.batches.every(batch=>batch.status==='done'))throw new Error('全バッチを完了してください');
    }else if(!state.publishComplete)throw new Error('全ページの抽出完了後に反映できます');
    const validation=runValidation();
    if(!validation.allOk)throw new Error('品質検査に未合格の項目があります');
    const date=get('publishDate').value;
    const edition=activeEdition();
    const sourceDate=document.getElementById('mapDateInput');
    if(sourceDate)sourceDate.value=date;
    const records=buildMapRecordsFromCurrent(date,edition).map(record=>({...record,date:mapDateKey(date),edition}));
    return {date,edition,mode:'replace',complete:true,reviewed:true,expectedCount:records.length,records};
  }

  async function digest(value){
    const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))));
    return [...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
  }

  get('publishPreview').onclick=async()=>{
    if(busy)return;
    syncMeta();
    if(!connect()){say('接続画面を開けません。ポップアップを許可してください。');return;}
    busy=true;get('publishCommit').disabled=true;say('更新内容を確認しています。');
    try{
      const payload=input();
      fingerprint=await digest(payload);
      await rpc('ping',{});
      preview=await rpc('preview',{input:payload});
      sessionStorage.setItem(SESSION_KEY,JSON.stringify({preview,fingerprint}));
      say(`${preview.date} ${editionLabels[preview.edition]||preview.edition}: ${preview.incoming}件を反映します。既存${preview.existing}件、新規${preview.added}件、更新${preview.updated}件、除外${preview.removed}件。対象外${preview.preserved}件は保持します。`);
      get('publishCommit').disabled=false;
    }catch(error){say(error.message);}finally{busy=false;}
  };

  get('publishCommit').onclick=async()=>{
    if(busy||!preview)return;
    if(!connect()){say('接続画面を開けません。');return;}
    busy=true;get('publishCommit').disabled=true;
    try{
      if(!preview.sent&&await digest(input())!==fingerprint)throw Object.assign(new Error('確認後に内容が変わりました。更新内容を確認し直してください。'),{status:409});
      preview.sent=true;sessionStorage.setItem(SESSION_KEY,JSON.stringify({preview,fingerprint}));
      const result=await rpc('commit',{previewId:preview.previewId,requestId:preview.requestId});
      say(`本番反映済み: ${result.date} ${editionLabels[result.edition]||result.edition} ${result.incoming}件。更新前データも自動バックアップしました。`);
      preview=null;sessionStorage.removeItem(SESSION_KEY);
    }catch(error){
      say(error.message);
      if(error.status===409){preview=null;sessionStorage.removeItem(SESSION_KEY);}
      else get('publishCommit').textContent='2. 同じ更新を再確認';
    }finally{busy=false;get('publishCommit').disabled=!preview;}
  };
})();
