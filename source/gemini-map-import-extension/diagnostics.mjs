import {isGeminiPage,executeGemini} from './background.mjs';
document.getElementById('check').addEventListener('click',async()=>{
  const out=document.getElementById('result');out.textContent='検査中';
  try{
    const tabs=await chrome.tabs.query({url:'https://gemini.google.com/*'});
    const tab=tabs.find(t=>isGeminiPage(t.url)&&t.status==='complete');
    if(!tab)throw new Error('Geminiの会話を開いてから検査してください。');
    const results=await executeGemini(chrome,{target:{tabId:tab.id},world:'ISOLATED',func:()=>({origin:location.origin,ready:document.readyState})});
    const r=results.find(x=>x.frameId===0)?.result;
    if(r?.origin!=='https://gemini.google.com')throw new Error('Geminiの状態を確認できませんでした。');
    out.textContent='アクセス成功：Gemini画面への接続を確認しました。画像生成・送信はしていません。';
  }catch(e){out.textContent=e.message;}
});
