import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

const version=html.match(/const APP_VERSION = '(v\d{4}\.\d{2}\.\d{2}\.\d+)'/)?.[1];
assert.ok(version);
assert.ok(html.includes(`この画面 ${version}`));
assert.match(html, /const APP_VERSION_NAME = '1ページ分割・12記事継続・根拠優先抽出'/);
assert.match(html, /id="appVersion"/);
assert.match(html, /id="versionStatus">この画面の読込版（本番の最新版かは未確認）/);
assert.match(html, /id="updateToolBtn">画面を再読み込み/);
assert.match(html, /url\.searchParams\.set\('tool-update', `\$\{APP_VERSION\}-\$\{Date\.now\(\)\}`\)/);
assert.match(html, /\$\{APP_VERSION\} を読込済み（本番の最新版かは未確認）/);

console.log('version refresh UI test: ok');
