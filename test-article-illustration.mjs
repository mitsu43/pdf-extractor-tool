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
  extractFunction('illustrationJapaneseQualityRules'),
  extractFunction('buildArticleIllustrationPrompt'),
  extractFunction('buildBulkArticleIllustrationPrompt'),
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
assert.match(prompt, /中学生でも内容の段階を追って理解できる/);
assert.match(prompt, /何が起きた？/);
assert.match(prompt, /なぜそうなる？/);
assert.match(prompt, /誰にどんな影響がある？/);
assert.match(prompt, /専門用語を身近な物や行動に置き換え/);
assert.match(prompt, /読みやすい3〜6コマ/);
assert.match(prompt, /途中で終わる「…」を使わない/);
assert.match(prompt, /必ずイラスト画像を生成する/);
assert.match(prompt, /政策金利は中央銀行/);

const bulk = context.buildBulkArticleIllustrationPrompt(Array.from({ length: 10 }, (_, index) => ({
  no: index + 1, title: `検証記事${index + 1}`, source: { content_detail: `本文${index + 1}` },
})));
for (const result of [prompt, bulk]) {
  assert.match(result, /日本語原稿を確定してから描画/);
  assert.match(result, /確定原稿と一文ずつ照合/);
  assert.match(result, /六コマを強制しない/);
  assert.match(result, /ファイル名、拡張子、記事管理番号、パス、保存名の欄は画像内に絶対に描かない/);
  assert.match(result, /問いには必ず対応する答えと理由/);
  assert.match(result, /画像を実際に確認できない場合/);
  assert.match(result, /日本語フォントで組版/);
}
const [renderInput, metadata] = bulk.split('【保存用メタデータ：以下は描画エンジンへ渡す文字原稿に含めない】');
assert.doesNotMatch(renderInput, /\.png|保存名:/);
assert.equal(JSON.parse(metadata).length, 10);
assert.equal(JSON.parse(metadata)[0].filename, '001-記事全体.png');
assert.equal(JSON.parse(metadata)[9].filename, '010-記事全体.png');
assert.match(renderInput, /画像タイトル: 検証記事1/);
assert.match(renderInput, /画像タイトル: 検証記事10/);
assert.doesNotMatch(bulk, /途中で止めず|各画像の必須構成/);

console.log('article illustration prompt test: ok');
