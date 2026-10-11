(function(){
  'use strict';
  if(window!==window.top||!(location.origin==='https://nikkei-map.pages.dev'||(['https://mitsu43.github.io','http://127.0.0.1:8041'].includes(location.origin)&&location.pathname.startsWith('/pdf-extractor-tool/'))))return;
  const requestChannel='nikkei-gemini-request-v1',replyChannel='nikkei-gemini-reply-v1';
  let busy=false;
  window.addEventListener('message',async event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.channel!==requestChannel)return;
    const {id,type,url,offset}=event.data;
    if(typeof id!=='string'||id.length>100)return;
    const reply=data=>window.postMessage({channel:replyChannel,id,...data,extensionId:chrome.runtime.id},location.origin);
    if(type==='ping'){reply({ok:true,version:1,protocol:2,extensionVersion:chrome.runtime.getManifest().version,build:chrome.runtime.getManifest().version_name});return;}
    if(!['import','resolve','open','step'].includes(type))return;
    if(event.data.extensionId&&event.data.extensionId!==chrome.runtime.id)return;
    if(busy){reply({ok:false,error:'取り込み中です。完了を待ってください。'});return;}
    busy=true;
    try{if(type==='import'&&(typeof url!=='string'||url.length>2000))throw new Error('会話URLを確認してください。');
      const result=await chrome.runtime.sendMessage({type:type==='step'?'NIKKEI_GEMINI_STEP':type==='resolve'?'NIKKEI_GEMINI_RESOLVE':type==='open'?'NIKKEI_GEMINI_OPEN':'NIKKEI_GEMINI_IMPORT',url,offset,job:event.data.job});
      if(!result)throw new Error('拡張を再読み込みし、日経マップも再読み込みしてください。');reply(result);
    }catch(e){reply({ok:false,error:e.message||'拡張との接続に失敗しました。'});}finally{busy=false;}
  });
})();
