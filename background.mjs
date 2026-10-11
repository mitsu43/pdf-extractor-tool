import {collectGeminiImages} from './collector.mjs';
import {generationStep} from './sequence.mjs';
const inFlight=new Set();
export function isGeminiPage(value){
  try{const u=new URL(value);return u.origin==='https://gemini.google.com'&&!u.username&&!u.password&&/^\/app(?:\/|$)/.test(u.pathname);}catch{return false;}
}
export async function executeGemini(api,options){
  const tab=await api.tabs.get(options.target.tabId);
  if(!isGeminiPage(tab.url))throw new Error('対象タブがGemini以外のページに変わっています。元のGemini会話に戻ってから再開してください。記事と画像は保持しています。');
  try{return await api.scripting.executeScript(options);}
  catch(e){
    if(/Cannot access contents|manifest must request permission|Missing host permission/i.test(e.message||''))throw new Error('ChromeがGeminiへのアクセスを拒否しました。chrome://extensions/ の「日経マップ Gemini画像取込」→「詳細」→「サイトへのアクセス」で https://gemini.google.com を許可し、拡張を再読み込みしてください。自動再送はしていません。');
    throw e;
  }
}
export function conversationUrl(value){
  const url=new URL(value);
  if(url.origin!=='https://gemini.google.com'||url.username||url.password||!/^\/app\/[a-z0-9_-]+\/?$/i.test(url.pathname))throw new Error('Geminiの会話URL（/app/会話ID）を指定してください。');
  return url.origin+url.pathname.replace(/\/$/,'');
}
export function trustedSender(sender){
  try{const u=new URL(sender.url);return sender.frameId===0&&(u.origin==='https://nikkei-map.pages.dev'||(['https://mitsu43.github.io','http://127.0.0.1:8041'].includes(u.origin)&&u.pathname.startsWith('/pdf-extractor-tool/')))&&Number.isInteger(sender.tab?.id);}catch{return false;}
}
export async function importConversation(value,api=chrome,offset=0,job=null){
  if(!Number.isInteger(offset)||offset<0||offset>1000)throw new Error('取込位置が不正です。');
  const url=conversationUrl(value);
  const tabs=await api.tabs.query({url:'https://gemini.google.com/*'});
  const tab=tabs.find(t=>{try{return conversationUrl(t.url)===url;}catch{return false;}});
  if(!tab){await api.tabs.create({url,active:true});throw new Error('指定のGemini会話を開きました。ログインして画像を表示した後、日経マップで「URLを確認・取り込む」をもう一度押してください。');}
  if(tab.status!=='complete')throw new Error('Geminiの会話を読み込み中です。画像が表示されてから再試行してください。');
  if(job&&(!job.importOnly||!Array.isArray(job.articles)||job.articles.length>1000||job.articles.some(a=>typeof a.gid!=='string'||typeof a.title!=='string'||typeof a.filename!=='string')))throw new Error('取込対象記事が不正です。');
  const result=await executeGemini(api,{target:{tabId:tab.id},world:'ISOLATED',func:collectGeminiImages,args:[url,offset,job]});
  const pack=result.find(r=>r.frameId===0)?.result;
  if(!pack||pack.version!==1||!Array.isArray(pack.items)||!pack.items.length||pack.items.length>1000)throw new Error('画像を取得できませんでした。Geminiにログインして画像を表示してください。');
  return pack;
}
if(typeof chrome!=='undefined')chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(!trustedSender(sender))return false;
  const tabKey='figure-tab-'+sender.tab.id;
  if(message?.type==='NIKKEI_GEMINI_STEP'){
    if(!['https://mitsu43.github.io','http://127.0.0.1:8041'].includes(new URL(sender.url).origin))return false;
    if(inFlight.has(sender.tab.id)){reply({ok:false,error:'処理中です。'});return false;}
    inFlight.add(sender.tab.id);
    (async()=>{
      const job=message.job;
      if(!job||!/^[-a-z0-9]{20,80}$/i.test(job.id)||typeof job.prompt!=='string'||job.prompt.length>50000||!job.prompt.includes('NIKKEI_JOB: '+job.id)||typeof job.gid!=='string'||typeof job.filename!=='string'||typeof job.title!=='string')throw new Error('生成指示が不正です。');
      if(job.articles&&(!Array.isArray(job.articles)||!job.articles.length||job.articles.length>10||new Set(job.articles.map(a=>a.gid)).size!==job.articles.length||job.articles.some(a=>typeof a.gid!=='string'||!/^\d{1,2}\/\d{1,2}_(morning|evening|regional|plusone|weekly|saturday)_\d+$/.test(a.gid)||typeof a.title!=='string'||typeof a.filename!=='string')))throw new Error('10記事単位の対象データが不正です。');
      const key='sequence-'+job.id;
      let saved=(await chrome.storage.local.get(key))[key];
      if(saved&&saved.prompt!==job.prompt)throw new Error('保存済み指示が異なります。');
      if(!saved){
        const sequenceTabKey='sequence-tab-'+sender.tab.id;
        const linked=(await chrome.storage.session.get(sequenceTabKey))[sequenceTabKey];
        let tab=Number.isInteger(linked)?await chrome.tabs.get(linked).catch(()=>null):null;
        if(!tab||!isGeminiPage(tab.url)){tab=await chrome.tabs.create({url:'https://gemini.google.com/app',active:true,openerTabId:sender.tab.id});}
        await chrome.storage.session.set({[tabKey]:tab.id,[sequenceTabKey]:tab.id});
        saved={tabId:tab.id,prompt:job.prompt,started:Date.now(),submitted:false};
        await chrome.storage.local.set({[key]:saved});
      }
      let tab=await chrome.tabs.get(saved.tabId).catch(()=>null);
      if(!tab||!isGeminiPage(tab.url)){
        if(saved.submitted&&!saved.url)throw new Error('送信済みの会話URLをまだ取得できていません。重複生成を防ぐため停止しました。');
        tab=await chrome.tabs.create({url:saved.url?conversationUrl(saved.url):'https://gemini.google.com/app',active:true,openerTabId:sender.tab.id});
        saved.tabId=tab.id;await chrome.storage.local.set({[key]:saved});
      }
      await chrome.storage.session.set({[tabKey]:tab.id,['sequence-tab-'+sender.tab.id]:tab.id});
      if(tab.status!=='complete'){reply({ok:true,status:'waiting'});return;}
      if(saved.url&&conversationUrl(tab.url)!==conversationUrl(saved.url))throw new Error('生成タブの会話が変更されました。元の会話へ戻してください。');
      const results=await executeGemini(chrome,{target:{tabId:tab.id},world:'ISOLATED',func:generationStep,args:[job,!saved.submitted]});
      let result=results.find(r=>r.frameId===0)?.result;
      if(!result)throw new Error('Geminiの状態を読み取れません。');
      if(result.status==='armed'){
        // Journal before the external send. An uncertain outcome is never retried automatically.
        saved.submitted=true;
        saved.sentAt=Date.now();
        await chrome.storage.local.set({[key]:saved});
        const committed=await executeGemini(chrome,{target:{tabId:tab.id},world:'ISOLATED',func:generationStep,args:[job,'commit']});
        result=committed.find(r=>r.frameId===0)?.result;
        if(!result)throw new Error('送信結果が不明です。自動再送せず停止しました。');
      }
      if(result.status==='sent')saved.submitted=true;
      if(result.url&&/\/app\/[a-z0-9_-]+$/i.test(new URL(result.url).pathname))saved.url=result.url;
      await chrome.storage.local.set({[key]:saved});
      if(result.status==='ready'){
        if(job.articles){
          if(result.imageCount!=null&&result.imageCount<job.articles.length){
            const results=await executeGemini(chrome,{target:{tabId:tab.id},world:'ISOLATED',func:collectGeminiImages,args:[result.url,0,{...job,allowImageOnly:true}]});
            const pack=results.find(r=>r.frameId===0)?.result;
            if(!pack?.items?.length)throw new Error('生成済み画像を記事IDで照合できません。順番だけでは登録しません。');
            const missing=job.articles.filter(a=>!pack.articles.some(b=>b.gid===a.gid)).map(a=>a.gid);
            reply({ok:true,status:'done',pack,url:result.url,missing,partial:true});return;
          }
          if(result.imageCount!=null&&result.imageCount>job.articles.length)throw new Error('対象記事より画像が多いため停止しました。記事IDと画像を確認してください。');
          let explanation=saved.explanation;
          if(!explanation){
            const textJob={...job,textOnly:true,prompt:`直前のバッチで実際に生成された各画像を確認し、画像を新しく生成せず説明だけをまとめて回答してください。各記事の見出しを ARTICLE_ID: 対象ID とし、その下に【起】【承】【転】【結】の各コマの主語・行動・何を意味するか、高校生向けの用語説明を記述してください。実画像にない出来事や人を加えず、見通し・疑いは断定しない。生成されなかった記事は「未生成」と記載し、画像を追加生成しない。\n${job.articles.map(a=>'ARTICLE_ID: '+a.gid+'\n正式記事タイトル：'+a.title).join('\n\n')}\nNIKKEI_EXPLANATION: ${job.id}`};
            const texts=await executeGemini(chrome,{target:{tabId:tab.id},world:'ISOLATED',func:generationStep,args:[textJob,!saved.explanationSubmitted]});
            let text=texts.find(r=>r.frameId===0)?.result;
            if(text?.status==='armed'){
              saved.explanationSubmitted=true;await chrome.storage.local.set({[key]:saved});
              const sent=await executeGemini(chrome,{target:{tabId:tab.id},world:'ISOLATED',func:generationStep,args:[textJob,'commit']});
              text=sent.find(r=>r.frameId===0)?.result;
            }
            if(text?.status!=='ready-text'){reply({ok:true,status:'explaining',url:result.url});return;}
            explanation=text.explanation;saved.explanation=explanation;await chrome.storage.local.set({[key]:saved});
          }
          const packs=await executeGemini(chrome,{target:{tabId:tab.id},world:'ISOLATED',func:collectGeminiImages,args:[result.url,0,{...job,explanation}]});
          const pack=packs.find(r=>r.frameId===0)?.result;
          if(!pack?.items?.length)throw new Error('記事ID付きの独立画像を取得できませんでした。合成画像・対応不明の画像は登録しません。');
          const missing=job.articles.filter(a=>!pack.articles.some(b=>b.gid===a.gid)).map(a=>a.gid);
          reply({ok:true,status:'done',pack,url:result.url,missing});return;
        }
        let explanation=result.explanation||saved.explanation;
        if(!explanation){
          const textJob={...job,textOnly:true,prompt:'直前の生成画像を見て、画像を新しく生成せず文章だけ回答してください。上から4コマそれぞれの主語・行動・記事との関係を【起】【承】【転】【結】の見出しで説明し、用語を短く解説してください。図にない要素は加えず、記事の疑い・見通しを断定しないでください。\n対象記事：'+job.title+'\nNIKKEI_EXPLANATION: '+job.id};
          const texts=await executeGemini(chrome,{target:{tabId:tab.id},world:'ISOLATED',func:generationStep,args:[textJob,!saved.explanationSubmitted]});
          let text=texts.find(r=>r.frameId===0)?.result;
          if(text?.status==='armed'){
            saved.explanationSubmitted=true;await chrome.storage.local.set({[key]:saved});
            const sent=await executeGemini(chrome,{target:{tabId:tab.id},world:'ISOLATED',func:generationStep,args:[textJob,'commit']});
            text=sent.find(r=>r.frameId===0)?.result;
          }
          if(text?.status!=='ready-text'){reply({ok:true,status:'explaining',url:result.url});return;}
          explanation=text.explanation;saved.explanation=explanation;await chrome.storage.local.set({[key]:saved});
        }
        const packs=await executeGemini(chrome,{target:{tabId:tab.id},world:'ISOLATED',func:collectGeminiImages,args:[result.url,0,{...job,explanation}]});
        const pack=packs.find(r=>r.frameId===0)?.result;
        if(!pack?.items?.length)throw new Error('画像の取得に失敗しました。');
        reply({ok:true,status:'done',pack,url:result.url});return;
      }
      if(result.status==='missing'&&saved.submitted){
        if(Date.now()-(saved.sentAt||saved.started)<60000){reply({ok:true,status:'waiting'});return;}
        throw new Error('送信済みの記事が見つかりません。重複生成を防ぐため停止しました。');
      }
      reply({ok:true,...result});
    })().catch(e=>reply({ok:false,error:e.message})).finally(()=>inFlight.delete(sender.tab.id));return true;
  }
  if(message?.type==='NIKKEI_GEMINI_OPEN'){
    (async()=>{
      const url=message.url?conversationUrl(message.url):'https://gemini.google.com/app';
      const tab=await chrome.tabs.create({url,active:true,openerTabId:sender.tab.id});
      await chrome.storage.session.set({[tabKey]:tab.id});
      reply({ok:true});
    })().catch(e=>reply({ok:false,error:e.message}));return true;
  }
  if(message?.type==='NIKKEI_GEMINI_RESOLVE'){
    (async()=>{
      const saved=await chrome.storage.session.get(tabKey);
      if(Number.isInteger(saved[tabKey])){
        const tab=await chrome.tabs.get(saved[tabKey]).catch(()=>null);
        if(tab){reply({ok:true,url:conversationUrl(tab.url)});return;}
      }
      const tabs=await chrome.tabs.query({url:'https://gemini.google.com/*'});
      const linked=tabs.filter(t=>t.openerTabId===sender.tab.id);
      const conversations=linked.flatMap(t=>{try{return [conversationUrl(t.url)];}catch{return [];}});
      const unique=[...new Set(conversations)];
      if(unique.length!==1)throw new Error('この抽出ツールから開いた生成済み会話を特定できません。「PDF全体をGeminiへ」から生成するか、会話URLを指定してください。');
      reply({ok:true,url:unique[0]});
    })().catch(e=>reply({ok:false,error:e.message}));return true;
  }
  if(message?.type!=='NIKKEI_GEMINI_IMPORT')return false;
  if(inFlight.has(sender.tab.id)){reply({ok:false,error:'取り込み中です。完了を待ってください。'});return false;}
  inFlight.add(sender.tab.id);
  importConversation(message.url,chrome,message.offset||0,message.job||null).then(pack=>reply({ok:true,pack}),e=>reply({ok:false,error:e.message||'Gemini画像を取得できませんでした。'})).finally(()=>inFlight.delete(sender.tab.id));
  return true;
});
