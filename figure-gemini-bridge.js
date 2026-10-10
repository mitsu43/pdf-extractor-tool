(function(root){
  'use strict';
  function exchange(type,url,offset,timeout,job){
    return new Promise((resolve,reject)=>{
      const id=crypto.randomUUID();
      const clean=()=>{clearTimeout(timer);root.removeEventListener('message',receive);};
      const receive=event=>{
        if(event.source!==root||event.origin!==location.origin||event.data?.channel!=='nikkei-gemini-reply-v1'||event.data.id!==id)return;
        clean();event.data.ok?resolve(event.data):reject(new Error(event.data.error||'取り込みに失敗しました。'));
      };
      const timer=setTimeout(()=>{clean();reject(new Error(type==='ping'?'Gemini画像取込拡張を1.3.0へ更新・再読み込みし、この抽出ツールも再読み込みしてください。':'取得が時間切れになりました。会話を表示して再試行してください。'));},timeout);
      root.addEventListener('message',receive);
      root.postMessage({channel:'nikkei-gemini-request-v1',id,type,url,offset,job},location.origin);
    });
  }
  root.FigureGeminiBridge={async step(job){
    const ping=await exchange('ping',undefined,0,3000);
    if(ping.extensionVersion!=='1.4.0')throw new Error('順次生成には「日経マップ Gemini画像取込」拡張1.4.0への更新が必要です。');
    return exchange('step',undefined,0,60000,job);
  },async open(url){
    const ping=await exchange('ping',undefined,0,3000);
    if(!['1.3.0','1.4.0'].includes(ping.extensionVersion))throw new Error('拡張を1.4.0へ更新してください。');
    return exchange('open',url,0,10000);
  },async request(url){
    const ping=await exchange('ping',url,0,3000);
    if(!['1.3.0','1.4.0'].includes(ping.extensionVersion))throw new Error('Gemini画像取込拡張を1.4.0へ更新してください。');
    if(!url)url=(await exchange('resolve',undefined,0,5000)).url;
    const files=[];let offset=0;
    for(let batch=0;batch<1000;batch++){
      const {pack}=await exchange('import',url,offset,180000);
      files.push(...root.FigureUrlImport.decode('NIKKEI_FIGURES_V1\n'+JSON.stringify(pack)));
      if(pack.nextOffset==null){files.conversationUrl=url;return files;}
      if(!Number.isInteger(pack.nextOffset)||pack.nextOffset<=offset)throw new Error('取込位置が進みません。');
      offset=pack.nextOffset;
    }
    throw new Error('取込件数の上限を超えました。');
  }};
})(window);
