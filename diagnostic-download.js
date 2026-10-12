(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const version = '2026.10.12.2';
  let pendingPing = null, blobUrl = null;
  $('preview-note').hidden = location.origin === 'https://mitsu43.github.io';
  function checkConnection() {
    if (pendingPing) return pendingPing;
    $('retry').disabled = true;
    pendingPing = new Promise(resolve => {
      const id = crypto.randomUUID(), replies = [];
      let selfMessage = false;
      const receive = e => {
        if (e.origin !== location.origin || e.source !== window || e.data?.id !== id) return;
        if (e.data.channel === 'nikkei-gemini-request-v1') selfMessage = true;
        if (e.data.channel === 'nikkei-gemini-reply-v1' && replies.length < 20) {
          // Do not serialize arbitrary extension response payloads.
          const v = e.data.extensionVersion;
          replies.push({version:typeof v === 'string' && /^\d+(\.\d+){1,3}$/.test(v) ? v : 'UNKNOWN'});
        }
      };
      window.addEventListener('message', receive);
      $('result').textContent = '接続確認中…';
      window.postMessage({channel:'nikkei-gemini-request-v1',id,type:'ping'}, location.origin);
      setTimeout(() => {
        window.removeEventListener('message', receive);
        const connection = {observedAt:new Date().toISOString(),selfMessage,replies,repliesCount:replies.length};
        $('result').textContent = `拡張の応答：${replies.length}件\n応答バージョン：${replies.map(x=>x.version).join('、') || '未確認'}\n` +
          (replies.length === 1 ? 'このページでは応答しています。' : replies.length ? '複数の応答があります。' : '拡張から応答がありません。保存データの診断は可能です。');
        $('retry').disabled = false;
        pendingPing = null;
        resolve(connection);
      }, 4000);
    });
    return pendingPing;
  }
  $('retry').addEventListener('click', checkConnection);
  $('download').addEventListener('click', async () => {
    $('download').disabled = true;
    $('status').textContent = '診断中… 保存データを読み取っています。';
    try {
      if (!globalThis.NikkeiStorageDiagnostic) throw new Error('SCRIPT_UNAVAILABLE');
      const connection = checkConnection();
      const report = await globalThis.NikkeiStorageDiagnostic.collect();
      report.pageVersion = version;
      report.connection = await connection;
      const text = JSON.stringify(report, null, 2);
      $('report').textContent = text;
      $('report-details').hidden = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(new Blob([text],{type:'application/json'}));
      const link = $('download-again');
      link.href = blobUrl;
      link.download = `nikkei-diagnostic-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
      link.hidden = false;
      link.click();
      const failed = report.status !== 'INSPECTION_FINISHED_CHECK_EACH_STORE' ||
        Object.values(report.databases || {}).some(db => db.status && db.status !== 'ABSENT_IN_THIS_CONTEXT' ||
          Object.values(db.stores || {}).some(s => s.status !== 'READ_OK' || s.truncated));
      $('status').textContent = failed ? '一部を確認できませんでした。エラーを含む診断ファイルのダウンロードを開始しました。' :
        '診断ファイルのダウンロードを開始しました。記事・画像・進捗は変更していません。';
    } catch {
      $('status').textContent = '診断を完了できませんでした。データの変更やジョブ解除はしていません。';
    } finally { $('download').disabled = false; }
  });
  checkConnection();
})();
