# Sell Impact 完成版仕様書 v1.0

## 1. 位置づけ

Sell Impact は、XSIC内で **「実行品質を判断するページ」** とする。
このページの役割は、ユーザーがある数量を **今そのまま売る / 買うと何が起きるか** を、1ページ内で説明し切ることにある。

このページで答えるべき問いは次の2つ。

1. **結果として何が起きるか**

   * どれくらい受け取れるか
   * 価格影響はどれくらいか
   * 実行品質は良いのか悪いのか

2. **なぜその結果になるか**

   * どの経路が選ばれたのか
   * 板 / AMM / ブリッジのどこが効いているのか
   * どこがボトルネックか

---

## 2. 対象範囲

### 2.1 このページで扱うもの

* 取引方向（Sell / Buy）
* 取引ペア（from asset / to asset）
* 数量
* Quick / Explain モード
* 推定受取量
* 価格影響
* 実行品質
* 板の薄さ / 深さ
* Execution Mix
* Why Route?
* 候補ルート比較
* スナップショット補助表示
* デバッグ情報（折りたたみ）

### 2.2 このページで扱わないもの

* 発行者リスク判定
* ラベル付き資金移動分析
* LP損益やPool Health
* ツールナビゲーション
* 多言語切替
* 別ページ化された route debugger

---

## 3. サイト内での役割分担

XSIC全体での役割分担は以下で固定する。

* **Sell Impact**
  実行結果、価格影響、経路分解、薄さ、Why Route? を扱う

* **Liquidity Pulse**
  市場観測、スナップ、推移、断片化、LP/Health を扱う

* **Flow Alert**
  資金移動と売り圧候補を扱う

* **Exposure Graph**
  issuer/trustline露出と発行者リスクを扱う

したがって Sell Impact は、**観測ページではなく意思決定ページ**である。

---

## 4. 実装前提

### 4.1 ページパス

* 既存の `/apps/sell-impact/` を改修する
* 新規別パスは作らない

### 4.2 デザイン前提

* XSIC共通の **白背景シェル** を使用
* 共通 header / global nav / footer を含む
* 他ページから浮く独自ダークテーマは使わない
* Flow Alert / Liquidity Pulse / Exposure Graph と同系統の密度と階層に揃える

### 4.3 言語

* **当面は英語のみ**
* 言語切替ボタンは非表示ではなく **機能ごと削除**
* ただし将来の多言語化を想定し、表示文言は可能な限り一箇所にまとめる

### 4.4 既存資産の扱い

* 既存 sell-impact の計算ロジック、取得ロジック、debug出力はできるだけ再利用する
* 旧UIの `EN/JA`, `Summary / Details / Debug` タブ構造は廃止する
* 旧Debugは下段折りたたみに移す

---

## 5. 完成版のページ構造

ページは以下の順で構成する。

1. Hero
2. Controls
3. Stale / Partial note
4. Signal cards
5. Metrics strip
6. Main Viz
7. Why Route?
8. Candidate Routes
9. Snapshot Strips
10. Snapshot Notes
11. Debug (collapsed)

この順番は固定する。
**上にいくほど「結論」、下にいくほど「理由」と「補助情報」** にする。

---

## 6. Hero 仕様

### 6.1 目的

ページの役割を最短で伝える。

### 6.2 表示内容

* Title: `Sell Impact`
* Subtitle:
  実行結果、impact、depth stress、route quality を事前に確認するページであることを1〜2文で説明する

### 6.3 要件

* Heroは説明過多にしない
* 詳細説明は下のカード群で行う
* “Why Route?” をここで詳細には説明しない

---

## 7. Controls 仕様

## 7.1 入力項目

必須入力は以下。

* Side: Sell / Buy
* Pair preset or asset pair
* Amount
* Mode: Quick / Explain

任意で今後追加可能なもの。

* preset selector の拡張
* asset direct input
* snapshot refresh

### 7.2 ボタン

完成版での主ボタンは以下。

* `Estimate`
* `Reset`

### 7.3 廃止するもの

* EN / JA 切替
* 旧 Summary / Details / Debug タブ
* 初期完成版では Copy Link ボタンは必須にしない

### 7.4 入力バリデーション

以下の場合は Estimate を実行しない。

* amount が空
* amount が数値でない
* amount が 0 以下
* from / to が未確定
* from / to が同一で無意味な組み合わせ
* 解析不能なペア

### 7.5 表示メタ

Controls 下部にメタ表示を置く。

* snapshot timestamp
* input pair
* source status
* loading / partial / loaded status

---

## 8. モード仕様

## 8.1 Quick モード

目的は **速く概算を返すこと**。

### Quick で取得するもの

* 推定受取量
* 価格影響
* 基本的な execution quality
* 最低限の execution mix
* 基本的な depth / thinness 読み

### Quick の特徴

* 取得回数は最小限
* キャッシュを強めに使う
* まず結果を返すことを優先
* Why Route? の詳細は省略または軽量表示

## 8.2 Explain モード

目的は **結果の理由まで説明すること**。

### Explain で追加取得するもの

* route candidates
* selected route reason
* bottleneck details
* pathfinding visualizer data
* route confidence
* snapshot comparison data

### Explain の特徴

* Quick より重くてよい
* ただしページ全体をブロックしない
* Quick 成功後に Explain 部分だけ追加ロード可
* 失敗しても Quick を壊さない

---

## 9. 状態仕様

ページ状態は以下で固定する。

### 9.1 Idle

* 初期状態
* 未実行
* プレースホルダまたは説明文を表示

### 9.2 Loading Quick

* Estimate 実行直後
* signal, metrics, main viz は skeleton / loading 表示
* ページ全体は崩さない

### 9.3 Loaded Quick

* Quick 成功
* signal, metrics, depth/thinness は表示
* Why Route? は未取得なら軽量表示または loading 表示

### 9.4 Loading Explain

* Quick 結果表示後に Explain 詳細を追加取得中
* Why Route? / candidate routes / snapshot strips のみ loading 可能

### 9.5 Loaded Explain

* 全セクション表示完了

### 9.6 Partial

* Quick は成功
* Explain の一部のみ失敗
* stale/partial note を表示
* route candidate 等は unavailable 表示

### 9.7 Empty

* 市場データ不足
* ルートが見つからない
* 流動性不足
* ペア非対応

### 9.8 Error

* 取得失敗
* パース失敗
* 内部例外
* 画面全体を真っ白にせず、カード単位でエラー表示

---

## 10. Signal Cards 仕様

Signal cards は 4 枚固定とする。

### 10.1 Card 1: Estimated Receive

表示項目

* 推定受取量
* 必要に応じて min safe read
* badge（例: Tradable, Stable, Watch）

### 10.2 Card 2: Price Impact

表示項目

* impact %
* 補足説明
* badge（Thin beyond touch など）

### 10.3 Card 3: Execution Quality

表示項目

* グレード or スコア
* risk badges
* 補足説明

### 10.4 Card 4: Context

表示項目

* pair
* mode
* route type
* 現在の状態を短文で説明

### 10.5 原則

* 数字は大きく
* 説明は短く
* badge は最大2〜3個程度
* 1カードで情報を詰め込みすぎない

---

## 11. Metrics Strip 仕様

Signal の直下に配置する。

### 11.1 表示候補

* Touch price
* Book share
* AMM share
* Bridge share
* Book max
* AMM max
* 必要なら source / updated

### 11.2 役割

* Signal より一段細かい数字を見せる
* 主役ではなく補助
* すべてを文章にしない

---

# 12. Main Viz 仕様

Main Viz は **Sell Impact の主ビジュアライザー領域** とする。
ここでは最低2つの可視化を持つ。

1. Market Depth / Thinness
2. Execution Mix

---

## 12.1 Market Depth / Thinness

### 目的

「どこから薄くなるか」を直感で伝える。

### 表示内容

* mid 近辺の depth bands
* 薄さの段階
* thinness heat strip

### 期待する読み取り

* 真ん中は比較的厚い
* 外側へいくほど薄くなる
* 現在の数量がどの辺まで食い込むかが分かる

### 実装要件

* 時系列ではなく **現在のスナップショット** を表示する
* Canvas / SVG / 軽量DOMでよい
* 360pxでも横スクロールさせない

### エラー時

* depth データが欠けても、Explain 全体は壊さない
* “Depth unavailable” などの軽い空状態を出す

---

## 12.2 Execution Mix

### 目的

今回の数量が **どの実行経路にどれだけ依存しているか** を可視化する。

### 表示内容

* segmented mix track
* OrderBook / AMM / Bridge の比率
* 各要素の短い説明

### 期待する読み取り

* 板主導なのか
* AMMが補助なのか
* Bridge依存が高いのか

### 原則

* 数字だけでなく必ず視覚表現を持つ
* ただの3箱並びで終わらせない

---

## 12.3 右カラム補助カード

Main Viz の右カラムには以下を置く。

### Reason / Context

* なぜ現在の route になっているかを短文で説明

### Chosen Route

* 選ばれた route の要約
* confidence
* bottleneck
* watch point

### Execution Quality Detail

* quality track
* 品質が悪化する条件
* Quick が残るべき理由

これらは補助カードであり、**主役は左の可視化** とする。

---

# 13. Why Route? 仕様

Why Route? は **Sell Impact 内の詳細セクション** とし、別アプリ化しない。

## 13.1 構成

Why Route? セクションの中に最低2つの可視化を持つ。

1. Pathfinding Visualizer
2. Bottleneck Map

## 13.2 Pathfinding Visualizer

### 目的

「なぜこの経路が選ばれたのか」を図で見せる。

### 表示内容

* source node
* candidate intermediate nodes
* selected route
* alternative routes
* final receive node
* short annotations

### 要件

* 最大候補数は 3 本
* selected route を強調表示
* alternative route は薄く / 点線などで見せる
* 文字だけでなくエッジ・ノードとして可視化する
* モバイル時も横スクロールなしで読める構造にする

## 13.3 Bottleneck Map

### 目的

各 route の弱点を短く可視化する。

### 表示候補

* Book refill risk
* AMM drift
* Bridge dependence
* Insufficient depth

### 要件

* 各ボトルネックを小さな track や bar で表示
* 文章だけで終わらせない

## 13.4 右カラム

Why Route? の右カラムには以下を置く。

### Why this path

* なぜ selected route が勝ったかを短文説明

### Route confidence

* confidence
* fallback
* tail risk
* failure mode

---

# 14. Candidate Routes 仕様

## 14.1 目的

候補ルートを比較し、selected でない route も理解できるようにする。

## 14.2 件数

* 最大 3 件

## 14.3 各カードに必須の項目

* route title
* selected / alternative / fallback ラベル
* estimated output
* impact
* bottleneck
* why chosen / why not

## 14.4 表示ルール

* selected は視覚的に強調
* alternative は弱め
* 文章より比較情報を先に見せる

---

# 15. Snapshot Strips 仕様

## 15.1 目的

下段も文章だけにならないよう、近傍スナップショットの傾向を小さく見せる。

## 15.2 最低3本

* Estimated output drift
* Impact score trend
* Bridge share trend

## 15.3 形式

* sparkline
* mini bars
* small strip chart

### 要件

* 重すぎる時系列は不要
* 近い履歴の軽量表示でよい
* なければ空状態を出す

---

# 16. Snapshot Notes 仕様

Snapshot notes は文章補助セクションとする。

### 表示内容

* 最新 snapshot 状態
* 前回との差分
* route 変化理由
* operator note

### 原則

* ここは可視化の補足
* ビジュアライザーの代替にしてはいけない

---

# 17. Debug 仕様

## 17.1 目的

開発 / 検証用

## 17.2 表示方法

* `details` による折りたたみ
* デフォルト閉じる

## 17.3 内容

* chosen venue
* shares
* venue reason
* mode
* source flags
* force state buttons

## 17.4 原則

* 一般ユーザー向け主UIの邪魔をしない
* ただし検証時には使える

---

# 18. データ取得仕様

## 18.1 共通原則

* 全取得は bounded にする
* 暴走探索しない
* 候補ルート数、探索深度、時間上限を固定する

## 18.2 Quick

* 1回の軽量取得 + 短TTLキャッシュを優先
* まず推定結果を返す

## 18.3 Explain

* 追加取得して深掘り
* 候補ルート、ボトルネック、補助可視化を構成
* 同一入力は短TTLキャッシュ可

## 18.4 Staleness

* stale か partial かをUI上に明示
* timestamp を必ず表示
* 古いデータでも完全停止よりは段階劣化を優先

---

# 19. 計算・表示ルール

## 19.1 推定受取量

* 現在スナップショット時点の推定値
* Explain では route mix を考慮した値を表示
* min safe read が取れるなら併記

## 19.2 Price Impact

* 直近参照価格に対する差分率
* 基準価格は内部で統一し、ページ内でブレさせない

## 19.3 Execution Mix

* 0〜100% 合計になるよう正規化
* Book / AMM / Bridge の和が 100% になる

## 19.4 Execution Quality

* グレード or スコアで表す
* 算出根拠は以下を組み合わせる

  * impact
  * thinness
  * bridge dependence
  * refill uncertainty
  * data freshness

---

# 20. エラー / 段階劣化仕様

## 20.1 完全失敗時

表示するもの

* エラーノート
* 再試行導線
* 入力欄は保持

## 20.2 部分失敗時

* Quick は残す
* Explain のみ unavailable にする
* candidate routes が欠けても signal を壊さない
* snapshot strips が欠けても route path を壊さない

## 20.3 メッセージ原則

* 原因を短く言う
* 断定しすぎない
* “No route found”, “Low liquidity”, “Partial route detail unavailable” など英語で統一

---

# 21. モバイル仕様

## 21.1 基本前提

* 360px で破綻しない
* 横スクロール禁止
* 1カラム優先

## 21.2 並び替え

モバイルでは以下に崩す。

* Controls: 1カラム
* Signal: 2x2 または縦積み
* Metrics: 縦積み
* Main Viz: 左 → 右の順に縦積み
* Why Route?: 図 → 補足の順に縦積み
* Candidate Routes: 縦積み
* Snapshot Strips: 縦積み

## 21.3 可視化の要件

* Pathfinding visualizer は横長依存にしない
* Depth bars は必要なら横棒化してよい
* 長い route 名や asset 名は省略可能

---

# 22. アクセシビリティ仕様

* ボタン、タブ、details はキーボード操作可能
* 色だけで selected / alternative を区別しない
* badge やラベルも併用
* 可視化には補助テキストを持たせる
* loading / error / partial はARIA liveまたは同等の通知に対応できる構造を持つ

---

# 23. 文言仕様

* 言語は英語固定
* 断定しすぎる文言を避ける
* “tradable”, “watch”, “thin”, “bridge-led”, “partial”, “snapshot” など短い操作語彙を統一利用
* “Main Viz”, “beta” のような仮感の強いラベルは最終版では極力使わない

---

# 24. 今回の完成版でやらないもの

* 多言語切替
* 別ページの route debugger
* 重い長期時系列分析
* 全履歴の保存UI
* LP/Health
* issuer risk
* Flow Alert系ラベル分析
* 高度な共有 / permalink UI

---

# 25. DoD（完成条件）

以下を満たしたとき、このページを完成扱いにする。

## 25.1 UI

* XSIC共通白シェルで表示される
* header/nav/footer を含む
* 英語のみで統一
* 旧 EN/JA 切替が消えている
* 旧 Summary / Details / Debug タブ構造が消えている

## 25.2 コア機能

* Side / Pair / Amount / Mode で見積もり実行できる
* 推定受取、impact、execution quality が出る
* Book / AMM / Bridge の mix が出る
* Why Route? が同一ページ内で見られる
* candidate routes が最大3本比較できる

## 25.3 可視化

* Depth / Thinness visualizer がある
* Execution Mix visualizer がある
* Pathfinding visualizer がある
* Bottleneck visualizer がある
* Snapshot Strips がある

## 25.4 劣化耐性

* Quick 成功時、Explain 失敗でもページが成立する
* partial / stale が明示される
* empty / error / no route の状態を区別できる

## 25.5 モバイル

* 360px で横スクロールしない
* 可視化が崩壊しない
* Candidate Routes と Why Route? が読める

---

# 26. 実装順の推奨

この仕様を実装する順番は以下。

1. 既存 sell-impact の外側を共通白シェルに合わせる
2. Controls と Signal を新構造へ移す
3. Metrics を追加
4. Depth / Thinness visualizer を実装
5. Execution Mix visualizer を実装
6. Why Route? pathfinding を実装
7. Candidate Routes を実装
8. Snapshot Strips / Notes を実装
9. Debug を折りたたみへ移す
10. partial / stale / empty / error を固める

---

