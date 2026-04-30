# XRPL Token Heatmap 固定仕様書

## 1. 目的

XRPL Token Heatmap は、**XRPL トークン群を market / liquidity / exit-route の観点で俯瞰し、気になる token から XSIC の詳細確認ツールへ遷移するための探索ページ**である。

このページは、単なる価格ランキングや token 一覧ではない。
主目的は次の問いに答えること。

- XRPL token の中で、どの token が市場規模・流動性・出来高の面で大きいか
- どの token が直近で上昇・下落しているか
- どの token が流動性面で厚いか、薄いか
- どの token に XRP への exit route があるか
- 気になる token を Sell Impact / Route Compare / Liquidity Pulse / Exit Coverage Map で深掘りできるか

初版では **Top 100 tokens** を対象にし、安定確認後に **Top 200**、さらに実使用量確認後に **Top 300** へ拡張する。

---

## 2. ページの位置づけ

URL は以下に固定する。

```txt
/apps/token-heatmap/
```

表示名は以下。

```txt
XRPL Token Heatmap
```

副題は以下。

```txt
Market, liquidity, and exit-route treemap for XRPL tokens.
```

初期位置づけは **Labs / Visualizers** とする。
Core tools にはまだ入れない。

理由:

- Sell Impact / Route Compare / Liquidity Pulse / Flow Alert / Exit Coverage Map / Exposure Graph は個別判断ツール
- Token Heatmap は複数 token を俯瞰する探索入口
- 初期は Top 100 から始めるため、安定確認前に core tool 扱いしない

---

## 3. 含むもの / 含まないもの

### 3.1 含むもの

- 独立した固定ページ
- Top N token の treemap 表示
- Market Mode
- Liquidity Mode
- Exit Mode
- snapshot status
- mode controls
- Canvas 2D treemap
- PC / mobile 操作
- selected token detail
- mini ranking / fallback list
- legend / how to read
- Sell Impact / Route Compare / Liquidity Pulse / Exit Coverage Map への deep link
- stale / degraded / demo / real の区別

### 3.2 含まないもの

- ユーザーごとのリアルタイム全 token 再計算
- 15秒 polling
- 秒単位更新
- raw upstream body の長期保存
- 全 XRPL token の常時監視
- Heatmap 内での Sell Impact 計算完結
- trade execution
- 価格保証
- 安全性保証
- issuer の真偽判定
- investment advice

---

## 4. 初版スコープ

### 4.1 初期公開

```txt
Top 100 XRPL tokens
```

初期のデータ更新は snapshot 型を前提にする。

```txt
更新頻度: 1時間ごとを目標
表示: latest snapshot
保存: current row + latest snapshot
raw保存: なし
```

ただし実装初期 PR では、まず **静的 Top 100 mock data** で Canvas / 操作感を成立させる。
D1 / KV / cron 接続は後続フェーズ。

### 4.2 拡張段階

```txt
Step 0: 静的 Top100 mock / 操作感確認
Step 1: Top100 real snapshot 接続
Step 2: Top200 へ拡張
Step 3: Top300 は実使用量確認後
Step 4: Top500 は別フェーズとして保留
```

---

## 5. Heatmap の基本思想

通常の crypto heatmap は、一般に以下のような表示である。

```txt
面積 = market cap
色   = 24h price change
```

XRPL Token Heatmap でも、まず普通の heatmap として成立させる。
そのうえで、XSIC 独自の観点として **Exit Mode** を追加する。

---

## 6. 表示モード

初版では 3 モードを固定する。

### 6.1 Market Mode

標準の暗号資産 heatmap に近い表示。

```txt
Area = estimated market cap / market cap
Color = 24h price change
```

目的:

- どの token が市場規模として大きいかを見る
- 直近で上がっている / 下がっている token を俯瞰する
- 初心者にも理解しやすい標準 heatmap として成立させる

初期 default は **Market Mode** とする。

### 6.2 Liquidity Mode

実際の動かしやすさを見る表示。

```txt
Area = liquidity
Color = liquidity change / liquidity condition
```

目的:

- 見かけの market cap ではなく、実際の流動性を俯瞰する
- 大きく見えるが流動性が薄い token を見つける
- Sell Impact / Liquidity Pulse へ繋げる

### 6.3 Exit Mode

XSIC 独自の表示。

```txt
Area = liquidity
Color = exit coverage state
```

目的:

- XRP へ戻る exit route があるかを俯瞰する
- market cap や価格上昇だけでは見えない exit risk を見る
- Exit Coverage Map / Route Compare / Sell Impact へ繋げる

Exit Mode は「安全」判定ではない。
あくまで **XRP への経路が観測できるか** を見る。

---

## 7. Exit Mode の意味

Exit Mode の色は、Exit Coverage Map の 4状態に合わせる。

```txt
dual      = Book + AMM
book-only = Book only
amm-only  = AMM only
none      = No XRP exit observed
```

### 7.1 Book + AMM

order book と AMM の両方が観測される状態。
exit route 候補が複数ある。
ただし、価格品質や約定保証ではない。

### 7.2 Book only

order book は観測されるが AMM は観測されない状態。
板の厚さ次第では大きな売却に弱い可能性がある。

### 7.3 AMM only

AMM は観測されるが order book は観測されない状態。
プールの深さ次第で price impact が大きくなる可能性がある。

### 7.4 No XRP exit observed

観測時点では XRP への exit route が見つからない状態。
これは token が存在しないという意味ではなく、**観測上の exit route 不在**を意味する。

---

## 8. 初心者向け説明

ページ内の How to read では、以下の趣旨を短く表示する。

```txt
Bigger blocks show larger selected size metrics.
Colors show the selected signal.
Market Mode shows size and price movement.
Liquidity Mode shows where trading depth appears thicker or thinner.
Exit Mode shows whether an XRP exit route was observed through book, AMM, both, or neither.
Exit coverage does not guarantee good price, fill, or safety. Use Sell Impact before making execution assumptions.
```

日本語で要約すると次。

```txt
普通のHeatmapは「どれが大きく、上がっているか」を見る。
Exit Modeは「大きく見えるtokenでも、XRPへ戻る道があるか」を見る。
道があっても細い可能性があるため、売却前にはSell Impactで確認する。
```

---

## 9. データモデル

描画エンジンへ渡すデータは、ViewLoom 方式の `HeatmapItem` に正規化する。
XSIC 側では TypeScript ではなく plain JavaScript object として扱ってよい。

```ts
export type HeatmapItem = {
  id: string
  label: string
  shortLabel?: string
  areaValue: number
  colorValue: number
  secondaryValue?: number | null
  subtitle?: string | null
  url?: string | null
  iconUrl?: string | null
  meta?: Record<string, unknown>
}
```

XSIC token では以下に読み替える。

```txt
id             = currency + issuer
label          = token symbol
shortLabel     = token symbol
areaValue      = mode に応じた market cap / liquidity / volume
colorValue     = mode に応じた 24h change / liquidity change / exit coverage score
secondaryValue = volume / liquidity / holder count / route score
subtitle       = issuer short label
url            = primary deep link
meta           = currency, issuer, marketCap, liquidity, volume24h, priceChange24h, exitCoverage, updatedAt
```

---

## 10. Scene node

Treemap layout 後は、各 item に world 座標の矩形を付けて scene node にする。

```ts
export type HeatmapSceneNode = HeatmapItem & {
  id: string
  x: number
  y: number
  width: number
  height: number
  rank: number
}
```

`x / y / width / height` は screen pixel ではなく **world coordinates**。

---

## 11. 描画方式

ViewLoom Heatmap 方式を必須採用する。

### 11.1 採用するもの

- Canvas 2D
- Treemap layout
- Camera state
- CSS transform ではなく redraw
- Click / drag 分離
- Pinch zoom
- Responsive relayout
- LOD label
- selected overlay
- map 直下の detail panel

### 11.2 採用しないもの

- 大量 div tile
- CSS transform で盤面全体を拡大縮小する方式
- fixed world size
- wheel 常時 zoom
- 小タイルへの無理な文字詰め込み

---

## 12. Canvas レイヤ

初版は 2 canvas 構成にする。

```txt
Layer A: tiles canvas
Layer B: overlay canvas
```

### 12.1 tiles canvas

責務:

- tile fill
- tile border
- label
- value label
- LOD label

### 12.2 overlay canvas

責務:

- selected outline
- hover outline
- focus ring
- drag state

---

## 13. Camera state

Camera state は次の形を持つ。

```ts
export type CameraState = {
  zoom: number
  scale: number
  tx: number
  ty: number
  viewportWidth: number
  viewportHeight: number
}
```

座標変換:

```txt
screenX = worldX * scale + tx
screenY = worldY * scale + ty

worldX = (screenX - tx) / scale
worldY = (screenY - ty) / scale
```

ルール:

- pan は `tx / ty` を変える
- zoom は `scale / zoom` を変える
- zoom 時に treemap layout は作り直さない
- data 更新時と viewport resize 時だけ layout を作り直す

---

## 14. Treemap layout

Treemap は viewport 実寸で作る。

採用:

```txt
buildTreemap(items, 0, 0, viewportWidth, viewportHeight)
```

禁止:

```txt
WORLD_WIDTH = 1600
WORLD_HEIGHT = 960
buildTreemap(items, 0, 0, WORLD_WIDTH, WORLD_HEIGHT)
```

理由:

- PC / mobile で自然に詰まる
- ブラウザ幅変更で配置が再編される
- TradingView 的な responsive relayout に近づく

初版では binary treemap でもよい。
後続で squarified treemap に差し替え可能にする。

---

## 15. Responsive relayout

`ResizeObserver` を使い、viewport サイズ変化時に layout を作り直す。

挙動:

- resize を直接連打しない
- `requestAnimationFrame` でまとめる
- 初期実装では resize 後に fit camera へ戻す
- selected token は可能なら維持する

---

## 16. PC 操作仕様

PC 操作は以下に固定する。

```txt
通常ホイール
→ ページスクロール

Ctrl / Alt / Meta + ホイール
→ map zoom

ドラッグ
→ map pan

ダブルクリック
→ zoom in

Shift + ダブルクリック
→ zoom out

Reset zoom
→ 初期表示

タイルクリック
→ selected token 更新
```

重要:

- map 上に cursor があるだけで wheel を奪わない
- 通常 wheel はページスクロールに流す
- click と drag を分離する

---

## 17. Mobile 操作仕様

Mobile ではページスクロール優先と map 操作を明確に分ける。

### 17.1 通常時

```txt
Mode label = Page scroll
Button = Control map
Hint = Page scroll · Tap tiles
```

挙動:

- 1本指 swipe はページスクロール
- tap で selected token 更新

CSS:

```css
.heatmap-canvas-viewport {
  touch-action: pan-y;
}
```

### 17.2 Control map ON

```txt
Mode label = Pan & pinch
Button = Back to scroll
Hint = Pan & pinch
```

挙動:

- 1本指 drag = pan
- 2本指 pinch = zoom
- Back to scroll で通常時へ戻る

CSS:

```css
.heatmap-canvas-viewport.is-move-mode {
  touch-action: none;
}
```

---

## 18. Click / drag 分離

`pointerdown` 直後に選択しない。
一定距離以上動いたら drag と判定する。

```txt
PAN_THRESHOLD = 6px
```

挙動:

- `pointerdown`: 開始座標を記録
- `pointermove`: 閾値を超えたら dragging
- `pointerup`: dragging でなければ select、dragging なら pan 終了

これにより、drag 後の誤選択を防ぐ。

---

## 19. Hit test

選択は DOM ではなく world 座標で行う。

```txt
screen position
→ screenToWorld
→ scene node の矩形判定
```

Top 100〜300 では線形探索でよい。
数千件以上を扱う場合のみ spatial index を検討する。

---

## 20. LOD label

タイルの screen size に応じて表示情報を変える。

```txt
tiny
→ 色だけ

name_only
→ symbol だけ

compact
→ symbol + 変化率

standard
→ symbol + primary value + color value

featured
→ symbol + primary value + color value + secondary value
```

小タイルへ無理に文字を出さない。
文字が読めない領域では、色と hover / selected detail に任せる。

---

## 21. 色設計

### 21.1 Market Mode

```txt
green = 24h price positive
red   = 24h price negative
gray  = near flat / unknown
```

### 21.2 Liquidity Mode

```txt
green = liquidity improving / strong
red   = liquidity weakening / weak
gray  = flat / unknown
```

### 21.3 Exit Mode

Exit Mode は価格の赤緑とは意味が違うため、凡例で明示する。

```txt
Book + AMM
Book only
AMM only
No XRP exit observed
Unknown / not checked
```

原則:

```txt
面積 = 量
色   = 方向 / 状態
枠線・バッジ = 補助信号
```

禁止:

- 色に複数意味を混ぜる
- 価格上昇の緑と exit safety の緑を混同させる
- Exit Mode を安全保証のように見せる

---

## 22. ページ構成

ページ順序は以下に固定する。

```txt
Header
Hero
Snapshot status
Mode controls
Token heatmap
Selected token detail / Market status
Mini ranking
Legend / How to read
Related tools
Footer
```

### 22.1 Hero

表示:

```txt
XRPL Token Heatmap
Market, liquidity, and exit-route treemap for XRPL tokens.
```

説明:

```txt
Explore top XRPL tokens by market size, liquidity, price movement, and observed XRP exit-route condition before opening deeper XSIC tools.
```

### 22.2 Snapshot status

必須表示:

```txt
Showing top 100 XRPL tokens
Mode: Market / Liquidity / Exit
Source: demo / cached snapshot / live snapshot
Status: fresh / stale / degraded / demo
Last updated: timestamp
```

### 22.3 Mode controls

必須:

- Mode: Market / Liquidity / Exit
- Token count: Top 100 / Top 200 / Top 300
- Reset zoom
- Mobile: Control map / Back to scroll

初期では Top 200 / Top 300 を disabled または coming soon 表示にしてよい。

### 22.4 Token heatmap

PC:

```txt
左または中央 = Canvas heatmap
右または下 = selected token detail
```

Mobile:

```txt
Heatmap
Selected token detail
```

### 22.5 Selected token detail

必須表示:

- token symbol
- issuer short
- full issuer or copyable issuer
- selected mode
- market cap / estimated market cap
- liquidity
- 24h volume
- 24h change
- exit coverage state
- last checked
- data status

必須リンク:

- Estimate sell impact
- Compare routes
- Check liquidity
- Check exit coverage

### 22.6 Mini ranking

表示:

```txt
Top tokens by selected size metric
```

初期は 10〜20件でよい。
巨大 table にはしない。

### 22.7 Legend / How to read

各 mode の area / color の意味を明示する。
Exit Mode では、exit coverage が安全保証ではないことを明記する。

### 22.8 Related tools

- Sell Impact
- Route Compare
- Liquidity Pulse
- Exit Coverage Map
- Exposure Graph

---

## 23. Deep link 仕様

各 selected token から既存 XSIC tool へ遷移できること。

### 23.1 Sell Impact

```txt
/apps/sell-impact/?currency={currency}&issuer={issuer}
```

### 23.2 Route Compare

```txt
/apps/route-compare/?currency={currency}&issuer={issuer}
```

### 23.3 Liquidity Pulse

```txt
/apps/liquidity-pulse/?currency={currency}&issuer={issuer}
```

### 23.4 Exit Coverage Map

```txt
/apps/exit-coverage-map/?issuer={issuer}&currency={currency}
```

Deep link は state に関係なく生成してよい。
ただし、遷移先で no liquidity / no route になる可能性を文言で許容する。

---

## 24. Data status

Heatmap は snapshot 型なので、データ状態を必ず表示する。

### 24.1 demo

静的 mock data。
実データではない。

表示例:

```txt
Demo data · layout and interaction preview
```

### 24.2 fresh

最新 snapshot が有効。

### 24.3 stale

前回 snapshot を表示している。

### 24.4 degraded

一部 token / 一部 metric が欠落している。

### 24.5 partial

Top N のうち取得できた token だけを表示している。

---

## 25. データ取得・保存方針

初期実装では静的 mock data を使う。
その後の real data 接続では以下を原則とする。

```txt
D1: token_heatmap_current
KV: latest token heatmap snapshot
Cron: 1時間ごとを目標
History: 初期はなし、または daily compact のみ
Raw upstream body: 保存しない
```

禁止:

- 全 token の order book / AMM をページ表示ごとに fetch
- raw order book 保存
- raw API response 長期保存
- user request ごとの全 token 再計算
- 1分未満 cron
- Home で重い snapshot を自動ロード

---

## 26. Cloudflare 使用量方針

このページは XSIC の paid 配分を壊さない範囲で運用する。

初期は Top 100 に固定し、Top 200 / Top 300 は実使用量確認後に開放する。

想定:

```txt
Top 100, hourly snapshot:
100 tokens × 720 updates/month = 72,000 token updates/month
```

index 書き込み分を考慮しても、初期は軽量に抑える。

ただし、すでに XSIC では他ツールが D1 / KV / cron を使っているため、実使用量確認前に Top 300 / Top 500 へ進めない。

---

## 27. ディレクトリ構成

ViewLoom と同じディレクトリ構成にする必要はない。
XSIC の現行構成に合わせて以下にする。

```txt
apps/token-heatmap/
  index.html
  token-heatmap.css
  token-heatmap.js

shared/heatmap/
  heatmap-engine.js
  heatmap-treemap.js
  heatmap-camera.js
  heatmap-interactions.js
  heatmap-renderer.js
```

### 27.1 apps/token-heatmap/

ページ固有責務:

- SEO
- page layout
- controls
- snapshot status
- mode switching
- token payload normalization
- selected token detail
- related links

### 27.2 shared/heatmap/

描画エンジン責務:

- mountHeatmap
- canvas setup
- treemap layout
- camera
- interactions
- renderer
- LOD labels
- overlay

### 27.3 重要ルール

`shared/heatmap/` は XRPL 固有語を持たない。
`currency / issuer / exitCoverage` は `meta` に入れる。

---

## 28. 実装 PR 分割

### PR-1: Static page and shared heatmap engine

- `/apps/token-heatmap/` 作成
- `shared/heatmap/` 作成
- static Top100 mock data
- Canvas treemap
- selected detail
- PC pan / zoom / reset
- basic responsive relayout

### PR-2: Mobile operation and LOD polish

- Control map / Back to scroll
- pinch zoom
- LOD label refinement
- selected overlay polish
- mobile QA

### PR-3: Apps / sitemap / SEO integration

- `/apps/` に Labs / Visualizers 枠追加
- sitemap 追加
- JSON-LD 追加
- internal links

### PR-4: Snapshot API / KV / D1 接続

- latest snapshot endpoint
- D1 current row
- KV latest snapshot
- stale / degraded 表示

### PR-5: Top200 expansion gate

- 実使用量確認
- Top200 開放
- ranking / filter 改善

---

## 29. 受け入れ条件

### 29.1 PC

- ページを開くと heatmap が表示される
- 通常 wheel でページスクロールできる
- Ctrl / Alt / Meta + wheel で zoom できる
- drag で pan できる
- double click で zoom in できる
- Shift + double click で zoom out できる
- Reset zoom で初期表示に戻る
- tile click で selected detail が変わる
- drag 後に誤選択されない
- resize で tile layout が再編される

### 29.2 Mobile

- 通常時はページスクロールできる
- 通常時に tile tap で selected detail が変わる
- Control map で map 操作モードになる
- 1本指 drag で pan できる
- 2本指 pinch で zoom できる
- Back to scroll でページスクロールに戻る
- selected detail が heatmap 直下に出る

### 29.3 Data / UI

- Top N が明確
- mode ごとに area / color の意味が明確
- demo / real / stale / degraded / partial を混同しない
- areaValue 0 / null / NaN を除外または補正する
- 色の凡例がある
- Exit Mode を安全保証に見せない
- selected token から既存 tool へ遷移できる

---

## 30. 禁止事項

- 大量 DOM tile 方式に戻す
- wheel を常時 zoom にする
- fixed world size を使う
- 小タイルに文字を詰め込む
- selected detail を heatmap から遠ざける
- Heatmap を Home で重く自動ロードする
- 初期から Top 500 を狙う
- raw upstream body を保存する
- exit coverage を safety score として見せる
- market cap と liquidity と exit coverage を同じ色意味で混ぜる

---

## 31. 最終固定結論

XRPL Token Heatmap は、XSIC における **Labs / Visualizers 扱いの独立ページ**として作る。

描画と操作は ViewLoom Heatmap 方式をマスト採用する。
ただしディレクトリ構成は ViewLoom に合わせず、XSIC の `/apps/*` と `shared/*` 構成に合わせる。

初期 default は次。

```txt
Mode = Market Mode
Area = estimated market cap
Color = 24h price change
Tokens = Top 100
```

XSIC 独自の価値は次。

```txt
Exit Mode
Area = liquidity
Color = exit coverage state
```

このページは、単体で投資判断を完結させるものではない。
複数 token を俯瞰し、気になる token を Sell Impact / Route Compare / Liquidity Pulse / Exit Coverage Map へ送るための入口である。
