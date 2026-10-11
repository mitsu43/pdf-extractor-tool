// Serialized by chrome.scripting; keep all dependencies inside this function.
export async function collectGeminiImages(expectedUrl,offset=0,job=null){
  const canonical=value=>{const u=new URL(value);return u.origin+u.pathname.replace(/\/$/,'');};
  if(location.origin!=='https://gemini.google.com'||canonical(location.href)!==canonical(expectedUrl))throw new Error('会話ページが切り替わりました。指定した会話で再試行してください。');
  let scope=document;
  if(job&&!job.importOnly){
    const turns=[...document.querySelectorAll('.conversation-container')].filter(t=>t.querySelector('user-query')?.textContent.includes('NIKKEI_JOB: '+job.id));
    if(turns.length!==1)throw new Error('送信記事と画像を一意に対応できません。');
    scope=turns[0].querySelector('model-response');
    if(!scope)throw new Error('記事の応答がありません。');
  }
  const candidates=[...scope.querySelectorAll('img')].filter(img=>/AI\s*生成|AI.generated|generated image/i.test(img.alt||''));
  const warnings=[];
  if(candidates.some(img=>!img.complete||!img.naturalWidth))warnings.push('読み込み中の画像は除き、表示済みの画像を取り込みました。');
  const seen=new Set(),images=candidates.filter(img=>{const src=img.currentSrc||img.src;if(!img.complete||img.naturalWidth<100||seen.has(src))return false;seen.add(src);return true;});
  if(!images.length)throw new Error('生成画像が見つかりません。Geminiにログインし、指定した会話で画像を表示してください。');
  if(job&&!job.articles&&images.length!==1)throw new Error('1記事に複数画像があります。自動対応を停止しました。');
  if(images.length>1000)throw new Error('一度に取り込める画像は1000枚までです。');
  const codes=[...document.querySelectorAll('code')].filter(n=>/^\d{3,}__.+\.(png|jpe?g|webp)$/i.test(n.textContent.trim()));
  const articleMap=new Map();
  const batchTargets=new Map();
  if(job?.articles){
    const nodes=[...scope.querySelectorAll('h1,h2,h3,h4,h5,h6,p,code')].filter(n=>!job.importOnly||images.some(img=>img.closest('model-response')===n.closest('model-response')));
    const markers=job.articles.map(a=>{
      const matching=nodes.filter(n=>{
        const ids=[...(n.textContent||'').matchAll(/ARTICLE_ID\s*[:：]\s*(\d{1,2}\/\d{1,2}_(?:morning|evening|regional|plusone|weekly|saturday)_\d+)/g)].map(m=>m[1]);
        return ids.length===1&&ids[0]===a.gid;
      });
      const unique=matching.filter(n=>!matching.some(parent=>parent!==n&&parent.contains(n)));
      if(unique.length>1)throw new Error('記事IDが応答内で重複しています：'+a.gid);
      return {article:a,node:unique[0]};
    }).filter(m=>m.node);
    markers.sort((a,b)=>a.node.compareDocumentPosition(b.node)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
    for(let m=0;m<markers.length;m++){
      const {article,node}=markers[m],next=markers[m+1]?.node;
      const local=images.filter(img=>(node.compareDocumentPosition(img)&Node.DOCUMENT_POSITION_FOLLOWING)&&(!next||(img.compareDocumentPosition(next)&Node.DOCUMENT_POSITION_FOLLOWING)));
      if(local.length!==1){warnings.push(article.gid+'：独立した画像1枚と対応できないため登録しません。');continue;}
      const range=document.createRange();range.setStartAfter(node);
      const response=node.closest('model-response')||scope;
      if(next&&response.contains(next))range.setEndBefore(next);else range.setEndAfter(response.lastChild);
      let text=range.toString().trim();
      if(job.explanation){
        const ids=[...job.explanation.matchAll(/ARTICLE_ID\s*[:：]\s*(\d{1,2}\/\d{1,2}_(?:morning|evening|regional|plusone|weekly|saturday)_\d+)/g)];
        const found=ids.filter(x=>x[1]===article.gid);
        if(found.length===1){const start=found[0],end=ids.find(x=>x.index>start.index);text=job.explanation.slice(start.index,end?.index??job.explanation.length);}
      }
      if(job.importOnly&&!['起','承','転','結'].every(stage=>text.includes('【'+stage+'】'))){
        const responses=[...document.querySelectorAll('model-response')].map(n=>n.querySelector('message-content')?.textContent||n.textContent||'');
        const sections=responses.flatMap(content=>{
          const ids=[...content.matchAll(/ARTICLE_ID\s*[:：]\s*(\d{1,2}\/\d{1,2}_(?:morning|evening|regional|plusone|weekly|saturday)_\d+)/g)];
          return ids.flatMap((id,index)=>id[1]===article.gid?[content.slice(id.index,ids[index+1]?.index??content.length)]:[]);
        }).filter(content=>['起','承','転','結'].every(stage=>content.includes('【'+stage+'】')));
        if(sections.length===1)text=sections[0];
      }
      if(!['起','承','転','結'].every(stage=>text.includes('【'+stage+'】'))){
        if(!job.allowImageOnly){warnings.push(article.gid+'：起承転結の説明が不足しているため登録しません。');continue;}
        warnings.push(article.gid+'：画像を記事IDで照合して取り込みました。起承転結の説明は未取得です。');
        batchTargets.set(local[0],{...article,explanation:''});continue;
      }
      batchTargets.set(local[0],{...article,explanation:text.slice(text.indexOf('【起】'),text.indexOf('【起】')+20000)});
    }
    if(!batchTargets.size)throw new Error('画像の直前にARTICLE_ID、直後に起承転結説明が必要です。対応不明・合成画像は自動登録しません。');
  }
  for(const node of document.querySelectorAll('code')){
    try{
      const data=JSON.parse(node.textContent.trim());
      if(data.version!==1||!Array.isArray(data.items)||data.items.length>100)continue;
      for(const item of data.items){
        if(typeof item.gid!=='string'||!/^\d{1,2}\/\d{1,2}_(morning|evening|regional|plusone|weekly|saturday)_\d+$/.test(item.gid)||typeof item.title!=='string')continue;
        articleMap.set(item.gid,{gid:item.gid,title:item.title.slice(0,300),explanation:typeof item.explanation==='string'?item.explanation.slice(0,20000):''});
      }
    }catch{}
  }
  const items=[],usedNames=new Set();let total=0,nextOffset=null;
  for(const [i,img] of images.entries()){
    if(i<offset)continue;
    if(job?.articles&&!batchTargets.has(img))continue;
    const src=img.currentSrc||img.src,url=new URL(src);
    const blobSource=src.startsWith('blob:https://gemini.google.com/');
    const httpsSource=url.protocol==='https:'&&(url.hostname==='gemini.google.com'||url.hostname.endsWith('.googleusercontent.com'));
    const dataSource=/^data:image\/(png|jpeg|webp);base64,/i.test(src);
    if(!blobSource&&!httpsSource&&!dataSource){warnings.push(`${i+1}枚目：生成画像の取得元が対応していません。`);continue;}
    const responseRoot=img.closest?.('model-response');
    const localCodes=responseRoot?codes.filter(n=>responseRoot.contains(n)):[];
    const localImages=responseRoot?images.filter(n=>responseRoot.contains(n)):[];
    // A gallery has no reliable correspondence to a preceding list of filenames.
    const previousImage=images[i-1];
    const preceding=localCodes.filter(n=>(n.compareDocumentPosition(img)&Node.DOCUMENT_POSITION_FOLLOWING)&&(!previousImage||(previousImage.compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING)));
    const code=preceding.length===1?preceding[0]:(localImages.length===1&&localCodes.length===1?localCodes[0]:null);
    let filename=code?.textContent.trim()||'Gemini-image-'+(i+1);
    if(usedNames.has(filename))filename='Gemini-image-'+(i+1);usedNames.add(filename);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    let response;
    try{
      try{response=await fetch(src,{signal:controller.signal,referrerPolicy:'no-referrer'});if(!response.ok)throw new Error('生成画像を取得できません（HTTP '+response.status+'）。');}
      catch(fetchError){
        // Reading an already displayed image still respects the browser's canvas origin checks.
        try{
          const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
          if(!canvas.height||canvas.width*canvas.height>64000000)throw fetchError;
          canvas.getContext('2d').drawImage(img,0,0);
          const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(fetchError),'image/png'));
          response=new Response(blob,{headers:{'content-type':blob.type}});
        }catch{throw fetchError;}
      }
      const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      if(!['image/jpeg','image/png','image/webp'].includes(type))throw new Error('画像以外のデータは取り込めません。');
      if(Number(response.headers.get('content-length'))>20*1024*1024)throw new Error('1枚20MB以内の画像を指定してください。');
      const reader=response.body.getReader(),chunks=[];let bytes=0;
      try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;
        if(bytes>20*1024*1024)throw new Error('1枚20MB以内の画像を指定してください。');chunks.push(chunk.value);}}
      catch(e){await reader.cancel().catch(()=>{});throw e;}
      if(total+bytes>30*1024*1024&&items.length){nextOffset=i;break;}
      total+=bytes;const blob=new Blob(chunks,{type});
      const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('画像を読み取れません。'));r.readAsDataURL(blob);});
      let explanation='';
      const nextCode=codes.find(n=>img.compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING);
      const nextImage=images[i+1];
      const boundary=nextCode&&(!nextImage||(nextCode.compareDocumentPosition(nextImage)&Node.DOCUMENT_POSITION_FOLLOWING))?nextCode:nextImage;
      const range=document.createRange();range.setStartAfter(img);
      if(boundary&&(!responseRoot||responseRoot.contains(boundary)))range.setEndBefore(boundary);else if(responseRoot)range.setEndAfter(responseRoot.lastChild);else range.setEndAfter(document.body.lastChild);
      const fragment=range.cloneContents();
      const blocks=[...fragment.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')].filter(n=>!n.parentElement?.closest('li'));
      const text=blocks.length?blocks.map(n=>n.textContent.trim()).filter(Boolean).join('\n\n'):range.toString();
      const marker=text.search(/【?(?:3|３|三|4|４|四)コマ(?:展開)?(?:の)?解説】?|【(?:起承転結(?:・4コマ)?解説|本文解説テキスト|解説テキスト|確定校正原稿・コマ順解説)】/);
      if(marker>=0)explanation=text.slice(marker).split(/\n\s*(?:記事\s*\d+|\d{3,}__)/)[0].trim().slice(0,20000);
      if(job?.articles){
        const target=batchTargets.get(img);
        filename=target.filename;explanation=target.explanation;
        articleMap.set(target.gid,{gid:target.gid,title:target.title,explanation});
      }else if(job){
        filename=job.filename;
        const content=responseRoot?.querySelector('message-content')?.textContent||'';
        const start=content.indexOf('【起】');
        explanation=start>=0?content.slice(start, start+20000):job.explanation;
        articleMap.set(job.gid,{gid:job.gid,title:job.title,explanation});
      }
      items.push({filename,dataUrl,explanation});
    }catch(e){warnings.push(`${i+1}枚目：${e.name==='AbortError'?'画像の取得が時間内に完了しませんでした。':e.message||'取得失敗'}`);}finally{clearTimeout(timer);}
  }
  if(canonical(location.href)!==canonical(expectedUrl))throw new Error('取得中に会話が切り替わりました。再試行してください。');
  if(!items.length)throw new Error(warnings.join('\n')||'画像を取得できませんでした。');
  return {version:1,items,articles:[...articleMap.values()],warnings,nextOffset};
}
