import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('./', import.meta.url).pathname;
function fn(src,name){const start=src.indexOf('function '+name+'(');assert(start>=0,name);const brace=src.indexOf('{',start);let depth=0;for(let i=brace;i<src.length;i++){if(src[i]==='{')depth++;if(src[i]==='}'&&!--depth)return src.slice(start,i+1);}throw Error(name);}
const ex=fs.readFileSync(root+'index.html','utf8');
const c=vm.createContext({$:id=>({checked:true,value:id==='rolePrompt'?'記者の視点で読む':'古い保存済み指示'}),normalizeArticleRecord:a=>({...a}),normalizeArticleBoxesValue:v=>v||'',MAP_ED_FROM_CODE:{m:'morning'},MAP_ED_LABEL:{morning:'朝刊'}});
vm.runInContext(ex.slice(ex.indexOf('const HIGH_SCHOOL_EXPLANATION_RULE'),ex.indexOf('// Token assumptions')),c);
vm.runInContext(ex.slice(ex.indexOf('const PRESETS ='),ex.indexOf('//',ex.indexOf('const PRESETS =')+10)),c);
vm.runInContext('var state={schema:PRESETS.nikkei,pdfFile:{name:"20260930m.pdf"}};',c);
for(const n of ['buildSchemaDescription','buildSchemaExample','ensureHighSchoolExplanationRule','buildEnrichmentPrompt','makeManualPrompt','parseMapLocation','mapDateKey','articleToMapRecord','repairMapRecord'])vm.runInContext(fn(ex,n),c);
const payload={startNo:1,startPage:1,endPage:2,editionCode:'m',articles:[{no:1,headline:'見出し'}]};
for(const p of [c.makeManualPrompt('extract',payload),c.makeManualPrompt('enrich',payload),c.buildEnrichmentPrompt(payload.articles,'m')]){
 assert(p.includes('change_direction'));assert(p.includes('future_outlook'));assert(p.includes('【AIの推測】'));assert(p.includes('このルールを優先'));assert(!p.includes('"intent_motive"'));assert(!p.includes('"key_insights"'));
}
assert.equal(c.newsChangeRule([{key:'legal_summary'}]),'');
const sample={no:2,headline:'架空の検証記事',genre:'企業',page:3,content_detail:'事実',change_direction:'対面からオンラインへ。',future_outlook:'【記事の見通し】記載なし。【AIの推測】需要が続けば成長する可能性。【注目点】需要。',edition:'m',article_boxes:'1,2,3,4'};
const mapped=c.articleToMapRecord(sample,0,'20260930','morning',100);
assert.equal(mapped.analysis_mode,'change-outlook-v1');assert.equal(mapped['理解'],sample.change_direction);assert.equal(mapped['思惑'],sample.future_outlook);assert.equal(mapped.gid,'20260930_morning_2');assert.equal(mapped.article_boxes,'1,2,3,4');
const repaired=c.repairMapRecord(mapped,0,'20260930','morning');assert.equal(repaired.analysis_mode,mapped.analysis_mode);assert.equal(repaired['思惑'],sample.future_outlook);
const old=c.articleToMapRecord({key_insights:'記者の解説',intent_motive:'当事者の意図'},0,'20260929','morning',0);
assert.equal(old.analysis_mode,undefined);assert.equal(old['理解'],'記者の解説');assert.equal(old['思惑'],'当事者の意図');
console.log('PASS: prompt focus, export, repair and legacy compatibility');
