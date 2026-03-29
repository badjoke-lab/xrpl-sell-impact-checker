# Flow Alert 改訂版仕様書

**対象ルート**: `/apps/flow-alert/`
**ページ名**: `Flow Alert — XSIC`
**位置づけ**: XSIC 内の **ラベル付きフロー監視ページ**
**設計思想**: **history-first + live-inclusive**
**前提**: 履歴を土台にするが、**live whale-flow と escrow-watch を絶対に消さない**。live が弱い時ほど、その状態を明示する。

---

## 1. このページの役割

このページは、XRPL 上の特定プリセットについて、次の問いに答えるためのページとする。

* 最近、ラベル付きフローは起きたか
* そのフローはどのラベルで起きたか
* IN / OUT / XFER のどれか
* 直近 snapshot の trend は強まっているか、静かか
* 今見えている情報は **history が主なのか / live assist が主なのか**
* escrow 周りに意味のある動きはあるか

このページは、**履歴しか見えないページ**にも、**live だけを装うページ**にもしてはいけない。
完成形は、**履歴を安定基盤にしながら、live assist を上に重ねる監視ページ**である。

---

## 2. このページで提供する価値

このページの価値は、単なるダッシュボードではなく、**「最近のラベル付きフローの証拠」と「いまの live 補助圧」を同時に見ること**にある。

ユーザーがこのページで得る価値は以下。

* 直近で何が起きたかが分かる
* 最近の trend が上向きか下向きか分かる
* live が今どの程度見えているか分かる
* escrow が補助材料として生きているか分かる
* 他ページで見た異常の裏付けを取れる

このページは、**単独主役ページというより、XSIC 全体の補助証拠ページ**として成立させる。

---

## 3. データソース優先順位

### 3-1. Primary

`flow-history`

* `1h / 24h / 7d` は history を主読みにする
* repo JSON があれば最優先
* repo JSON が無ければ runtime fallback history

### 3-2. Live assist

`whale-flow`

* live 取得が成功した場合、現在圧として visualizer と summary に反映する
* 失敗してもページ全体は成立する
* ただし、失敗を隠してはいけない

### 3-3. Secondary live context

`escrow-watch`

* 補助情報として残す
* 主役にはしない
* 成功時は意味のある補助情報として表示
* 失敗時は unavailable を明示

### 3-4. Source priority summary

表示の組み立て順は以下。

1. history
2. live whale-flow assist
3. escrow live context

---

## 4. Window ごとの役割

### 5m

* **live assist window**
* short-window 補助観測
* sparse でも許容
* 履歴は補助

### 1h

* **standard observation window**
* 最もバランスが良い基準 window

### 24h

* **primary comparison window**
* このページの標準比較軸

### 7d

* **trend confirmation window**
* 短期 alert ではなく、長めの傾向確認用

---

## 5. ページ全体構成

改訂後のページは次の構成とする。

1. Header
2. Hero
3. Controls
4. Availability / Source status strip
5. Primary signal card
6. Main Visualizer
7. Latest labeled event card
8. Recent detections list
9. Snapshot trend summary
10. Escrow assist panel
11. Notes / degraded state footnote

---

## 6. Header / Hero

### Header

* XSIC 共通ヘッダー
* グローバルナビあり

### Hero

* タイトル: `Flow Alert`
* サブタイトル:
  `Monitor recent labeled XRPL flows with history baseline and live assist overlay.`

Hero の時点で、
**このページは history も live も両方見るページ**であることを明示する。

---

## 7. Controls 仕様

### Preset

選択肢を維持する。

* `exchanges`
* `whales`
* `ripple`
* `unset`

### Window

選択肢を維持する。

* `5m`
* `1h`
* `24h`
* `7d`

### Toggle

* `Lite mode`
* `Demo only`

### Button

* `Refresh`

### 保存

現在の localStorage 保存方針を維持する。

* liteMode
* demoOnly.v2
* targetPreset
* window

---

## 8. Availability / Source status strip

Controls の直下に、**このページで最も重要な状態表示帯**を置く。

### 表示項目

* Primary source
* Live assist
* Escrow
* Freshness
* Window role

### 表示例

* `Primary: flow-history (repo history)`
* `Live assist: degraded (timeout)`
* `Escrow: unavailable`
* `Freshness: history 2026-03-24 23:40`
* `Window role: primary comparison`

### ルール

* live が死んでいても strip は必ず出す
* 「history は生きている / live は死んでいる」を同時に見せる
* ここで誤魔化しは禁止

---

## 9. 状態モデル

このページの page-state は次の6種類。

* `LOADING`
* `HISTORY`
* `LIVE`
* `HYBRID`
* `ERROR`
* `EMPTY`

### LOADING

* 初回取得中
* history も live も未確定

### HISTORY

* history で成立
* live assist は unavailable / degraded
* ただしページは使える

### LIVE

* 5m などで live assist が主
* history は補助

### HYBRID

* history と live assist の両方が成立
* このページの理想状態

### ERROR

* history も最低限成立せず、ページ全体が意味を持たない

### EMPTY

* preset 未設定、または表示対象なし

---

## 10. Status / Updated の表示ルール

### Status

* `LOADING`
* `HISTORY`
* `LIVE`
* `HYBRID`
* `ERROR`
* `EMPTY`

### 判定基準

* history ok && live degraded → `HISTORY`
* history ok && live ok → `HYBRID`
* history weak && live ok → `LIVE`
* 両方弱い → `ERROR`
* 初回取得中 → `LOADING`
* preset unset → `EMPTY`

### Updated

* history 主読時 → `history {timestamp}`
* live 主読時 → `{n}s ago`
* hybrid 時 → `history {timestamp} / live {n}s ago`
* データ無し → `—`

---

## 11. Primary signal card

このカードはページ最上部の summary であり、最も重要。

### 構成

* Status pill
* Net impact
* Why now
* Context

### Status pill

候補:

* `QUIET`
* `LOW`
* `MEDIUM`
* `HIGH`

### 判定材料

* latest netXrp
* previous との差分
* matchedEvents
* recentCount
* live current pressure
* window profile

### Why now

以下を優先順で採用。

1. latest labeled event の reason
2. history delta と recent detections の組み合わせ説明
3. live assist が強い場合の current pressure explanation
4. quiet / empty hint

### Context chips

* `target`
* `window`
* `primary source`
* `live assist state`
* `escrow state`

### Context line

* recent snapshot 数
* oldest → newest
* latest / previous / Δ
* stale / sampled / cache fallback
* window role

---

## 12. Main Visualizer（必須）

**全ページに visualizer を置くルールに従い、このページにも必ず置く。**
ただし、現行の弱い heatmap ではなく、**history base + live overlay** の混成 visualizer に変える。

### 12-1. Main Viz の目的

一目で以下が分かること。

* 最近、どのラベルでイベントがあったか
* IN / OUT の偏り
* recent snapshots の trend
* live assist が今どう見えているか

### 12-2. 構成

Main Viz は3層構造にする。

#### A. History base layer

* recent snapshots の trend
* labeled event lanes
* net XRP line
* matched events / payments bars

#### B. Live overlay layer

* current live pressure marker
* current inflow / outflow bias
* live success 時のみ強調
* live degraded 時は薄く＋ badge

#### C. Escrow marker layer

* meaningful な next unlock がある場合のみ小さく重ねる
* 主役にはしない

---

## 13. Main Viz の表示仕様

### 13-1. Event lanes

* 行 = ラベル
* 列 = recent detections / recent snapshots
* 色:

  * IN = blue
  * OUT = red
  * XFER = neutral/slate
* 強さ = amountXrp の大きさ
* latest detection は outline 強調

### 13-2. Net trend line

* x軸 = snapshots
* y軸 = netXrp
* 0ラインを常設
* latest point を強調
* previous と latest の差が視覚で分かる

### 13-3. Activity bars

* payments scanned
* matched events
* latest vs recent average が分かるようにする

### 13-4. Live overlay

* live whale-flow success 時のみ表示
* current live signal を右端 overlay に重ねる
* 表示要素:

  * current live direction
  * current live net estimate
  * live freshness badge
* degraded 時は

  * overlay を薄く
  * `degraded` / `timeout` badge を付与

### 13-5. History-only fallback

live が死んでいる場合でも、Main Viz は成立する。
ただしその場合は必ず、

* `History baseline`
* `Live assist unavailable`

の両方を visualizer 内または head で明示する。

### 13-6. 禁止事項

* 空白塗りつぶし
* `Unknown` 1行だけの fake heatmap
* 何を見せているか分からない抽象表示

---

## 14. Main Viz head

Main Viz の head には必ず次を出す。

* title: `Main Viz`
* note: `History baseline with live assist overlay`
* chips:

  * `history base`
  * `live assist: ok / degraded / unavailable`
  * `escrow: ok / unavailable`

---

## 15. Latest labeled event card

Main Viz の下に、**現在このページで最重要な1件**を置く。

### 表示項目

* Time
* Label
* Direction
* Amount
* Reason
* Source type
* Snapshot window

### 取得順

1. latest snapshot の latestEvent
2. previous/latest/history から最も新しい detected event
3. payload events fallback
4. 無ければ `No recent labeled event`

### 役割

このカードだけ見れば、
**「最近の最重要イベントは何か」**が分かること。

---

## 16. Recent detections list

### 表示内容

直近 5〜10 件を縦一覧で出す。

各 row:

* time
* label
* dir
* amount
* short reason
* source type（history / payload / live assist）
* source snapshot time
* source window

### 並び順

* 新しい順

### dedupe

* txHash
* time
* label
* dir
* amountXrp
  で重複除去

### empty 時

* `No recent labeled detection yet in this window.`
* ただし history はある / live だけ弱い、などの状態を補足表示

---

## 17. Snapshot trend summary

### 表示項目

* Latest snapshot
* Net delta vs previous
* Recent history count
* Last detected event
* Live assist freshness
* Live assist status

### 役割

Main Viz が視覚、ここが数字の補助。

---

## 18. Escrow assist panel

**Escrow は残す。消さない。**
ただし主役にはしない。

### 表示項目

* Next
* Stats
* Pattern
* Recent
* Escrow source state

### 状態

#### Escrow available

* next unlock あり
* stats 埋まる
* pattern note あり得る
* recent list が出る

#### Escrow degraded

* panel は残す
* head に `degraded` badge
* unavailable reason を出す
* fallback であることを明示

#### Escrow unavailable

* panel は縮約表示
* `Escrow assist unavailable`
* 直近 meaning が無いなら最小表示

### ルール

* 完全削除はしない
* ただし dead な巨大箱にしない
* Flow Alert の主役を奪わない

---

## 19. Demo mode

Demo only ON の時は、**理想状態の完成版見本**を出す。

### 必須

* history base が成立
* live overlay も成立
* latest event が強く表示
* recent detections が複数
* escrow も meaningful
* Main Viz が完成形で読める

### 禁止

* demo なのに degraded fallback 風に見せること

---

## 20. 失敗時の扱い

### 20-1. history ok / live fail

* page state: `HISTORY`
* page は成立
* live assist unavailable を明示
* escrow は別途 state を出す

### 20-2. history ok / live ok

* page state: `HYBRID`
* 理想状態
* history base + live overlay 両方出す

### 20-3. history weak / live ok

* page state: `LIVE`
* 5m で起こりうる
* live を強く、history を補助に回す

### 20-4. history fail / live fail

* `ERROR`
* Main Viz に error overlay
* source status card に失敗理由
* Retry あり

### 20-5. preset unset

* `EMPTY`
* empty overlay
* preset 復帰導線あり

---

## 21. コピー方針

### 原則

* live が死んでるのに成功っぽく見せない
* history 主読なのに live 顔をしない
* degraded を隠さない
* sampled / cached / fallback を隠さない

### 禁止

* `source: runtime` のような雑な表現
* 何が primary か分からない文
* 空白をそれっぽく言い換えること

### 推奨表現

* `Primary: history (repo)`
* `Live assist: degraded (timeout)`
* `Escrow: unavailable`
* `History baseline active`
* `Live overlay not available`

---

## 22. モバイル挙動

### 必須

* 360px 幅で崩れない
* Main Viz は縦優先
* latest event は1カードで読める
* recent detections は1列
* source status strip は折り返しても読める
* escrow は縮約状態でも意味が分かる

### Main Viz mobile

* lanes + trend を1 canvas に詰め込みすぎない
* 必要なら

  * 上: event lanes
  * 下: trend
    で縦積み

---

## 23. パフォーマンス / 更新ルール

### polling

* Lite mode ON: 12s
* Lite mode OFF: 8s

### visibilitychange

* hidden で止める
* visible で再開

### fastpath

* history を先に使う
* live は assist として timeout 付き
* live の遅延で page 全体を LOADING に貼り付けない

---

## 24. 実装上の明確な完成条件

この改訂版 Flow Alert が完成と見なせる条件は以下。

1. **履歴が土台として安定して読める**
2. **live assist が消えず、成功/失敗が明示される**
3. **Main Viz が history base + live overlay として読める**
4. **latest event が一目で分かる**
5. **recent detections list が証拠として使える**
6. **escrow が残るが、主役面しない**
7. **ページ全体を見て「今何が分かるか」が明確**
8. **今のように“このゴミページ見て何が楽しいの？”とはならない**

---

## 25. 一文要約

**改訂後の Flow Alert は、flow-history を安定基盤にしつつ、whale-flow の live assist と escrow-watch の補助情報を重ねて表示する、history-first / live-inclusive の labeled flow monitor であり、必ずビジュアライザーを持ち、latest event・trend・live state・escrow state を同時に読めるページとする。**

