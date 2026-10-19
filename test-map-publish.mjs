import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(){
 const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{disabled:false,textContent:'',value:'',checked:false});return elements.get(id);};
 const listeners={},messages=[],saved=new Map();let failCommit=false;
 const preview={previewId:crypto.randomUUID(),requestId:crypto.randomUUID(),date:'2026-09-29',edition:'morning',existing:1,incoming:1,added:1,updated:0,removed:1,before:5,after:5};
 const popup={closed:false,postMessage(m){messages.push(m);queueMicrotask(()=>listeners.message({origin:'https://nikkei-map.pages.dev',source:popup,data:{channel:m.channel,id:m.id,...(m.action==='commit'&&failCommit?{error:'通信結果不明'}:{result:m.action==='preview'?preview:m.action==='commit'?{...preview,version:'v2'}:{ready:true}})}}));}};
 const context={crypto,TextEncoder,setTimeout,clearTimeout,console,state:{preset:'nikkei',running:false,resume:null,stopRequested:false,articles:[{}],manual:null,publishComplete:true},MAP_ED_LABEL:{morning:'朝刊'},runValidation:()=>({allOk:true}),buildMapRecordsFromCurrent:()=>[{title:'記事'}],sessionStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},window:{addEventListener:(k,v)=>listeners[k]=v,open:()=>popup},document:{createElement:()=>({}),getElementById:get,querySelector:()=>({after(){}})}};
 get('publishReviewed').checked=true;get('publishMode').value='replace';get('mapDateInput').value='2026-09-29';get('mapEditionSelect').value='morning';
 vm.runInNewContext(fs.readFileSync(new URL('./map-publish.js',import.meta.url),'utf8'),context);
 return {get,messages,context,saved,setFail:v=>failCommit=v};
}
test('review then one commit; no base JSON or credential in messages',async()=>{const s=setup();await s.get('publishPreview').onclick();assert.equal(s.get('publishCommit').disabled,false);await s.get('publishCommit').onclick();assert.match(s.get('publishStatus').textContent,/公開反映済み/);assert.deepEqual(s.messages.map(x=>x.action),['ping','preview','commit']);assert.equal(s.saved.size,0);});
test('incomplete, unreviewed, test-only or unfinished manual results cannot preview',async()=>{
 for(const patch of [{running:true},{resume:{}},{publishComplete:false},{manual:{testOnly:true}},{manual:{batches:[{status:'error'}]}}]){const s=setup();Object.assign(s.context.state,patch);await s.get('publishPreview').onclick();assert.equal(s.messages.length,0);}
 const s=setup();s.get('publishReviewed').checked=false;await s.get('publishPreview').onclick();assert.equal(s.messages.length,0);
});
test('changed content invalidates preview without writing',async()=>{const s=setup();await s.get('publishPreview').onclick();s.get('mapDateInput').value='2026-09-30';await s.get('publishCommit').onclick();assert.equal(s.messages.some(x=>x.action==='commit'),false);assert.equal(s.saved.size,0);});
test('ambiguous failure retries the same request ID, even after editing',async()=>{const s=setup();await s.get('publishPreview').onclick();s.setFail(true);await s.get('publishCommit').onclick();assert.equal(s.saved.size,1);s.setFail(false);s.get('mapDateInput').value='2026-09-30';await s.get('publishCommit').onclick();const c=s.messages.filter(x=>x.action==='commit');assert.equal(c.length,2);assert.deepEqual(c[0].body,c[1].body);assert.equal(s.saved.size,0);});
