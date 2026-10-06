import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

for (const id of [
  'buildFigureQueueBtn',
  'nextFigurePromptBtn',
  'figureFilesInput',
  'figureDropZone',
  'figurePublishTokenInput',
  'checkFigureConnectionBtn',
  'publishFiguresBtn',
  'figureQueueBody',
]) assert.ok(html.includes(`id="${id}"`), `missing ${id}`);

for (const behavior of [
  'function buildFigureQueue()',
  'function buildBulkArticleIllustrationPrompt(queue, extraTheme)',
  'function openBulkFigurePrompt()',
  'function assignFigureFiles(fileList)',
  'function figureNumberFromFilename(name)',
  'function figureManifestItems()',
  "form.append('manifest'",
  "form.append(`image:${items[index].id}`",
  '/api/figure-import/status',
  '/api/figure-import/commit',
  'FIGURE_MAX_BATCH_BYTES = 80 * 1024 * 1024',
  '記事JSONとは別に保存します',
  '全記事をまとめてGemini生成',
  '英語、ローマ字、架空文字は禁止です',
]) assert.ok(html.includes(behavior), `missing behavior: ${behavior}`);

assert.ok(!html.includes('function openNextFigurePrompt()'), 'one-article-at-a-time prompt flow must be removed');
assert.ok(!html.includes('figurePromptCursor'), 'one-article-at-a-time cursor must be removed');

assert.ok(html.includes('buildMapRecordsFromCurrent()'), 'queue must use canonical article gid conversion');
assert.ok(html.includes('multiple'), 'image picker must accept multiple files');
assert.ok(html.includes('data-figure-assignment'), 'user must be able to correct article assignments');
assert.ok(html.includes('data-figure-theme'), 'user must be able to correct themes');

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(Boolean);
scripts.forEach(script => new Function(script));

console.log('figure bulk upload UI test: ok');
