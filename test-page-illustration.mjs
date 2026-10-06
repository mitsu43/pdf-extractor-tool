import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

assert.doesNotMatch(html, /id="pageIllustrationPanel"/);
assert.doesNotMatch(html, /id="exportPageIllustrationPack"/);
assert.doesNotMatch(html, /nikkei-map-page-summary-images-v1/);
assert.doesNotMatch(html, /renderPageIllustrationTools\(\)/);
assert.match(html, /class="btn btn-secondary btn-sm article-illustration-btn"/);
assert.match(html, /中学生でも内容の段階を追って理解できる/);

console.log('device-local page illustration export removed; article illustration retained: OK');
