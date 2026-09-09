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
  extractFunction('buildArticleIllustrationPrompt'),
].join('\n'), context);

const prompt = context.buildArticleIllustrationPrompt({
  no: 12,
  page: 4,
  headline: '金利上昇で住宅ローンに変化',
  genre: '経済・金融',
  content_detail: '政策金利の上昇を受け、住宅ローンの返済負担が変わる可能性がある。',
  intention: '金融機関は収益改善を狙う一方、家計負担への配慮も必要になる。',
  understanding: '固定金利と変動金利の違いを理解し、返済計画を点検する必要がある。',
  keyword: '政策金利は中央銀行が金融市場を調整する基準となる金利。',
});

assert.match(html, /class="btn btn-secondary btn-sm article-illustration-btn"/);
assert.match(html, /openArticleIllustrationInGemini\(Number\(button\.dataset\.articleIndex\), button\)/);
assert.match(prompt, /金利上昇で住宅ローンに変化/);
assert.match(prompt, /高校生でも内容を理解でき/);
assert.match(prompt, /50代の生活・仕事・家計にどう役立つか/);
assert.match(prompt, /高校生が初めて聞いても分かる/);
assert.match(prompt, /専門用語の説明/);
assert.match(prompt, /スマートフォンでも読める/);
assert.match(prompt, /「…」で文章を途中終了せず/);
assert.match(prompt, /必ずイラスト画像を生成する/);
assert.match(prompt, /政策金利は中央銀行/);

console.log('article illustration prompt test: ok');
