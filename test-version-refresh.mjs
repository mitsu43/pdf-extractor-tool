import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

assert.match(html, /const APP_VERSION = 'v2026\.10\.06\.4'/);
assert.match(html, /const APP_VERSION_NAME = '図解画像出力修正版'/);
assert.match(html, /id="appVersion"/);
assert.match(html, /id="versionStatus">最新版を表示中/);
assert.match(html, /id="updateToolBtn">最新版に更新/);
assert.match(html, /url\.searchParams\.set\('tool-update', `\$\{APP_VERSION\}-\$\{Date\.now\(\)\}`\)/);
assert.match(html, /\$\{APP_VERSION\} へ更新済み/);

console.log('version refresh UI test: ok');
