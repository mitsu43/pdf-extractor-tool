# PDF抽出ツール

公開サイト: https://mitsu43.github.io/pdf-extractor-tool/

## バージョン・更新履歴（日本時間）

日時はGitHubに記録されたコミット日時です。サイトへの配信完了時刻や、手元のChrome拡張の更新時刻ではありません。日付だけで「動作確認済み」とは判断しないでください。

| 対象 | バージョン | 更新日時（日本時間） | 更新内容サマリ | 反映・検証状況 | 変更の証拠 |
| --- | --- | --- | --- | --- | --- |
| リポジトリ整理 | アプリ版変更なし | 2026-10-12 16:00:22 | 未使用ファイル45件削除、README整理 | GitHub main反映済み。参照・PDF分割・拡張処理のコード試験通過。機能修復ではない | [22c9de0](https://github.com/mitsu43/pdf-extractor-tool/commit/22c9de00f9582e33744748c7f0855d22058b5f75) |
| 修復候補（source内） | v2026.10.12.3-rc1 | 2026-10-12 15:54:34 | 部分取得時の説明保全、空画像除外、接続確認先行 | sourceへ登録済み。本番用ルートには未反映。模擬試験・Chrome試験データで検証。実際の生成済み5枚は未確認 | [be972f2](https://github.com/mitsu43/pdf-extractor-tool/commit/be972f2a9858f05cc986dd10e6ea4f152ef46311) / [検証記録](REPAIR-RESULT.txt) |
| 診断画面 | v2026.10.12.2 | 2026-10-12 15:28:48 | コンソール不要の診断結果ダウンロード | GitHub反映済み。本番URLで読み取り専用診断を実行し、51記事と拡張1.4.2の応答を確認 | [c332d98](https://github.com/mitsu43/pdf-extractor-tool/commit/c332d98641553b228694d4e5124c38f5aad736b0) / [診断画面](https://mitsu43.github.io/pdf-extractor-tool/connection-check.html) |
| 抽出ツール（公開用ルート） | v2026.10.11.9 | 2026-10-12 06:48:33 | 画像・説明の保存復元、旧ジョブの再送抑止、拡張識別 | GitHub公開用コードに反映済み。実際の生成済み5枚の取り込み・次の5件の実生成は未確認 | [a7c97a3](https://github.com/mitsu43/pdf-extractor-tool/commit/a7c97a351f1dd6043c1c3b9510d526ce598d2c23) |
| 画像取込拡張（配布版） | 1.4.4 | 2026-10-12 06:48:33 | 復旧時の再送抑止、拡張識別 | GitHub配布済み。利用者Chromeへの適用は未確認。2026-10-12 15:43の実測応答は1.4.2 | [a7c97a3](https://github.com/mitsu43/pdf-extractor-tool/commit/a7c97a351f1dd6043c1c3b9510d526ce598d2c23) / [拡張ZIP](downloads/gemini-map-import-extension-1.4.4.zip) |

**現在の未完了事項：実際のGemini生成済み5枚の取り込みと、その後の未処理5記事への自動移行。修復完了とは報告していません。**

### 更新時の記録ルール

- 更新のたびにこの表へ行を追加し、過去の記録を残します。
- 抽出ツール・拡張・診断画面・修復候補を別々に記載します。
- 「コード試験」「試験データのブラウザ確認」「実際のGeminiを含む一連の動作確認」を区別します。
- GitHubへの反映、サイトへの配信、端末への適用を混同しません。
- 変更コミットと検証記録をリンクします。README自体の更新日時は[READMEの履歴](https://github.com/mitsu43/pdf-extractor-tool/commits/main/README.md)で確認できます。

## ファイルの区分

| 場所 | 用途 |
| --- | --- |
| ルートの `index.html` と `figure-*.js` 等 | GitHub Pagesの公開用コード。コード内の版は `v2026.10.11.9` |
| `connection-check.html` | 記事・画像・進捗を変更しない診断画面 |
| `downloads/` | 配布用の画像取込拡張1.4.4。インストール済みの版とは別 |
| ルートの `manifest.json`、`background.mjs` 等 | 拡張機能のソース |
| `source/` | 引き継ぎ・修復候補。公開用ルートと同一ではない |
| `tests/` と `test-*.mjs` | 検証コード。修復候補を参照するテストも含む |
| `REPAIR-RESULT.txt` | 修復候補の変更・検証結果・未確認事項 |

`source/`をアップロードするだけでは、公開サイトのルートに修正は反映されません。
実際のGemini画像の取り込み・自動続行が未確認の候補を、動作確認済みとは扱いません。

## 維持する仕様

- PDFは5ページ単位で分割。画像生成の5記事単位とは別です。
- 1記事につき独立画像1枚。画像生成APIは使用しません。
- 既存記事・画像・進捗を削除せず、記事IDとタイトルを照合します。
- 端末保存と日経マップへのサイト保存は別です。
- iCloudマスターは `news1共通`。今回のリポジトリ整理では変更していません。

## 2026-10-12の整理

未使用のChatGPT画面保存用CSS・スクリプトと旧版フォルダ2つを削除しました。

- `pdf-extractor-five-page-v2026.10.10.9/`
- `pdf-extractor-fixed-split-v2026.10.10.8/`

公開アプリの処理・記事データ・拡張の権限は変更していません。
削除前の状態はGit履歴の `be972f2` から参照・復元できます。
