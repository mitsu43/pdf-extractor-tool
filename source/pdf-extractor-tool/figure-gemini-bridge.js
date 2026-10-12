(function(root){
  'use strict';
  let selected=null;
  const supported=new Set(['1.4.3','1.4.4']);
  function show(message){const el=document.getElementById('figureBridgeStatus');if(el)el.textContent=message;}
  function exchange(type,url,offset,timeout,job){
    return new Promise((resolve,reject)=>{
      const id=crypto.randomUUID();let settle;
      const replies=[];
      const clean=()=>{clearTimeout(timer);clearTimeout(settle);root.removeEventListener('message',receive);};
      const receive=event=>{
        const data=event.data;
        if(event.source!==root||event.origin!==location.origin||data?.channel!=='nikkei-gemini-reply-v1'||data.id!==id)return;
        if(type==='ping'){
          replies.push(data);
          if(!settle)settle=setTimeout(()=>{clean();resolve(replies);},250);
          return;
        }
        if(selected?.extensionId&&data.extensionId!==selected.extensionId)return;
        clean();data.ok?resolve(data):reject(new Error(data.error||'取り込みに失敗しました。'));
      };
      const timer=setTimeout(()=>{clean();reject(new Error(type==='ping'?'Gemini画像取込拡張を再読み込みし、接続を確認してください。':'取得が時間切れになりました。画像を再生成せず、同じ会話から再試行してください。'));},timeout);
      root.addEventListener('message',receive);
      root.postMessage({channel:'nikkei-gemini-request-v1',id,type,url,offset,job,extensionId:type==='ping'?undefined:selected?.extensionId},location.origin);
    });
  }
  async function check(recovery=false){
    const replies=await exchange('ping',undefined,0,3000);
    // Even identical replies can mean duplicate injections. Never let both execute a send.
    if(replies.length!==1){selected=null;show(`拡張：${replies.length}件の応答。重複を解消してください。`);throw new Error('複数の画像取込拡張が応答しました。使う拡張を1つにして再開してください。送信していません。');}
    const ping=replies[0];
    show(`拡張 ${ping.extensionVersion||'不明'} / ${ping.extensionId||'識別非対応'} / ${ping.build||''}`);
    if(!ping.ok||!supported.has(ping.extensionVersion))throw new Error('対応する画像取込拡張は1.4.3／1.4.4です。同梱の1.4.4へ更新してください。');
    if(recovery&&(ping.extensionVersion!=='1.4.4'||ping.protocol!==2||!ping.extensionId))throw new Error('再送しない復旧処理には同梱の拡張1.4.4が必要です。');
    selected=ping;return ping;
  }
  root.FigureGeminiBridge={check,async step(job,url,onBatch){
    await check(!!job.recoveryOnly);
    let result=await exchange('step',url||undefined,0,180000,job);
    if(result.status!=='done')return result;
    const packs=[];let offset=0;
    for(let n=0;n<1000;n++){
      packs.push(result.pack);
      if(onBatch)await onBatch(result.pack,result.url);
      if(result.pack.nextOffset==null)return {...result,pack:{version:1,items:packs.flatMap(p=>p.items),articles:packs.flatMap(p=>p.articles||[]),warnings:packs.flatMap(p=>p.warnings||[]),nextOffset:null}};
      if(!Number.isInteger(result.pack.nextOffset)||result.pack.nextOffset<=offset)throw new Error('画像の取得位置が進みません。取得済み画像を保持して停止しました。');
      offset=result.pack.nextOffset;
      await check(true);
      result=await exchange('step',result.url||url,0,180000,{...job,recoveryOnly:true,captureOffset:offset});
      if(result.status!=='done')throw new Error('残り画像の取得を確認できません。取得済み画像は端末に保持しています。');
    }
    throw new Error('画像の取得回数上限に達しました。取得済み画像は保持しています。');
  },async open(url){await check();return exchange('open',url,0,10000);
  },async request(url,records=[],onBatch){
    await check();
    if(!url)url=(await exchange('resolve',undefined,0,5000)).url;
    const files=[];let offset=0;
    const job=records.length?{importOnly:true,allowImageOnly:true,articles:records.map(a=>({gid:a.gid,title:a.title,filename:root.FigurePrompt.imageFilename(a)}))}:undefined;
    for(let batch=0;batch<1000;batch++){
      const {pack}=await exchange('import',url,offset,180000,job);
      const part=root.FigureUrlImport.decode('NIKKEI_FIGURES_V1\n'+JSON.stringify(pack));
      if(onBatch)await onBatch(part,url);
      files.push(...part);
      if(pack.nextOffset==null){files.conversationUrl=url;return files;}
      if(!Number.isInteger(pack.nextOffset)||pack.nextOffset<=offset)throw new Error('取込位置が進みません。取得済み画像は保持しています。');
      offset=pack.nextOffset;
    }
    throw new Error('取込件数の上限を超えました。');
  }};
})(window);
