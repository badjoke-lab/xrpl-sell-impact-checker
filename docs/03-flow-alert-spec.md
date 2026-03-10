# Flow Alert 完成版仕様書

## 1. 目的

Flow Alert は、XRPL 上のラベル付きフローを **単発の瞬間表示ではなく、履歴付きで観測する状態ダッシュボード** である。

主な目的は次の3点。

1. いまの状態を素早く把握する
2. 直前との差分と最近の傾向を読む
3. 必要に応じて recent detections / heatmap / escrow / debug で根拠を掘る

本ページは「イベント一覧ページ」ではない。主役は上段の Signal / Metrics であり、一覧は補助である。

---

## 2. ページの位置づけ

- 製品名: XSIC（XRPL Signal & Insight Console）
- アプリ名: Flow Alert
- 役割: ラベル付きフロー観測ダッシュボード
- 主対象: XRPL 上の exchange / whale / ripple 関連フロー
- UX方針:
  - 上段で判断
  - 中段で傾向確認
  - 下段で詳細確認

---

## 3. データソース

### 3.1 ライブ集計
- `/api/xrpl/whale-flow`
- `/api/xrpl/escrow-watch`

### 3.2 履歴データ
- `/api/xrpl/flow-history?preset=...&window=...&limit=...`
- 正データは repo 内の `data/flow-history/*.json`
- 更新主体は GitHub Actions

### 3.3 価格
- XRP→USD は複数ソース fallback 方式
- USD取得失敗時は XRP 表示にフォールバック

### 3.4 表示優先順位
1. history JSON（repo-json）
2. live API
3. fallback / cached

---

## 4. レイアウト構成

ページは次の順で構成する。

1. Header / Title
2. Controls
3. Signal Card
4. Metrics / Snapshot
5. Main Visualization（Heatmap）
6. Sparkline / History Strip
7. Reason / Context
8. Recent Flows
9. Escrow / Unlock Watch
10. Debug

モックHTML準拠を基本とし、既存UI都合で崩さない。

---

## 5. Controls 仕様

### 5.1 項目
- Preset
- Window
- Lite mode
- Demo only
- Refresh 状態表示

### 5.2 Preset
- `exchanges`
- `whales`
- `ripple`

### 5.3 Window
- `5m`: 短期補助窓
- `1h`: 標準観測窓（初期値）
- `24h`: 主観測窓
- `7d`: 傾向確認窓

### 5.4 初期値
- 初期 window は `1h`
- localStorage に保存値がある場合はそれを優先

### 5.5 Lite mode
- 描画・表示密度を下げる軽量モード
- mobile / low-power 環境を想定

### 5.6 Demo only
- ON: ダミーデータ表示
- OFF: 履歴JSON優先 + live補助

---

## 6. Signal Card 仕様

### 6.1 表示項目
- Status
- Net Impact
- Why now
- Context

### 6.2 データソース
- `flow-history.latest`
- `flow-history.previous`
- `flow-history.deltaSummary`
- `flow-history.recent`
- fallback 時のみ live payload

### 6.3 Status
取り得る値:
- `HIGH`
- `MEDIUM`
- `LOW`
- `QUIET`

### 6.4 判定思想
- 最新値のみでなく、previous / delta / recent activity を加味
- 「quiet」は“何も取れない”ではなく“取った上で大きなラベル付き流れが無い”状態を意味する

### 6.5 Net Impact
- USDが取得できれば USD 優先
- 無ければ XRP 表示
- signed 表示とする

### 6.6 Why now
優先順位:
1. latestEvent.reason
2. 静穏説明文
3. previous / recent 補助文

例:
- No major labeled flow detected in this window.
- Previous snapshot showed exchange inflow.
- Recent detections remain low.

### 6.7 Context
含める内容:
- source
- stale / partial / sampled
- recent count
- latest snapshot 時刻
- 必要に応じて window-specific note

---

## 7. Metrics / Snapshot 仕様

### 7.1 表示項目
- Inflow
- Outflow
- Net
- Payments scanned
- Ledgers scanned
- Matched events
- Source
- Updated

### 7.2 追加補助情報
各メトリクスに必要に応じて小さく表示:
- previous
- delta
- recent count / recent total

### 7.3 表示ルール
- 値が0でも `0` として出す
- 欠損時のみ `—`
- 小さい XRP 値は小数表示で潰さない
- USD が無い時は XRP のまま表示

### 7.4 意味
このブロックは「最新値の一覧」ではなく、
**観測量 + 差分 + 更新状態** を読むためのものとする。

---

## 8. Main Visualization（Heatmap）仕様

### 8.1 役割
- latest snapshot のフロー断面可視化
- ラベル × 時間バケットの密度を見る

### 8.2 表示条件
- matrix があれば表示
- event が 0 でも描画を維持
- preset未選択か本当の取得失敗時のみ空状態扱い

### 8.3 Tooltip
- label
- signed amount
- 小さいXRP値も丸め潰さない

### 8.4 意味
Heatmap は「最近の履歴全体」ではなく、
**現在断面の視覚化** として扱う。
履歴全体の流れは sparkline 側が補う。

---

## 9. Sparkline / History Strip 仕様

### 9.1 役割
- recent history の流れを一目で補助する
- 主役ではない

### 9.2 系列
最低2系列:
- recent net flow
- recent matched events

### 9.3 表示方針
- 小型
- 相対スケール
- recent history が少ない場合は `History building…` 等で自然にfallback

### 9.4 意味
ページを「現在値だけ」から
**現在値 + 最近の流れ** に引き上げる補助可視化。

---

## 10. Reason / Context Panel 仕様

### 10.1 役割
文章で状態を補足する。

### 10.2 主な内容
- quiet時の説明
- partial/sample の説明
- scanned counts の説明
- try 24h など window導線
- recent履歴の要約

### 10.3 必須要件
- event が無い時でも意味を出す
- overlayで潰さず、カードの中で説明する

---

## 11. Recent Flows 仕様

### 11.1 役割
“現在windowの event 一覧” ではなく、
**履歴上の最近の検出イベント** を出す補助欄。

### 11.2 データソース優先順位
1. `flow-history.recent` から抽出した recent detections
2. current-window events
3. 空状態文

### 11.3 表示項目
- time
- label
- dir
- amountXrp / amountUsd
- reason
- 必要に応じて source snapshot 情報

### 11.4 件数
- desktop: 5〜8件
- mobile / lite: 3〜5件

### 11.5 空状態
- No recent labeled detection yet.
- History exists, but no labeled event has been recorded.

---

## 12. Escrow / Unlock Watch 仕様

### 12.1 役割
flow だけでは見えない供給イベント文脈を補う。

### 12.2 表示項目
- next unlock
- stats
- pattern notes
- recent unlocks

### 12.3 位置づけ
補助ブロック。Flow Alert全体の主役ではない。

---

## 13. Debug 仕様

### 13.1 役割
- source判定
- fallback状況
- historyが使われているか
- price取得経路
- errors / warnings の確認

### 13.2 確認項目例
- repo-json / runtime / cache
- lastError
- warnings
- strategy
- degradeLevel
- price_primary_failed
- price_fallback_used

### 13.3 位置づけ
通常ユーザー向け主機能ではないが、運用確認に必須。

---

## 14. 分類仕様

### 14.1 Preset
- exchanges
- whales
- ripple

### 14.2 分類の考え方
- `unknown -> exchange` = IN（売り圧候補）
- `exchange -> unknown` = OUT（引き出し候補）
- `exchange -> exchange` = XFER（内部移動候補）
- ripple 関連は独自文脈で分類
- whales は閾値ルールベース

### 14.3 reason / labelSource
各検出は、少なくとも以下が読めること。
- なぜその分類になったか
- どの label / preset に一致したか
- XFER は内部移動候補であること

### 14.4 スコア
- amount + rank ベース
- XFER は HIGH になりすぎないよう cap を持つ

---

## 15. Window別仕様

### 15.1 5m
- 短期補助窓
- 空でも異常ではない
- 主画面ではない

### 15.2 1h
- 標準観測窓
- 初期表示
- 最も安定して意味を出す窓

### 15.3 24h
- 主観測窓
- recent detections や履歴比較の主軸

### 15.4 7d
- 傾向確認窓
- sample前提でもよい

### 15.5 文言
windowごとに自然な quiet/guide 文言を出す。
例:
- 5m: short window, low signal density is normal
- 24h: no major labeled flow across a broader window

---

## 16. 履歴仕様

### 16.1 保存先
- `data/flow-history/*.json`
- 例:
  - exchanges-1h.json
  - exchanges-24h.json
  - exchanges-7d.json

### 16.2 更新主体
- GitHub Actions

### 16.3 取得API
- `/api/xrpl/flow-history`

### 16.4 構造
最低限:
- latest
- previous
- recent
- deltaSummary
- historyMeta

### 16.5 UIでの使い方
- 上段は履歴JSON優先
- live は fallback

---

## 17. 価格仕様

### 17.1 目的
- XRP→USD 換算の安定化

### 17.2 方針
- primary + fallback の複数ソース
- 失敗時は XRP 表示にフォールバック
- cache を利用

### 17.3 UIルール
- USDが取れたら USD 優先
- 無ければ XRP
- 価格未取得でページ全体が壊れないこと

---

## 18. リフレッシュ仕様

### 18.1 ルール
- 更新中でも既存表示を消さない
- REFRESHING / STALE を表示しつつ保持
- 一瞬表示されて白紙へ戻る挙動は禁止

### 18.2 source
- repo-json 優先
- live補助

---

## 19. 空状態 / エラー状態

### 19.1 空状態
- preset未選択
- history未生成
- recent detections なし

### 19.2 エラー状態
- 本当の取得失敗時のみ error overlay
- partial / sampled / cached は error にしない

### 19.3 quiet状態
- 取得できない quiet ではなく、取得した上で major labeled flow が少ない quiet を目指す

---

## 20. 完成条件

Flow Alert 完成版の定義は次の通り。

1. eventが少ない時間帯でもページとして意味がある
2. latest だけでなく previous / delta / recent が読める
3. recent detections が空欄になりにくい
4. heatmap と sparkline が補助として機能する
5. repo-json 履歴が主ソースとして使われる
6. USDが取れない時も XRP fallback で成立する
7. 5m/1h/24h/7d の役割が揃っている
8. quiet が「何も取れない」ではなく「取った上で quiet」に近い

---

## 21. 今後の改善候補

- 価格取得の本番確認と fallback 実運用確認
- exchange / ripple ラベル辞書の追加強化
- quiet判定のさらなる精度改善
- Escrow 側の履歴強化
- sparkline の見た目改善
- recent history の window横断要約

