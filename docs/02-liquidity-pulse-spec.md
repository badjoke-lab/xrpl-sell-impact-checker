# Liquidity Pulse ページ仕様（実装基準）

## 0. このページの役割

Liquidity Pulse は **実行ページではない**。
役割はあくまで **市場観測** だ。

このページで分かることは次の3つに限定する。

* **いまの流動性状態**
* **どこに流動性が分散しているか**
* **プールが健康か、不安定か**

つまり Sell Impact のように「この数量を売るとどうなる」はやらない。
Flow Alert のように「誰から誰へ資金が動いた」はやらない。
Exposure Graph のように「issuer 権限リスク」はやらない。

Liquidity Pulse の責務は一行で固定するとこうなる。

**Liquidity Pulse = 市場観測（snapshot / trend / fragmentation）＋ LP/Health ＋ Storm**

---

## 1. ページ全体の基本構造

このページは **Flow Alert と同じページシェル** で作る。
違うのは中身だけ。

ページは上から順にこう並ぶ。

1. **Global header**
2. **Hero**
3. **Controls**
4. **Stale / degraded banner**
5. **Signal / summary**
6. **History strip**
7. **Metrics grid**
8. **Main Viz**
9. **Support sections**
10. **Collapsed debug**
11. **Global footer**

見た目の系統は Flow Alert と完全統一。
つまり、

* 白基調
* 薄い枠線
* 大きめ角丸
* ほぼフラット
* 紫アクセント
* 情報密度重視
* Vercel風

で固定する。

---

## 2. このページで絶対にやること / やらないこと

### やること

* Pool の現在状態を分かりやすく出す
* 直近の変化量を簡潔に出す
* Fragmentation を見せる
* Pool Health を見せる
* Storm（急変イベント）を見せる
* データが古い / 部分欠損 / デモ なら必ず明示する
* 360pxでも崩れない
* 横スクロールを出さない
* JSが死んでも HTML 構造は残る

### やらないこと

* 注文数量入力
* Sell Impact の推定受取
* 複雑なリアルタイム高頻度描画
* 常時重いアニメーション
* sticky や blur を多用した演出
* モックそのままの重い standalone CSS の移植

---

# 3. 各セクションの仕様と挙動

## 3-1. Global header

### 役割

XSIC の共通導線。

### 内容

* 左：ブランド
* 右：`Home / Apps / Docs / Donate`
* モバイルでは既存 nav toggle を使用

### 挙動

* Flow Alert と同じ
* Liquidity Pulse 固有の分岐は作らない

---

## 3-2. Hero

### 役割

このページが何を見るものかを一発で伝える。

### 表示内容

* タイトル：`Liquidity Pulse`
* サブタイトル：
  「XRPL pools の流動性状態、断片化、健康度、急変を観測するページ」
* 必要なら1行の補足
  例：`Observation only. No execution estimate here.`

### 挙動

* 静的
* 状態に応じて文言を変えない
* Flow Alert の hero と同じ余白・フォント階層で統一

---

## 3-3. Controls

### 役割

観測条件の切替。

### 表示項目

最低限、次を持つ。

* **Pool / preset**
* **Window**
* **Lite mode toggle**
* **Demo only toggle**
* **Refresh / Retry button**
* **Status inline**
* **Updated time inline**

### 挙動

#### Pool / preset

* まずは上位 pool か既定 preset を選ぶ
* 初期値は `XRP / RLUSD` 系の既定プールでよい
* 将来検索対応してもよいが、初期は select でよい

#### Window

* `1h / 6h / 24h` など
* main viz と metrics に使う観測幅
* trend / history / storm の文脈を揃える

#### Lite mode

* ON で描画と更新を軽くする
* 具体的には：

  * update頻度を下げる
  * canvas描画負荷を下げる
  * Stormの表示点数を絞る
  * 装飾を増やさない

#### Demo only

* ON で live 取得を試さず demo データだけ使う
* デバッグや静的配信環境で使う

#### Refresh / Retry

* 現在の条件で再取得する
* loading 状態に入る
* エラー時にも同じボタンで復旧を試せる

#### Status inline

* 1行で今のモードを伝える
* 例：

  * `live / fresh`
  * `live / stale`
  * `demo`
  * `degraded`
  * `error`

#### Updated time inline

* 最終更新時刻を出す
* stale 判定の根拠にもなる

---

## 3-4. Stale / degraded banner

### 役割

「今見ている値をどこまで信用してよいか」を一段上で明示する。

### 表示条件

次のとき表示する。

* データが古い
* 一部のみ取得できた
* live 取得失敗で demo / fallback を使った
* rate limit や timeout により段階劣化した

### 文言例

* `Data may be delayed.`
* `Partial snapshot shown. Some metrics are unavailable.`
* `Demo fallback is active.`
* `Live source unavailable; showing cached snapshot.`

### 挙動

* 通常時は hidden
* 状態が悪いときだけ表示
* 色で煽りすぎず、Flow Alert の note 系表現に寄せる

---

## 3-5. Signal / summary card

### 役割

「この pool は今どういう状態か」を最上段で即答する。

### 必須4項目

ここは Flow Alert の signal card に相当する。
Liquidity Pulse では次の4ブロックを固定する。

1. **Status**
2. **Health**
3. **Why now**
4. **Context**

### 中身

#### Status

* `Stable / Watching / Thin / Stormy` など
* 現在の総合状態を短語で出す

#### Health

* `A / B / C / D`
* あるいは `Healthy / Fair / Weak / Risky`

#### Why now

* いま注意すべき理由を1行
* 例：

  * `Liquidity fell sharply in the last hour`
  * `Fragmentation is concentrated on one route`
  * `Price drift expanded while swap count rose`

#### Context

* 補足文
* 例：

  * `Observation only; execution estimate belongs to Sell Impact`

### 挙動

* snapshot更新ごとに内容を更新
* error / empty 時は、過剰に古い値を残さず中立表現に戻す

---

## 3-6. History strip

### 役割

「直近の変化」を短く並べる。

### 表示内容

横並びの短い履歴ストリップで、例えば次を出す。

* latest snapshot time
* previous delta
* recent change count
* last event

### 挙動

* 最新スナップショットが入るたび更新
* 1行で要点だけ
* 詳細な履歴ページにはしない

---

## 3-7. Metrics grid

### 役割

重要数値をカードでまとめる。

### 最低限のカード

1. **Pool Health**
2. **Active Liquidity**
3. **Fragmentation**
4. **Volatility / Drift**
5. **Large swaps / Pressure**
6. **Source / Updated**

### 各カードの意味

#### Pool Health

* A〜D
* 理由の短文つき

#### Active Liquidity

* 現在の流動性量
* 可能なら USD 概算

#### Fragmentation

* 流動性がどれだけ分散しているか
* 例：`balanced`, `bridge-heavy`, `amm-heavy`, `thin`

#### Volatility / Drift

* 価格乖離や変動の強さ
* bps か low/medium/high でもよい

#### Large swaps / Pressure

* 直近の大口スワップや圧力イベント数
* あくまで観測メトリクス

#### Source / Updated

* live / cache / demo
* 最終更新

### 挙動

* snapshot 更新で差し替え
* 値が取れないときは `—`
* stale なら補助文で知らせる

---

# 4. Main Viz の仕様

## 4-1. 役割

このページの中心。
ただし派手な1枚絵ではなく、**理解のための整理された観測パネル**にする。

### 構成

Flow Alert と同じく 2カラム。

* 左：**Main Viz panel**
* 右：**Reason / Context panel**

---

## 4-2. 左側 Main Viz panel

Liquidity Pulse の main viz は、1枚の重いアニメではなく、**4つの軽量サブ領域**で構成する。

### サブ領域

1. **Depth / Thinness**
2. **Fragmentation**
3. **LP Health**
4. **Pool Storm**

### 1) Depth / Thinness

#### 役割

いま板・流動性が厚いか薄いかを見る。

#### 表示

* 棒
* 簡易ヒート
* 単純な深さレベル
  のいずれかでよい

#### 挙動

* snapshot ごとに更新
* 時系列アニメは不要
* 1画面で「薄い/普通/厚い」が分かればよい

### 2) Fragmentation

#### 役割

流動性がどこに偏っているかを見る。

#### 表示

* AMM
* OrderBook
* XRP bridge

の比率を出す

#### 挙動

* 現在比率を表示
* 前回との差分矢印を添える
* 絶対に円グラフ必須ではない
  軽い stacked bar でもよい

### 3) LP Health

#### 役割

LP視点でこの pool がどれくらい健康かを見る。

#### 表示

* Health grade
* 理由箇条書き
* optional で fee capture / IL caution

#### 挙動

* wallet未入力時は **pool health only**
* wallet入力が将来入るなら、そのときだけ PnL 計算
* 初期段階では wallet なし前提でよい

### 4) Pool Storm

#### 役割

急変イベントを見る。

#### 表示

* 時系列上のドット
* サイズで強度
* 色かラベルで種類

#### イベント例

* liquidity drop
* drift spike
* large swap
* fragmentation shift

#### 挙動

* window に応じてイベント数を調整
* Lite mode では点数を減らす
* まずは軽量Canvasまたは軽い DOM でよい

---

## 4-3. 右側 Reason / Context panel

### 役割

左側の main viz が何を意味するかを人間の文章で説明する。

### 表示項目

* **Reason title**
* **Reason copy**
* **Reason list**

### 例

#### title

* `Health weakened by falling liquidity`
* `Fragmentation shifted toward bridge route`
* `Storm pressure is elevated`

#### copy

* 1〜2文で要約

#### list

* 箇条書き3〜5点

  * liquidity down vs previous snapshot
  * drift widened above threshold
  * large swap count increased
  * source is partial / stale

### 挙動

* snapshot更新ごとに更新
* error / empty 時は専用メッセージに切り替える

---

# 5. Support sections の仕様

## 5-1. Snapshot history

### 役割

最新値だけでなく、近い履歴の概要を見る。

### 表示内容

* latest snapshot
* delta vs previous
* recent count
* last notable change

### 挙動

* 簡潔でよい
* Flow Alert の history card と同じ温度感

---

## 5-2. Recent pool events

### 役割

最近の変化イベントを列挙する。

### 表示内容

イベント行を縦に並べる。

各行は最低限、

* time
* tag
* short explanation
* impact strength

を持つ。

### 例

* `12:40 — liquidity drop — reserve fell vs prior snapshot`
* `12:45 — drift spike — deviation widened`
* `12:50 — large swap — burst of swap activity`

### 挙動

* イベントがないときは empty state
* Lite mode では件数を減らしてよい

---

## 5-3. Storm detail / watch

### 役割

storm の中身を補助的に見る。

### 表示内容

* next likely concern ではなく、Liquidity Pulse なので

  * top storm signal
  * counts by type
  * recent storm markers
  * interpretation
    を出す

### 挙動

* Flow Alert の Escrow watch の枠を流用してよい
* 中身だけ Liquidity Pulse 用に変える

---

# 6. Debug セクションの仕様

### 役割

開発・検証用。通常閲覧では閉じる。

### 表示内容

* Force Loading
* Force OK
* Force Empty
* Force Error
* Force Stale
* Status line
* Debug mono line

### 挙動

* details 要素で collapsed
* Flow Alert と同じ設計
* ここで main state を強制切替できる

---

# 7. 状態遷移の仕様

## 7-1. loading

### 条件

* 初回起動
* refresh / retry 実行中
* pool / window 切替直後

### 表示

* loading overlay を main viz 上に出す
* status line も loading へ
* 既存の古い値は必要なら残すが、誤解させるなら隠す

---

## 7-2. ok

### 条件

* snapshot が正常取得または利用可能

### 表示

* overlay を閉じる
* summary / metrics / main viz / support を更新
* stale でなければ banner は hidden

---

## 7-3. stale

### 条件

* 値はあるが古い
* キャッシュのみ
* 更新不能で過去値表示

### 表示

* stale banner を出す
* status line で stale 明示
* 値は残すが、新鮮な値のように見せない

---

## 7-4. degraded / partial

### 条件

* 一部メトリクスだけ取れない
* main data はあるが補助データ欠損

### 表示

* partial banner
* 欠損項目は `—`
* 他のカードは壊さず残す

---

## 7-5. empty

### 条件

* 対象プールに十分なデータがない
* プール未選択
* 観測対象が空

### 表示

* empty overlay
* 理由文
* 必要なら既定 preset に戻すボタン

---

## 7-6. error

### 条件

* 取得失敗
* 初期化失敗
* 致命的な JS 参照欠落

### 表示

* error overlay
* retry ボタン
* status line に失敗理由の短文
* console error は残してよいが、UI上は壊れたまま放置しない

---

# 8. データ更新の仕様

## 8-1. 更新単位

このページは高頻度リアルタイムではなく、**軽量スナップショット更新** でよい。

### 基本方針

* 初回ロードで取得
* 一定間隔で再取得
* tab が hidden の間は止めてよい
* visible に戻ったら再開

---

## 8-2. 更新対象

snapshot 更新時に連動して更新されるものは以下。

* status
* updated time
* stale banner
* signal/summary
* history strip
* metrics grid
* main viz 4領域
* reason/context
* support sections

---

## 8-3. Lite mode の効果

Lite mode では次を抑える。

* 再取得頻度を下げる
* Storm 点数を減らす
* 余分な描画を省く
* canvas の更新密度を下げる

---

## 8-4. Demo only の効果

* live 取得を試さず demo ソースのみ
* source card に demo 明示
* stale と混同しない

---

# 9. レスポンシブ仕様

## 9-1. 360px

これは絶対条件。

* 1カラム固定
* 横スクロール禁止
* main viz も縦積み
* controls も縦積み
* metrics は1列または2列まで
* text は折り返し前提
* graph / panel は min-height を持つ

---

## 9-2. tablet 以上

* controls が横並び化
* main viz が 2カラム
* support sections も読みやすい段組みへ

---

## 9-3. desktop

* Flow Alert と同じ余白・カード密度
* main viz 左広め、右狭め
* 視線が上から下に自然に流れること

---

# 10. パフォーマンスと安全制約

これは今回かなり重要だ。

## 禁止事項

* 新規 `backdrop-filter`
* 新規 `position: sticky`
* `clip-path` ベースの重い擬似チャート
* 常時アニメーション
* 重い多層 shadow
* standalone mock の装飾CSS丸ごと移植

## 許可事項

* 軽量な canvas 1枚
* 軽量な stacked bar / simple bars
* state overlay
* 静的カード
* 更新時だけの軽い再描画

## 目標

* スクロールでブラウザを不安定にしない
* 低めの端末でも見える
* DOM量と描画量を増やしすぎない

---

# 11. JS / DOM 契約

実装で壊さないために、最低限の契約を置く。

## 暫定的に維持すべき既存参照

* `#lpCanvas`
* `#lpCanvasWrap`
* `#lpStatus`
* `#lite-mode-toggle`
* `#demo-mode-toggle`
* `#retry-button`
* `data-snapshot=*`
* `data-trend=*`
* loading / error / empty overlay の参照点

これは PR2 の再バインド完了までは残す。

## 新UI側で持つべき意味単位

* signal block
* metrics block
* reason block
* events block
* storm block
* history block

つまり、**旧ID互換は当面維持、意味構造は新DOMへ移す** で固定する。

---

# 12. 何をもって完成とするか

このページの完成条件はこうだ。

1. **Flow Alert と同じ骨格に見える**
2. **Liquidity Pulse 固有の中身が載っている**
3. **snapshot / trend / status / overlay / retry / lite / demo が動く**
4. **Fragmentation / Health / Storm が見える**
5. **stale / degraded / demo / error が明示される**
6. **360px で崩れない**
7. **スクロールで重くなりすぎない**
8. **Sell Impact や Flow Alert の責務を混ぜない**

---

# 13. このページを一文で説明すると

**Liquidity Pulse は、XRPL pool の現在状態・断片化・健康度・急変を、Flow Alert と同じ白基調シェルで軽量に観測するページである。**


