// No credentials here: authentication stays in the map's first-party Access session.
(() => {
  'use strict';
  const MAP='https://nikkei-map.pages.dev', CHANNEL='nikkei-import-v1', KEY='nikkei-publish-pending-v1';
  const panel=document.createElement('section'); panel.className='map-update-panel';
  panel.innerHTML=`<h3>日経マップへ直接追加</h3><p>既存JSONの選択・保存・アップロードは不要です。上の日付・版区分を確認してください。</p>
  <label>更新方法 <select id="publishMode"><option value="replace">同日同版を差し替え（全紙面がそろった場合）</option><option value="append">追加・同じ見出しを更新（分割PDFの場合）</option></select></label>
  <p><label><input type="checkbox" id="publishReviewed">抽出結果の内容・件数・日付・版と、対象PDFの全ページ完了を確認しました</label></p>
  <button type="button" class="btn btn-secondary" id="publishPreview">接続・更新内容を確認</button>
  <button type="button" class="btn btn-primary" id="publishCommit" disabled>日経マップへ追加</button>
  <p id="publishStatus" role="status">抽出完了後に更新内容を確認できます。</p>`;
  document.querySelector('.map-update-panel').after(panel);
  const el=id=>document.getElementById(id), say=s=>el('publishStatus').textContent=s;
  let popup,preview=null,fingerprint='',busy=false;
  const calls=new Map();
  try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');if(saved){preview=saved.preview;fingerprint=saved.fingerprint;el('publishCommit').disabled=false;el('publishCommit').textContent='前回の反映結果を確認・再送';say('前回の送信結果を確認できます。内容を変更していても同じ更新IDで結果を照会します。');}}catch{}
  window.addEventListener('message',e=>{
    if(e.origin!==MAP||e.source!==popup||e.data?.channel!==CHANNEL)return;
    const call=calls.get(e.data.id);if(!call)return;calls.delete(e.data.id);clearTimeout(call.timer);
    if(e.data.error)call.reject(Object.assign(new Error(e.data.error),{status:e.data.status}));else call.resolve(e.data.result);
  });
  function rpc(action,body){return new Promise((resolve,reject)=>{
    if(!popup||popup.closed)return reject(new Error('「接続・更新内容を確認」で接続画面を開いてください'));
    const id=crypto.randomUUID(),timer=setTimeout(()=>{calls.delete(id);reject(new Error('応答を確認できません。接続画面のログイン状態を確認し、同じ操作を再試行してください。'));},60000);
    calls.set(id,{resolve,reject,timer});popup.postMessage({channel:CHANNEL,id,action,body},MAP);
  });}
  function input(){
    if(state.preset!=='nikkei')throw new Error('日経新聞用の抽出結果を選んでください');
    if(state.running||state.resume||state.stopRequested||!state.articles.length)throw new Error('抽出が未完了です');
    if(state.manual){if(state.manual.testOnly||state.manual.sourceName!==state.pdfFile?.name||state.manual.maxPages!==state.pdfPageCount||!state.manual.batches?.length||!state.manual.batches.every(b=>b.status==='done'))throw new Error('全バッチを完了してください');}
    else if(!state.publishComplete)throw new Error('全ページ抽出が正常完了した結果が必要です。途中保存・お試し結果は送信できません');
    if(!el('publishReviewed').checked)throw new Error('内容・件数と対象ページの確認にチェックしてください');
    if(!runValidation().allOk)throw new Error('品質検査に未合格の項目があります');
    const date=el('mapDateInput').value,edition=el('mapEditionSelect').value;
    const records=buildMapRecordsFromCurrent();
    return {date,edition,mode:el('publishMode').value,complete:true,reviewed:true,expectedCount:records.length,records};
  }
  async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');}
  function connect(){if(!popup||popup.closed)popup=window.open(MAP+'/article-import.html','nikkei-map-import');return !!popup;}
  el('publishPreview').onclick=async()=>{
    if(busy)return;
    if(!connect())return say('接続画面を開けません。ポップアップを許可してください。');
    if(preview){say('前回の更新IDを保持しています。「前回の反映結果を確認・再送」で結果を確認してください。');return;}
    busy=true;el('publishCommit').disabled=true;
    say('接続画面で初回ログインを完了してください。初回は戻ってこのボタンをもう一度押してください。');
    try{
      const payload=input();fingerprint=await digest(payload);
      // First click opens the login tab; no hidden credential transfer or automatic write.
      await rpc('ping',{}); preview=await rpc('preview',{input:payload});
      sessionStorage.setItem(KEY,JSON.stringify({preview,fingerprint}));
      say(`${preview.date} ${MAP_ED_LABEL[preview.edition]}：既存${preview.existing}件 → 受信${preview.incoming}件。新規${preview.added}件・更新${preview.updated}件・除外${preview.removed}件。全体${preview.before}件 → ${preview.after}件。対象外の記事は保持します。${preview.reassignedIds ? ` 既存ID重複のため対象内${preview.reassignedIds}件に新IDを割り当てます。` : ''}`);
      el('publishCommit').disabled=false;
    }catch(e){say(e.message);}finally{busy=false;}
  };
  el('publishCommit').onclick=async()=>{
    if(busy||!preview)return;
    if(!connect())return say('接続画面を開けません');
    busy=true;el('publishCommit').disabled=true;
    try{
      // Once sent, retain IDs for retries even when the user edits the extraction.
      if(!preview.sent && await digest(input())!==fingerprint)throw Object.assign(new Error('確認後に内容が変わりました。更新内容を確認し直してください'),{status:409});
      preview.sent=true;sessionStorage.setItem(KEY,JSON.stringify({preview,fingerprint}));
      const r=await rpc('commit',{previewId:preview.previewId,requestId:preview.requestId});
      say(`公開反映済み：${r.incoming}件。全体${r.after}件。更新前バックアップを保存しました。版：${r.version}`);
      preview=null;sessionStorage.removeItem(KEY);el('publishReviewed').checked=false;el('publishCommit').textContent='日経マップへ追加';
    }catch(e){
      say(e.message);
      if(e.status===409){preview=null;sessionStorage.removeItem(KEY);}
      else el('publishCommit').textContent='同じ更新を再送・結果確認';
    }finally{busy=false;el('publishCommit').disabled=!preview;}
  };
})();
