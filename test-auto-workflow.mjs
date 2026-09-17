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

const context = {
  normalizeArticleRecord: article => ({ ...article }),
};
vm.createContext(context);
vm.runInContext([
  extractFunction('parseNikkeiFilename'),
  extractFunction('normalizeDedupText'),
  extractFunction('dedupeAndRenumberArticles'),
  extractFunction('pageRangesFrom'),
].join('\n'), context);

assert.deepEqual(
  JSON.parse(JSON.stringify(context.parseNikkeiFilename('20260917r.pdf'))),
  { isoDate: '2026-09-17', edition: 'r' },
);
assert.equal(context.parseNikkeiFilename('20260917e.pdf').edition, 'e');
assert.equal(context.parseNikkeiFilename('20260230m.pdf'), null);
assert.equal(context.parseNikkeiFilename('news.pdf'), null);

assert.deepEqual(
  JSON.parse(JSON.stringify(context.pageRangesFrom(1, 19, 5))),
  [
    { startPage: 1, endPage: 5 },
    { startPage: 6, endPage: 10 },
    { startPage: 11, endPage: 15 },
    { startPage: 16, endPage: 19 },
  ],
);

const deduped = context.dedupeAndRenumberArticles([
  { no: 8, page: 3, headline: 'TOB対応で課題見直し' },
  { no: 9, page: 4, headline: 'ＴＯＢ対応で 課題見直し' },
  { no: 10, page: 5, headline: '別の記事' },
]);
assert.equal(deduped.length, 2);
assert.deepEqual(Array.from(deduped, article => article.no), [1, 2]);

assert.match(html, /<option value="manual" selected>Gemini手動連携（APIキー不要・推奨）<\/option>/);
assert.match(html, /id="batchSize" value="5" min="2" max="5"/);
assert.match(html, /id="strictMode" checked/);
assert.match(html, /id="autoFinalize" checked/);
assert.match(html, /state\.preset === 'nikkei' \? Math\.min\(5, requestedBatchSize\)/);
assert.match(html, /startManualWorkflow\(\{ autoPrepare: true \}\)/);
assert.match(html, /completeManualWorkflowIfReady\(\)/);
assert.match(html, /state\.articles = dedupeAndRenumberArticles\(normalized\)/);
assert.match(html, /id="downloadAllBatchPdfsBtn"/);
assert.match(html, /id="extensionGeminiBtn"/);
assert.match(html, /type: 'OPEN_GEMINI_BATCHES'/);

console.log('automatic workflow test: ok');
