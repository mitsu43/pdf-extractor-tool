import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

assert.match(html, /const APP_VERSION = 'v2026\.09\.09\.5'/);
assert.match(html, /id="appVersion"/);
assert.match(html, /id="versionStatus">最新版を表示中/);
assert.match(html, /id="updateToolBtn">最新版に更新/);
assert.match(html, /url\.searchParams\.set\('tool-update', `\$\{APP_VERSION\}-\$\{Date\.now\(\)\}`\)/);
assert.match(html, /\$\{APP_VERSION\} へ更新済み/);

console.log('version refresh UI test: ok');
