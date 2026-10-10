(function(root){
  'use strict';
  const MB=1024*1024;
  function readBounded(entry,limit){
    return new Promise((resolve,reject)=>{
      let size=0;const chunks=[],stream=entry.internalStream('uint8array');
      stream.on('data',chunk=>{size+=chunk.length;if(size>limit){stream.pause();reject(new Error('ZIP内のファイルが容量上限を超えています。'));return;}chunks.push(chunk);});
      stream.on('error',reject);stream.on('end',()=>{const out=new Uint8Array(size);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}resolve(out);});stream.resume();
    });
  }
  async function unpack(file,articles,pageOf){
    if(!root.JSZip)throw new Error('ZIP読込ライブラリを読み込めません。ページを再読込してください。');
    if(file.size>80*MB)throw new Error('ZIPは80MB以内にしてください。');
    const zip=await root.JSZip.loadAsync(await file.arrayBuffer());
    const entries=Object.values(zip.files).filter(e=>!e.dir&&!e.name.startsWith('__MACOSX/')&&!e.name.split('/').pop().startsWith('.'));
    if(entries.length>40)throw new Error('ZIP内のファイルが多すぎます。1面・10記事以内に分けてください。');
    if(entries.some(e=>(e.unsafeOriginalName||e.name).split(/[\\/]/).some(p=>p==='..')||e.name.startsWith('/')))throw new Error('ZIP内のパスが不正です。');
    const manifests=entries.filter(e=>e.name.split('/').pop()==='manifest.json');
    if(manifests.length!==1)throw new Error('ZIPにmanifest.json（記事と画像の対応表）が1つ必要です。');
    const entry=manifests[0],base=entry.name.slice(0,-'manifest.json'.length);
    let manifest;try{manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBounded(entry,MB)));}catch{throw new Error('manifest.jsonを読み込めません。UTF-8の正しいJSONが必要です。');}
    if(manifest.version!==1||!Array.isArray(manifest.items)||!manifest.items.length||manifest.items.length>10)throw new Error('対応表はversion:1、itemsは1〜10記事にしてください。');
    const seen=new Set(),files=new Set(),items=[];let total=0;
    for(const item of manifest.items){
      const article=articles.find(a=>a.gid===item.gid);
      if(!article||article.title!==item.title||article.date!==manifest.date||article.edition!==manifest.edition||Number(pageOf(article))!==Number(manifest.page))throw new Error('ZIPとサイトの記事ID・見出し・日付・面が一致しません。対応表を確認してください。');
      if(seen.has(item.gid)||typeof item.filename!=='string'||!/^\d{3,}[-_][^/\\]+\.(png|jpe?g|webp)$/i.test(item.filename)||files.has(item.filename))throw new Error('対応表に重複または不正な画像名があります。');
      const encoded=item.filename.match(/^(\d{3,})__([^]+?)__/);
      if(encoded){
        let encodedGid;try{encodedGid=decodeURIComponent(encoded[2]);}catch{throw new Error('画像名の記事IDを読めません：'+item.filename);}
        if(encodedGid!==item.gid||Number(encoded[1])!==article.no)throw new Error('画像名とJSONの記事ID・番号が不一致：'+item.filename);
      }
      if(item.article_number!=null&&Number(item.article_number)!==article.no)throw new Error('JSONとサイトの記事番号が不一致：'+item.gid);
      seen.add(item.gid);files.add(item.filename);
      const image=zip.file(base+item.filename);if(!image)throw new Error('画像がありません：'+item.filename);
      const bytes=await readBounded(image,Math.min(20*MB,80*MB-total));total+=bytes.length;
      const ext=item.filename.split('.').pop().toLowerCase(),type=ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg';
      items.push({file:new File([bytes],item.filename,{type}),gid:article.gid,article,explanation:typeof item.explanation==='string'?item.explanation.slice(0,20000):''});
    }
    const mapped=new Set([entry.name,...[...files].map(n=>base+n)]);
    if(entries.some(e=>/\.(png|jpe?g|webp)$/i.test(e.name)&&!mapped.has(e.name)))throw new Error('対応表にない画像があります。誤登録防止のため取込を中止しました。');
    return {manifest,items};
  }
  root.FigureZip={unpack};
})(typeof window==='undefined'?globalThis:window);
