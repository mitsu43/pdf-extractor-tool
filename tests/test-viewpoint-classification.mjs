import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../article-classification.js';
const api=globalThis.ArticleClassification;
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const extract=(name,next)=>html.slice(html.indexOf('function '+name+'('),html.indexOf('function '+next+'(')).replace(/async\s*$/, '');
function context(){
  const c={ArticleClassification:api,state:{preset:'nikkei',schema:{fields:[{key:'no',type:'integer'},{key:'headline',type:'string'}],enrichFields:[]},articles:[]},$:()=>({value:'編集者',checked:true}),escapeHtml:v=>String(v??'').replaceAll('<','&lt;').replaceAll('>','&gt;')};
  vm.createContext(c);
  vm.runInContext(extract('usesArticleClassification','buildSchemaDescription')+extract('buildExtractionJsonSchema','buildEnrichmentJsonSchema')+extract('buildEnrichmentJsonSchema','renderPageForGemini'),c);
  return c;
}
test('inline JavaScript parses and classification dependencies are local to GitHub Pages project',()=>{
  for(const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi))if(!/src=|type="module"/.test(m[1]))new vm.Script(m[2]);
  assert.ok(html.includes('./article-classification.js?v=20261024-3'));
  assert.ok(!html.includes('../article-classification.js'));
  const master=JSON.parse(fs.readFileSync(new URL('../classification-master.json',import.meta.url),'utf8'));
  assert.deepEqual(master.groups.flatMap(g=>g.themes.map(t=>t.code+' '+t.name)),api.currentValues);
});
test('morning and evening manual prompts contain the same approved 19 viewpoints',()=>{
  const c=context();Object.assign(c,{ensureArticleTakeawayField(){},ensureHighSchoolExplanationRule:v=>v,newsChangeRule:()=>'',originalPdfPageRule:()=>'',detectEdition:name=>name.includes('e.pdf')?'e':'m'});
  vm.runInContext(extract('buildSchemaDescription','originalPdfPageRule')+extract('makeManualPrompt','startManualWorkflow'),c);
  for(const ed of ['m','e']){
    c.state.pdfFile={name:`20261024${ed}.pdf`};
    c.payload={startNo:1,startPage:1,endPage:5,editionCode:ed};
    const prompt=vm.runInContext("makeManualPrompt('extract',payload)",c);
    for(const value of api.currentValues)assert.ok(prompt.includes(value),value);
    assert.ok(prompt.includes('単語や業種で判定しない'));
    assert.ok(prompt.includes('速報やクイズに変革を創作しない'));
    assert.ok(!prompt.includes('1-3 思想・文明批評－歴史・文化遺産の再解釈'));
    assert.ok(prompt.includes('元PDF'));
  }
  assert.equal(vm.runInContext('buildExtractionJsonSchema()',c).items.properties.分類.enum.length,19);
  assert.equal(vm.runInContext('buildEnrichmentJsonSchema()',c).items.properties.分類.enum.length,19);
  c.state.preset='law';c.state.schema.fields=[{key:'body',type:'string'}];
  vm.runInContext('ensureClassificationFields()',c);assert.equal(c.state.schema.fields.length,1);
});
test('classification edits persist across manual batches and survive map serialization',()=>{
  const c=context();let saves=0;c.saveSession=()=>saves++;
  c.state.articles=[{headline:'採用記事',page:1}];c.state.manual={batches:[{articles:[{headline:'採用記事',page:1}]}]};
  vm.runInContext("updateArticleClassification(0,'分類','B1 人材戦略の転換');updateArticleClassification(0,'分類理由','人数確保から専門人材を重視する採用へ転換する。')",c);
  assert.equal(c.state.manual.batches[0].articles[0].分類,c.state.articles[0].分類);assert.equal(saves,2);
  Object.assign(c,{normalizeArticleRecord:a=>a,mapAnalysisValues:()=>({intent:'',understanding:''}),parseMapLocation:()=>({place:'東京',lat:35,lng:139}),MAP_ED_FROM_CODE:{e:'evening'}});
  vm.runInContext(extract('articleToMapRecord','normalizeArticleBoxesValue')+extract('normalizeArticleBoxesValue','repairMapRecord'),c);
  c.article={...c.state.articles[0],no:2,edition:'e'};
  const mapped=vm.runInContext("articleToMapRecord(article,0,'10/24','evening',0)",c);
  assert.equal(mapped.gid,'10/24_evening_2');assert.equal(mapped.分類,'B1 人材戦略の転換');assert.equal(mapped.分類理由,c.article.分類理由);
  c.state.articles=[{}];assert.throws(()=>vm.runInContext('requireArticleClassifications(state.articles)',c),/分類/);
});
test('unsupported extraction auto-input no longer demands a nonexistent extension folder',()=>{
  assert.ok(html.includes('id="extensionGeminiBtn" hidden disabled'));
  assert.ok(!html.includes('Chrome拡張機能が見つかりません'));
  assert.ok(!html.includes('配布ZIP内の chrome-extension'));
  const c={openAllGeminiTabs:()=>42};vm.createContext(c);
  vm.runInContext(extract('openGeminiTabsWithExtension','downloadAllBatchPdfs'),c);
  assert.equal(c.openGeminiTabsWithExtension(),42);
  assert.ok(html.includes('抽出の手動連携にChrome拡張機能は不要'));
  assert.ok(html.includes('Gemini手動連携（APIキー不要・推奨）'));
});
