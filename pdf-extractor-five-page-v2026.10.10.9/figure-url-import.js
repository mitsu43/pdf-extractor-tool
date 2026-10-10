(function(root){
  'use strict';
  const PREFIX='NIKKEI_FIGURES_V1\n',LIMIT=80*1024*1024;
  function classify(value){
    let url;try{url=new URL(String(value).trim());}catch{throw new Error('URLを正しく入力してください。');}
    if(url.protocol!=='https:'||url.username||url.password)throw new Error('ユーザー名・パスワードを含まないHTTPSのURLを指定してください。');
    if(url.hostname==='gemini.google.com')return {kind:'gemini',url:url.href};
    if(url.hostname==='localhost'||url.hostname.endsWith('.local')||url.hostname.includes(':')||/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname))throw new Error('公開された画像・ZIPのURLを指定してください。');
    return {kind:'file',url:url.href};
  }
  async function download(value){
    const parsed=classify(value);
    if(parsed.kind==='gemini')throw new Error('Geminiの会話URLから画像は取得できません。Gemini側で一括コピーしてください。');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try{
      const r=await fetch(parsed.url,{credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
      if(!r.ok)throw new Error('URLから取得できませんでした（HTTP '+r.status+'）。');
      const type=(r.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
      const path=new URL(r.url||parsed.url).pathname;
      const zip=type==='application/zip'||type==='application/x-zip-compressed'||(/\.zip$/i.test(path)&&type==='application/octet-stream');
      if(!zip&&!['image/jpeg','image/png','image/webp'].includes(type))throw new Error('このURLは画像・ZIPの実ファイルではありません。会話ページやダウンロード案内ページは取り込めません。');
      const max=zip?LIMIT:20*1024*1024;
      if(Number(r.headers.get('Content-Length'))>max)throw new Error('取得ファイルが大きすぎます。');
      const reader=r.body.getReader(),chunks=[];let bytes=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max)throw new Error('取得ファイルが大きすぎます。');chunks.push(value);}}
      catch(e){await reader.cancel().catch(()=>{});throw e;}
      let name;try{name=decodeURIComponent(path.split('/').pop()||'');}catch{name='';}
      const ext=zip?'zip':({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[type];
      name=(name||'url-image').replace(/[\\/\x00-\x1f]/g,'_').slice(0,220);
      if(!new RegExp('\\.'+ext+'$','i').test(name))name+='.'+ext;
      return new File(chunks,name,{type:zip?'application/zip':type});
    }catch(e){if(e.name==='AbortError')throw new Error('URLの取得が時間内に完了しませんでした。');if(e instanceof TypeError)throw new Error('URLへのアクセスが許可されていません。ログイン制限・サイト間アクセス制限の場合は、画像をコピーして貼り付けてください。');throw e;}
    finally{clearTimeout(timer);}
  }
  function decode(text){
    if(!String(text).startsWith(PREFIX))return null;
    if(text.length>LIMIT*1.4)throw new Error('画像は合計80MB以内でコピーしてください。');
    const pack=JSON.parse(text.slice(PREFIX.length));
    if(pack.version!==1||!Array.isArray(pack.items)||!pack.items.length||pack.items.length>1000)throw new Error('取込データの形式・件数が不正です。');
    let total=0;
    return pack.items.map((item,i)=>{
      const match=String(item.dataUrl).match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
      if(!match)throw new Error('コピーされた画像形式が正しくありません。');
      const data=atob(match[2]);total+=data.length;if(data.length>20*1024*1024||total>LIMIT)throw new Error('画像は1枚20MB・合計80MB以内にしてください。');
      const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[match[1]];
      const name=String(item.filename||'Gemini-image-'+(i+1)).replace(/[\\/\x00-\x1f]/g,'_').replace(/\.(png|jpe?g|webp)$/i,'').slice(0,220)+'.'+ext;
      const file=new File([Uint8Array.from(data,c=>c.charCodeAt(0))],name,{type:match[1]});
      file.geminiExplanation=typeof item.explanation==='string'?item.explanation.slice(0,20000):'';
      file.geminiArticles=Array.isArray(pack.articles)?pack.articles.slice(0,100).filter(a=>typeof a.gid==='string'&&typeof a.title==='string').map(a=>({gid:a.gid.slice(0,100),title:a.title.slice(0,300),explanation:typeof a.explanation==='string'?a.explanation.slice(0,20000):''})):[];
      file.geminiWarnings=Array.isArray(pack.warnings)?pack.warnings.slice(0,10).map(s=>String(s).slice(0,500)):[];return file;
    });
  }
  // Runs only when the user activates the bookmark on the Gemini page.
  async function copyGeminiImages(){
    if(location.hostname!=='gemini.google.com'){alert('Geminiの生成画像が表示された会話で実行してください。');return;}
    try{
      const images=[...document.querySelectorAll('img')].filter(img=>/AI 生成|AI.generated|generated image/i.test(img.alt||'')&&img.naturalWidth>100);
      if(!images.length||images.length>10)throw new Error('表示された生成画像を1〜10枚にしてください。');
      const codes=[...document.querySelectorAll('code')].filter(n=>/^\d{3,}__.+\.(png|jpe?g|webp)$/i.test(n.textContent.trim()));
      const items=[];let total=0;const used=new Set();
      for(const [i,img] of images.entries()){
        const responseRoot=img.closest('model-response');
        const localCodes=responseRoot?codes.filter(n=>responseRoot.contains(n)):[];
        const code=responseRoot&&images.filter(n=>responseRoot.contains(n)).length===1&&localCodes.length===1?localCodes[0]:null;
        let filename=code?.textContent.trim()||'Gemini-image-'+(i+1);
        if(used.has(filename))filename='Gemini-image-'+(i+1);used.add(filename);
        const r=await fetch(img.currentSrc||img.src);if(!r.ok)throw new Error('画像を読み取れませんでした。');
        const blob=await r.blob();total+=blob.size;
        if(blob.size>20*1024*1024||total>80*1024*1024)throw new Error('画像は1枚20MB・合計80MB以内にしてください。');
        const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
        items.push({filename,dataUrl});
      }
      await navigator.clipboard.writeText('NIKKEI_FIGURES_V1\n'+JSON.stringify({version:1,items}));
      alert(items.length+'枚をコピーしました。日経マップの図解画面で貼り付けてください。画像はまだ公開されていません。');
    }catch(e){alert('一括コピーできませんでした：'+(e.message||e));}
  }
  root.FigureUrlImport={classify,download,decode,bookmarklet:'javascript:('+copyGeminiImages.toString()+')();'};
})(typeof window==='undefined'?globalThis:window);
