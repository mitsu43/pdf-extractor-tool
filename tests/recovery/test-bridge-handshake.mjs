import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../../figure-gemini-bridge.js',import.meta.url),'utf8');
function bridge(replies,pages){
 const handlers=new Set(),sent=[],status={};let context;
 const root={addEventListener(_,fn){handlers.add(fn)},removeEventListener(_,fn){handlers.delete(fn)},postMessage(request){
  sent.push(request);
  const list=request.type==='ping'?replies:[{ok:true,extensionId:'ext-one',status:'done',url:'https://gemini.google.com/app/test',pack:pages?.shift()||{version:1,items:[],articles:[],nextOffset:null}}];
  for(const reply of list)queueMicrotask(()=>{for(const fn of [...handlers])fn({source:root,origin:'https://example.test',data:{...reply,channel:'nikkei-gemini-reply-v1',id:request.id}})});
 }};
 context=vm.createContext({window:root,crypto,location:{origin:'https://example.test'},document:{getElementById:()=>status},setTimeout,clearTimeout});
 vm.runInContext(source,context);return {api:root.FigureGeminiBridge,sent,status};
}
const modern={ok:true,extensionVersion:'1.4.4',extensionId:'ext-one',protocol:2,build:'test'};
let b=bridge([modern]);await b.api.step({recoveryOnly:true},'https://gemini.google.com/app/test');
assert.equal(b.sent.at(-1).extensionId,'ext-one');assert.match(b.status.textContent,/1.4.4/);
b=bridge([{ok:true,extensionVersion:'1.4.3'}]);await b.api.check();
await assert.rejects(b.api.step({recoveryOnly:true}),/1.4.4/);assert(!b.sent.some(x=>x.type==='step'));
b=bridge([modern,{...modern,extensionId:'ext-two'}]);await assert.rejects(b.api.step({}),/複数/);assert(!b.sent.some(x=>x.type==='step'));
b=bridge([{ok:true,extensionVersion:'1.4.2'}]);await assert.rejects(b.api.open(),/1.4.3／1.4.4/);assert(!b.sent.some(x=>x.type==='open'));
console.log('PASS: 1.4.3 compatibility, 1.4.4 recovery capability, extension identity targeting, duplicate-response refusal, old-version refusal before action.');

b=bridge([modern],[{version:1,items:[{filename:'first'}],articles:[{gid:'a'}],nextOffset:3},{version:1,items:[{filename:'second'}],articles:[{gid:'b'}],nextOffset:null}]);
const saved=[];const paged=await b.api.step({},undefined,async pack=>saved.push(pack.items[0].filename));
assert.deepEqual(saved,['first','second']);assert.equal(paged.pack.items.length,2);
assert.equal(b.sent.filter(x=>x.type==='step')[1].job.captureOffset,3);
assert.equal(b.sent.filter(x=>x.type==='step')[1].job.recoveryOnly,true);
console.log('PASS: paginated images are saved per page; follow-up capture uses the returned offset and forbids image regeneration.');
