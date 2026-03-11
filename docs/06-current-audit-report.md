# XSIC 現状監査レポート（完全版）

## 1. 総論
- 全体評価: 横断P0未実施のまま個別開発継続は高リスク。`requestAnimationFrame`常時ループ、hover由来の全面再描画、Canvas DPR cap未導入が残存。根拠: docs/05-visualization-safety-spec.md:62-64,76-79,92-96,150-154,469-474 / apps/liquidity-pulse/liquidity-pulse.js:365-372,328-330 / apps/flow-alert/flow-alert.js:1105-1111,841-845。
- 横断P0を先に入れるべき理由: 仕様書P0と現状差分が一致。根拠: docs/05-visualization-safety-spec.md:469-474。
- 監査制約: 起動・build・test・依存導入なしの静的読解監査。

## 2. ページ別監査

### 2-1. Sell Impact
- 仕様一致: SVG描画ベース、partial/empty警告、debug details。根拠: apps/sell-impact/index.html:324-351,359-364 / apps/sell-impact/sell-impact.js:3271-3312,3505-3512。
- 仕様未達/逸脱: EN/JA切替残存、旧タブ残存、Why Route等専用セクション不足。根拠: docs/01-sell-impact-spec.md:89-91,96-97,111-114,168-170 / apps/sell-impact/index.html:52-73,228-231,227-357。
- 安全差分: scroll/resize直結、cleanup統一なし。根拠: apps/sell-impact/sell-impact.js:4047-4048,4253-4257 / docs/05-visualization-safety-spec.md:192-195,274-286。
- リスク: Medium。
- 優先度: P1。

### 2-2. Liquidity Pulse
- 仕様一致: Lite/Demo/Retry/overlay、hidden tab停止。根拠: apps/liquidity-pulse/index.html:55-59,148-154 / apps/liquidity-pulse/liquidity-pulse.js:91-121。
- 仕様未達/逸脱: Main Viz 4サブ領域方針に未整合（単一animated canvas中心）、degraded/partial状態機械が弱い。根拠: docs/02-liquidity-pulse-spec.md:374-382,641-669 / apps/liquidity-pulse/index.html:140-147 / apps/liquidity-pulse/liquidity-pulse.js:152-168。
- 安全差分: 常時RAF、DPR capなし、resize debounceなし。根拠: apps/liquidity-pulse/liquidity-pulse.js:328-330,353-357,365-372 / docs/05-visualization-safety-spec.md:150-154,192-193,353-354。
- リスク: High。
- 優先度: P0。

### 2-3. Flow Alert
- 仕様一致: controls/signal/metrics/heatmap/history/recent/escrow/debug構成、quiet判定。根拠: docs/03-flow-alert-spec.md:54-66,73-79,127-130 / apps/flow-alert/index.html:32-57,61-202 / apps/flow-alert/flow-alert.js:812-833。
- 仕様未達/逸脱: hover時に全面heatmap再描画、hidden tab停止未確認、resize debounceなし。根拠: apps/flow-alert/flow-alert.js:218,1105-1111 / docs/05-visualization-safety-spec.md:192-193,208-210,386-393。
- 安全差分: DPR capなし、cleanup統一なし。根拠: apps/flow-alert/flow-alert.js:841-845,1127-1131 / docs/05-visualization-safety-spec.md:150-154,274-286。
- リスク: High。
- 優先度: P0。

### 2-4. Exposure Graph
- 仕様一致: top8 bounded、inline SVG、URL state/preset/tab/state分離。根拠: apps/exposure-graph/exposure-graph.js:9,236-237,590-623,103-125,147-183 / docs/04-exposure-graph-spec.md:128-149,265-270。
- 仕様未達/逸脱: stale状態語彙は明確な実装確認なし。根拠: docs/05-visualization-safety-spec.md:221-227 / apps/exposure-graph/exposure-graph.js:23-25,147-183。
- 安全差分: 常時ループなしで概ね整合、cleanup統一は未確認。根拠: apps/exposure-graph/exposure-graph.js:55-95,590-623。
- リスク: Low。
- 優先度: P1。

## 3. 横断監査
- 常時ループ: Liquidity Pulseに常時RAF。根拠: apps/liquidity-pulse/liquidity-pulse.js:365-372。
- hover/scroll/resize負荷: Flow Alert hover全面再描画、Flow Alert resize即時、Sell Impact scroll/resize直結。根拠: apps/flow-alert/flow-alert.js:218,1105-1111 / apps/sell-impact/sell-impact.js:4047-4048。
- Canvas DPR: LP/Flowともcapなし。根拠: apps/liquidity-pulse/liquidity-pulse.js:328-330 / apps/flow-alert/flow-alert.js:841-845。
- hidden tab: LPあり、Flow未確認。根拠: apps/liquidity-pulse/liquidity-pulse.js:112-121 / apps/flow-alert/flow-alert.js:168-227。
- cleanup: removeEventListener中心の統一実装未確認。根拠: apps/sell-impact/sell-impact.js:4047-4048 / apps/flow-alert/flow-alert.js:1127-1131 / apps/exposure-graph/exposure-graph.js:623-635。
- mock CSS流入リスク: mock側にsticky/backdrop/clip-path、本番stylesにもsticky/backdrop残存。根拠: test/liquidity-pulse-ui-mock-standalone.html:1344,1478,1573,2765-2775 / styles.css:1333,1467,1561-1562,1743,1784。
- bounded view: Exposure Graphはtop8固定、Flow recent件数上限あり。根拠: apps/exposure-graph/exposure-graph.js:9,236-237 / apps/flow-alert/flow-alert.js:888-890。
- state設計: Exposureはinvalid/no_issuer/empty/errorを分離、LPはdegraded/partial弱い。根拠: apps/exposure-graph/exposure-graph.js:147-150,174-183 / apps/liquidity-pulse/liquidity-pulse.js:152-168。
- mobile/lite: Lite軽量化分岐あり。根拠: apps/liquidity-pulse/liquidity-pulse.js:133,322,336-338 / apps/flow-alert/flow-alert.js:224,380,888。

## 4. 今後の運用との差分一覧
| 現状 | 今後の基準 | 差分 | 放置リスク |
|---|---|---|---|
| LP常時RAF（apps/liquidity-pulse/liquidity-pulse.js:365-372） | 常時RAF禁止（docs/05-visualization-safety-spec.md:353-354） | 直接不一致 | 継続高負荷 |
| Flow hover全面再描画（apps/flow-alert/flow-alert.js:1105-1111） | hoverはtooltipのみ（docs/05-visualization-safety-spec.md:386-393） | 直接不一致 | 操作時フレーム落ち |
| DPR cap未導入（apps/flow-alert/flow-alert.js:841-845 / apps/liquidity-pulse/liquidity-pulse.js:328-330） | DPR cap必須（docs/05-visualization-safety-spec.md:150-154） | 直接不一致 | 高DPRで負荷増 |
| Flow hidden停止未確認（apps/flow-alert/flow-alert.js:168-227） | hidden停止必須（docs/05-visualization-safety-spec.md:208-210） | 不一致 | BG消費継続 |
| Sell EN/JA残存（apps/sell-impact/index.html:52-73） | 英語固定（docs/01-sell-impact-spec.md:89-91） | 不一致 | 仕様逸脱 |

## 5. 優先順位付き提案
### P0
1. LP常時RAF廃止（apps/liquidity-pulse/liquidity-pulse.js:365-372）。
2. Flow hover全面再描画廃止（apps/flow-alert/flow-alert.js:1105-1111）。
3. 全Canvas DPR cap導入（apps/flow-alert/flow-alert.js:841-845 / apps/liquidity-pulse/liquidity-pulse.js:328-330）。

### P1
1. hidden tab停止統一（apps/flow-alert/flow-alert.js:168-227 / apps/liquidity-pulse/liquidity-pulse.js:112-121）。
2. resize/scroll debounce-throttle統一（apps/flow-alert/flow-alert.js:218 / apps/sell-impact/sell-impact.js:4047-4048）。
3. Sell仕様逸脱是正（apps/sell-impact/index.html:52-73,228-231）。

### P2
1. Sell Explain-later強化（docs/01-sell-impact-spec.md:230-234）。
2. 共通safety helper導入（docs/05-visualization-safety-spec.md:274-286）。
3. mock CSS流入防止運用追加（docs/05-visualization-safety-spec.md:88-89,458-459）。

## 6. 結論
- 個別開発継続可否: 先行P0なしでの継続は非推奨。根拠: docs/05-visualization-safety-spec.md:469-474。
- 先に横断P0を挟むべきか: はい。根拠: docs/05-visualization-safety-spec.md:469-474。
- 安全基準の見本ページ: Exposure Graph。根拠: docs/05-visualization-safety-spec.md:414-423 / apps/exposure-graph/exposure-graph.js:590-623。
- 最も危険なページ: Liquidity Pulse / Flow Alert。根拠: apps/liquidity-pulse/liquidity-pulse.js:365-372 / apps/flow-alert/flow-alert.js:1105-1111。
