import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = html.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    if (html[i] === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`${name} is not complete`);
}

const context = {};
vm.createContext(context);
vm.runInContext([
  extractFunction('firstArticleValue'),
  extractFunction('promptValue'),
  extractFunction('pageIllustrationSummary'),
  extractFunction('buildPageIllustrationPrompt'),
].join('\n'), context);

const prompt = context.buildPageIllustrationPrompt(3, [{
  headline: '金利上昇で住宅ローンに変化',
  content_detail: '住宅ローンの返済負担が変わる可能性がある。',
}]);

assert.match(html, /id="pageIllustrationPanel"/);
assert.match(html, /id="exportPageIllustrationPack"/);
assert.match(html, /nikkei-map-page-summary-images-v1/);
assert.match(html, /renderPageIllustrationTools\(\)/);
assert.match(prompt, /新聞の3面全体/);
assert.match(prompt, /高校生でも理解でき/);
assert.match(prompt, /50代の生活・仕事・家計にどう役立つか/);
assert.match(prompt, /金利上昇で住宅ローンに変化/);
assert.match(prompt, /必ずイラスト画像を生成する/);

console.log('page illustration generation and export: OK');
