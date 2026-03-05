# PR-S1a: XSIC 静的モジュール化 事前調査メモ（実装禁止）

> 対象: 現行の静的構成（`index.html` + `app.js` + `apps/*` + `shared/*` + `functions/*`）
> 方針: **コード挙動は変更しない**。行番号根拠つきで「分割設計のための現状把握」のみを記録。

---

## 1) URL → 配信ファイル 対応表（根拠つき）

### 1-1. 必須URL

| URL | 配信ファイル（現状） | 根拠 |
|---|---|---|
| `/` (Console) | `index.html` | Consoleページ本体があり、Apps導線を持つ。`<a href="/apps/sell-impact/">` 等が同ページに存在。 (`index.html:16-45`) |
| `/apps/sell-impact/` | `apps/sell-impact/index.html` + `app.js` | Sell Impactページ本体。末尾で `type="module" src="/app.js"` を読んでいる。 (`apps/sell-impact/index.html:6-10,502`) |
| `/apps/liquidity-pulse/` | `apps/liquidity-pulse/index.html` + `apps/liquidity-pulse/liquidity-pulse.js` | ページ末尾で専用JSを `defer` 読込。 (`apps/liquidity-pulse/index.html:6,79-82`) |
| `/apps/flow-alert/` | `apps/flow-alert/index.html` + `apps/flow-alert/flow-alert.js` | ページ末尾で専用JSを `defer` 読込。 (`apps/flow-alert/index.html:6,93-95`) |
| `/apps/exposure-graph/` | `apps/exposure-graph/index.html` | Exposure Graphのcoming soonページ。`app.js` は未読込。 (`apps/exposure-graph/index.html:6,21-37`) |
| `/faq` | `/faq/` へ 301 → `faq/index.html` | `_redirects` で `/faq` を `/faq/` へ正規化。FAQ本体は `faq/index.html`。 (`_redirects:11-13`, `faq/index.html:6-10`) |
| `/methods` | `/methods/` へ 301 → `methods/index.html` | `_redirects` で `/methods` を `/methods/` へ正規化。Methods本体は `methods/index.html`。 (`_redirects:13`, `methods/index.html:6-10`) |
| `/disclaimer` | `/disclaimer/` へ 301 → `disclaimer/index.html` | `_redirects` で `/disclaimer` を `/disclaimer/` へ正規化。 (`_redirects:15`, `disclaimer/index.html:6-10`) |
| `/credits` | `/credits/` へ 301 → `credits/index.html` | `_redirects` で `/credits` を `/credits/` へ正規化。 (`_redirects:11`, `credits/index.html:6-10`) |
| `/donate` | `/donate/` へ 301 → `donate/index.html` | `_redirects` で `/donate` を `/donate/` へ正規化。 (`_redirects:14`, `donate/index.html:6-10`) |

### 1-2. `/docs/*` について

- ルーティング上の `"/docs/..."` 正規化ルールは `_redirects` に定義なし。 (`_redirects:1-15`)
- リポジトリには `docs/*.md` は存在するが、`docs/index.html` は存在しない（少なくとも `rg --files` 上）。
  - 例: `docs/spec.md`, `docs/debug.md`, `docs/tokenlist.md`, `docs/free-ops.md`, `docs/ui-rules.md`。
- 現行のグローバルナビの Docs リンク先は `/methods/` であり、`/docs/` ではない。 (`shared/nav.js:5`, `faq/index.html:57`, `donate/index.html:72`)

### 1-3. 補足（レガシーURL）

- `.html` 直URLはフォルダURLへ301する設計。 (`_redirects:2-8`)
  - 例: `/faq.html` → `/faq/`, `/methods.html` → `/methods/`。

---

## 2) `app.js` 責務分解（行番号つき）

> 結論: `app.js` は **Sell Impact 専用ロジックの巨大モノリス**。Console/他appsの初期化ディスパッチは持たない。

### 2-1. ナビ / ヘッダー / フッター描画

- **`app.js` 内には実装なし**。
- 共通ナビ・フッターは `shared/nav.js` が `[data-global-nav]` / `[data-global-footer]` を置換・描画。 (`shared/nav.js:16-42,52-68`)

### 2-2. ルーティング / ページ初期化（location/path/hash）

- SPAルータ（`pathname` ベースディスパッチ）は **なし**。
- 実質的なURL処理はSell Impact内部の以下のみ:
  - Share URL query の読込・適用（`window.location.search`）。 (`app.js:1660-1675`)
  - Share URL更新（`history.replaceState` + `window.location.href`）。 (`app.js:1634-1640`)
  - Resultsタブのhash同期（`location.hash` + `history.replaceState('#'+key)`）。 (`app.js:4857-4864`)
- 初期化トリガは `DOMContentLoaded`。 (`app.js:336-349`)

### 2-3. i18n初期化（`src/i18n/page.js` / `page-init.js` 接続）

- `app.js` は `src/i18n/index.js` から直接importし、`initI18n()`で辞書ロード・翻訳適用・言語スイッチャ接続を行う。 (`app.js:120-131,308-334`)
- `page-init.js` / `page.js` は docs系ページ向けの別導線で、`initI18nPage()`を呼ぶ。 (`src/i18n/page-init.js:1-3`, `src/i18n/page.js:11-20`)
- よって **`app.js` と `page-init.js` の直接接続点は現状なし**（i18n基盤共有のみ）。

### 2-4. API呼び出し共通処理（fetch/retry/cache/stale）

- Book Offers API endpoint定義: `/api/book-offers`。 (`app.js:135,240-245`)
- タイムアウト付きfetch（AbortController）+ JSON parseエラー処理 + APIエラーcode抽出。 (`app.js:2030-2130`)
- リトライ制御（`ORDERBOOK_API_RETRIES=2` でloop）。 (`app.js:245,2201-2242`)
- cache/stale表示用ステータス解決。 (`app.js:549-570`)
- AMM情報API呼出し（`/api/amm-info`）は別関数。 (`app.js:136,2392-2395`)

### 2-5. “Sell Impact”固有ロジック入口

- `estimateButton` click ハンドラが主入口（入力検証→book-offers→AMM→結果描画）。 (`app.js:4419-4748`)
- Sell ImpactページHTMLが `app.js` を module読込。 (`apps/sell-impact/index.html:502`)

### 2-6. “Liquidity Pulse”固有ロジック入口

- `app.js` には入口なし。
- 専用入口は `apps/liquidity-pulse/liquidity-pulse.js` の `boot()`。 (`apps/liquidity-pulse/liquidity-pulse.js:9-19`)
- `DOMContentLoaded` で `boot` を起動。 (`apps/liquidity-pulse/liquidity-pulse.js:465-467`)

### 2-7. “Flow Alert / Exposure Graph”入口

- Flow Alert:
  - `app.js` 入口なし。
  - 専用入口 `apps/flow-alert/flow-alert.js` の `boot()`。 (`apps/flow-alert/flow-alert.js:12-20,425-427`)
- Exposure Graph:
  - JS専用入口ファイルは未配置（ページ内インラインscriptのみ）。 (`apps/exposure-graph/index.html:31-37`)

### 2-8. Lite mode（スイッチ/UI/適用）

- 共通ヘッダの Lite mode トグル描画・状態反映は `shared/nav.js`（`[data-lite-mode-toggle]` + `window.XSICUiKit`）。 (`shared/nav.js:70-86`)
- Liquidity Pulse / Flow Alert は各アプリ内に独自Lite mode実装あり。 (`apps/liquidity-pulse/liquidity-pulse.js:2,84-97`, `apps/flow-alert/flow-alert.js:2-4`)
- `app.js` 本体でLite mode制御は確認できず（Sell Impact側はヘッダ上の共通トグル頼み）。

### 2-9. Status strip / `/api/health` 呼び出し

- **`app.js` には `/api/health` 呼び出しなし**。
- 状態ストリップは `shared/status.js` が `[data-status-strip="health"]` を対象に `/api/health` を定期poll。 (`shared/status.js:5-6,66-73,91-99,121`)

---

## 3) 分割後ターゲット構造（最小提案・URL維持）

> 前提: URLは現行維持（`/apps/sell-impact/` 等は不変）。

### 3-1. `app.js` に最終的に残すもの（最小）

- Sell Impact専用ページでのみ実行される「薄いブートストラップ」に縮小。
- 具体:
  - DOM readyで `initSellImpactApp()` を1回呼ぶだけ。
  - 旧グローバル公開（`window.__xsicSetTab` 等）は必要最小限に限定。

### 3-2. `shared/` に寄せる責務（共通化候補）

- `shared/i18n-runtime.js`（仮）
  - `initI18n` 周辺（辞書load/apply/switch連携）。
- `shared/http-client.js`（仮）
  - timeout付きfetch、エラーcode正規化、retry、debug info生成。
- `shared/share-url.js`（仮）
  - URLSearchParamsの読込/反映/更新デバウンス。
- `shared/ui-status.js`（仮）
  - status/error/endpoint表示や共通トースト。
- 既存 `shared/nav.js`, `shared/status.js`, `shared/ui-kit.js` は維持しつつ責務境界を明示。

### 3-3. `apps/*` 入口（公開関数名）

- `apps/sell-impact/main.js` → `export async function initSellImpactApp()`
- `apps/liquidity-pulse/main.js` → `export function initLiquidityPulseApp()`
- `apps/flow-alert/main.js` → `export function initFlowAlertApp()`
- `apps/exposure-graph/main.js` → `export function initExposureGraphApp()`（現状stubでも明示）

### 3-4. URL維持の適用方法

- HTML側script差し替えのみでURL不変:
  - `/apps/sell-impact/index.html` は `/app.js` から `/apps/sell-impact/main.js` へ移行（将来PR-S1b）。
  - 他appsは既存URL・既存indexを維持したまま入口ファイルを明示。

---

## 4) 依存関係の地雷（壊れポイントと回避策）

### 地雷A: グローバル変数 / window公開依存

- `window.__xsicSetTab` を複数IIFEが上書きしている（T04c/T04f）。 (`app.js:4874,4923`)
- `window.updateDebugPanel` の有無を仮定したmonkey patchがある。 (`app.js:4937-4972`)
- **回避策**: グローバルAPIを `shared/runtime-bridge.js` に一本化し、上書き禁止ルールを導入。

### 地雷B: DOM id/class の直参照密結合

- `app.js` が多数の固定セレクタに直接依存（例: `#currency-input`, `#issuer-input`, `#depth-chart` など）。 (`app.js:351-435`)
- 末尾パッチに `#currency` / `.suggestions` を直接参照する互換コードが混在。 (`app.js:4783-4808`)
- **回避策**: `selectors.js` を1箇所管理化し、要素未存在時のfail-fast方針を定義。

### 地雷C: i18n読み込み順

- `DOMContentLoaded` で `initI18n().finally(() => resetResults())` を実行。 (`app.js:336-349`)
- 関連UI更新は `t()` 前提で多数呼ばれる。 (`app.js:498-527`)
- **回避策**: `initSellImpactApp` 内で `await initI18n` 後にUI初期描画を行う順序を固定。

### 地雷D: Canvas/チャート初期化順

- Sell ImpactはSVGチャート要素（`#depth-chart`, `#impact-chart`）前提。 (`apps/sell-impact/index.html:325-350`)
- Liquidity/Flowは `canvas.getContext('2d')` 成功を前提にboot。 (`apps/liquidity-pulse/liquidity-pulse.js:63`, `apps/flow-alert/flow-alert.js:60`)
- **回避策**: 各app入口で「必須要素解決→不足時に即return」の初期化ガードを統一。

### 地雷E: 旧HTML/旧JS残骸との取り違え

- リポに `index.before-xsic-ui.html`, `index.broken-0207.html`, `app.before-xsic-ui.js`, `_old_app.js` が残存（紛れやすい）。
- **回避策**: PR-S1bで「現役エントリ一覧」をdocs化し、import元をCI grepで固定（旧ファイル参照を禁止）。

### 地雷F: assetsパス（absolute/relative）

- 現行は `/styles.css`, `/shared/nav.js`, `/api/...` 等の**絶対パス前提**。 (`apps/sell-impact/index.html:12`, `apps/liquidity-pulse/index.html:79-82`, `shared/status.js:68`)
- モジュール分割時に相対importへ崩すと、階層差で404化しやすい。
- **回避策**: ブラウザ読込URLは絶対パス継続、ESM importも原則ルート起点に統一。

---

## 5) 次PR（PR-S1b: 実装）チェックリスト（DoD草案）

- [ ] `/apps/sell-impact/` の動作URLを維持したまま、`app.js` から `apps/sell-impact/main.js` へ入口を分離。
- [ ] `shared/http-client.js`（仮）で timeout/retry/error-normalize を移し、`fetchBookOffers` と `fetchAmmInfo` から利用。
- [ ] `shared/share-url.js`（仮）で query 読書きを移し、既存shareリンク互換（`currency/issuer/amount/limit/slippage/thin/fiat/lang`）を維持。 (`app.js:1594-1629,1667-1675`)
- [ ] i18n初期化順を固定（`await`後に初期描画）し、言語切替時の既存更新項目を欠落させない。 (`app.js:322-333`)
- [ ] タブ制御を1実装に統合し、`window.__xsicSetTab` の二重定義を解消。 (`app.js:4874,4923`)
- [ ] `shared/nav.js` / `shared/status.js` への依存を壊さない（Lite mode, `/api/health` strip 維持）。 (`shared/nav.js:70-86`, `shared/status.js:66-73`)
- [ ] 旧ファイルを参照していないことを確認（`before-*`, `broken-*`, `_old_app.js`）。
- [ ] 主要URLの手動スモーク:
  - `/`, `/apps/sell-impact/`, `/apps/liquidity-pulse/`, `/apps/flow-alert/`, `/apps/exposure-graph/`, `/methods/`, `/faq/`, `/donate/`
- [ ] `_redirects` のURL正規化（`/faq`→`/faq/` 等）を壊していないことを確認。 (`_redirects:11-15`)

---

## 調査コマンド記録

- `rg --files`
- `nl -ba app.js | sed -n '...'`
- `nl -ba index.html`
- `nl -ba apps/*/index.html`
- `nl -ba shared/nav.js shared/status.js`
- `nl -ba src/i18n/page-init.js src/i18n/page.js`
- `nl -ba _redirects`
- `rg -n "..." app.js apps/*/*.js`

