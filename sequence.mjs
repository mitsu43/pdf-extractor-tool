// Serialized into the explicitly linked Gemini tab. Never read other conversations.
export async function generationStep(job,allowSend=false) {
  try {
  if(location.origin!=='https://gemini.google.com')throw new Error('Gemini以外では生成しません。');
  const buttons=()=>[...document.querySelectorAll('button,[role="menuitem"],[role="menuitemcheckbox"]')];
  const label=e=>(e.getAttribute('aria-label')||e.textContent||'').trim();
  const find=re=>buttons().find(e=>re.test(label(e))&&e.getClientRects().length&&!e.disabled);
  const normalize=s=>s.replace(/\s+/g,' ').trim();
  const turns=[...document.querySelectorAll('.conversation-container')];
  const marker=(job.textOnly?'NIKKEI_EXPLANATION: ':'NIKKEI_JOB: ')+job.id;
  const matched=turns.filter(t=>{
    const text=t.querySelector('user-query')?.textContent||'';
    return normalize(text).endsWith(marker)||(job.prompt&&normalize(text)===normalize(job.prompt));
  });
  if(matched.length>1)throw new Error('同じ記事の送信が重複しています。自動処理を停止しました。');
  const stop=find(/回答を停止|Stop response/i);
  if(matched.length){
    const response=matched[0].querySelector('model-response');
    const candidates=response?[...response.querySelectorAll('img')].filter(i=>/AI\s*生成|AI.generated|generated image/i.test(i.alt)):[];
    const imgs=candidates.filter(i=>i.complete&&i.naturalWidth>100);
    if(stop||!response)return {status:'waiting',url:location.href,acknowledged:true};
    const text=response.querySelector?.('message-content')?.textContent||response.textContent||'';
    const explanation=['起','承','転','結'].every(x=>text.includes('【'+x+'】'))?text.slice(text.indexOf('【起】'),text.indexOf('【起】')+20000):'';
    if(job.textOnly){
      if(job.articles){
        const markers=[...text.matchAll(/ARTICLE_ID\s*[:：]\s*(\d{1,2}\/\d{1,2}_(?:morning|evening|regional|plusone|weekly|saturday)_\d+)/g)];
        const imageIndices=new Set();
        const complete=job.articles.every(a=>{
          const found=markers.filter(m=>m[1]===a.gid);
          if(found.length!==1)return false;
          const m=found[0],next=markers.find(n=>n.index>m.index);
          const section=text.slice(m.index,next?.index??text.length);
          if(job.requiresImageMap){
            const indices=[...section.matchAll(/IMAGE_INDEX\s*[:：]\s*(\d+)\b/g)];
            const index=Number(indices[0]?.[1]);
            const title=section.match(/正式記事タイトル\s*[:：]\s*([^\n]+)/)?.[1]?.trim();
            if(indices.length!==1||index<1||index>job.articles.length||imageIndices.has(index)||title!==a.title)return false;
            imageIndices.add(index);
          }
          return ['起','承','転','結'].every(stage=>section.includes('【'+stage+'】'));
        });
        if(complete)return {status:'ready-text',explanation:text.slice(0,100000),url:location.href};
        if(response.querySelector?.('button[aria-label*="コピー"],button[aria-label*="Copy"]'))throw new Error('バッチの説明または記事IDが不足しています。画像は再生成せず停止しました。');
        return {status:'waiting',url:location.href};
      }
      if(explanation)return {status:'ready-text',explanation,url:location.href};
      if(response.querySelector?.('button[aria-label*="コピー"],button[aria-label*="Copy"]'))throw new Error('4コマの説明が返りませんでした。画像は再生成せず停止します。');
      return {status:'waiting',url:location.href};
    }
    if(Array.isArray(job.articles)){
      if(candidates.some(i=>!i.complete||i.naturalWidth<100))return {status:'waiting',url:location.href};
      if(imgs.length)return {status:'ready',url:location.href,imageCount:imgs.length,expectedCount:job.articles.length};
    }
    if(imgs.length===1)return {status:'ready',explanation,url:location.href};
    if(imgs.length>1)throw new Error('1記事に複数画像が返りました。手動確認が必要です。');
    if(candidates.length)return {status:'waiting',url:location.href};
    if(/上限に達|利用制限|limit reached|cannot generate|生成できません|生成機能.*利用できません/i.test(text)||response.querySelector?.('button[aria-label*="コピー"],button[aria-label*="Copy"]'))throw new Error('画像が生成されていません。上限・拒否の表示をGeminiで確認してください。自動再生成はしません。');
    return {status:'waiting',url:location.href};
  }
  if(!allowSend){
    const input=document.querySelector('[contenteditable="true"][role="textbox"],rich-textarea [contenteditable="true"]');
    return {status:'missing',url:location.href,draftPresent:!!input?.textContent&&normalize(input.textContent)===normalize(job.prompt)};
  }
  if(stop)throw new Error('Geminiが別の応答を生成中です。完了後に再開してください。');
  const input=document.querySelector('[contenteditable="true"][role="textbox"],rich-textarea [contenteditable="true"]');
  if(!input)throw new Error('入力欄がありません。Geminiにログインしてください。');
  const existing=normalize(input.textContent);
  if(existing&&existing!==normalize(job.prompt))throw new Error('入力中の文章があります。上書きせず停止しました。');
  const imageMode=find(/画像の選択を解除|Deselect.*image/i);
  if(job.textOnly&&imageMode){imageMode.click();return {status:'preparing'};}
  if(!job.textOnly&&!imageMode){
    const image=find(/^画像を作成$|^Create images?$/i);
    if(image){image.click();return {status:'preparing'};}
    const menu=find(/^アップロードとツール$|^Tools$|^Uploads and tools$/i);
    if(!menu)throw new Error('画像作成メニューが見つかりません。Geminiで「画像を作成」を選んで再開してください。');
    menu.click();return {status:'preparing'};
  }
  if(existing!==normalize(job.prompt)){
    input.focus();
    const range=document.createRange();range.selectNodeContents(input);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    if(!document.execCommand('insertText',false,job.prompt))throw new Error('Gemini入力欄への編集操作を反映できません。送信はしていません。');
    input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:job.prompt}));
    if(normalize(input.textContent)!==normalize(job.prompt))throw new Error('入力した指示文が一致しません。送信はしていません。');
    return {status:'preparing'};
  }
  const send=find(/^プロンプトを送信$|^Send message$|^Send$/i);
  if(!send)throw new Error('送信ボタンを確認できません。入力内容を保ったまま停止しました。');
  if(allowSend!=='commit')return {status:'armed',url:location.href};
  send.click();return {status:'send-attempted',url:location.href};
  } catch(error) {
    return {status:'error',error:error.message||String(error),url:location.href};
  }
}
