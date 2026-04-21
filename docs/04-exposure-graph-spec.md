# XSIC Exposure Graph 仕様書

* 対象ページ: `/apps/exposure-graph/`
* 対象フェーズ: Current XSIC Phase
* 作成日: 2026-03-10
* 目的: 現行 Exposure Graph ページの機能・挙動・制約を固定し、後続フェーズとの差分基準にする。 ([GitHub][1])

## 1. 概要

Exposure Graph は、**1つの issuer を「Exposure」と「Risk」の2軸で読むための XSIC アプリ**である。

* **Exposure**: issuer の trustline 構造、集中度、上位カウンターパーティへの偏りを読む
* **Risk**: issuer アカウントに設定された権限系フラグを evidence 付きで読む

本ページは、売買数量の試算やフロー監視を行う画面ではない。目的は **「どの程度つながりが集中しているか」と「issuer 側にどの操作権限があるか」を、同一ページで軽量に判断すること** にある。 ([GitHub][1])

## 2. スコープ

### 2.1 本フェーズで完了扱いの項目

1. live Risk
2. live Exposure
3. issuer presets
4. URL state（`?issuer=`）
5. Overall Summary
6. Graph Legend
7. Methods / help 表示
8. mobile wrapping QA fix

### 2.2 本ページが行わないこと

* Sell Impact のような約定影響計算
* Flow Alert のような資金移動ラベル監視
* LP 損益や Pool health 判定
* 長期履歴タイムライン表示
* 重い force-layout / canvas animation / graph engine の導入

## 3. 画面構成

現行ページは、Flow Alert と同系統の XSIC シェル上で、以下の順に構成される。 ([GitHub][1])

1. Hero

   * ページ名: Exposure Graph
   * サブタイトル: issuer exposure / concentration / issuer risk
   * 説明文: 1 issuer を Exposure と Risk の2通りで読むことを明示
2. Controls 行

   * Issuer 入力
   * Window: `24h`（表示固定）
   * Render mode: `Live bounded SVG`（表示固定）
   * Refresh ボタン
3. Meta 行

   * Status
   * Updated
4. Methods disclosure

   * どう計算しているかの説明を折りたたみ／開示
5. Overall Summary

   * 総合判定 Low / Medium / High / Unknown
   * insight 箇条書き
   * Why this matters
   * Method（score breakdown）
   * Confidence
6. Signal card

   * 濃度ステータス
   * Top concentration
   * Coverage
   * Context
7. Metrics grid

   * 5カード
8. Tabs

   * Exposure
   * Risk
9. Exposure タブ

   * Exposure network
   * Graph legend
   * Selected entity
   * Concentration list
   * Watch / activity
10. Risk タブ

* Issuer control radar
* Root cause summary
* Evidence list

11. Debug / force mode

* Force ok
* Force empty
* Force error
* debug status テキスト

## 4. 入力・操作仕様

### 4.1 Issuer 入力

* 主入力は XRPL issuer address
* バリデーションは次の正規表現で行う

  * `^r[1-9A-HJ-NP-Za-km-z]{24,34}$`
* 不正な入力値では、Risk は `invalid`、Exposure は `no_issuer` 状態になる ([GitHub][2])

### 4.2 Presets

現行プリセットは以下の3件。 ([GitHub][2])

| ラベル      | issuer                               |
| -------- | ------------------------------------ |
| Bitstamp | `rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B`  |
| GateHub  | `rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq` |
| Ripple   | `rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh` |

### 4.3 初期値

* デフォルト issuer は GateHub
* ただし URL に `?issuer=` がある場合はそれを優先する
* 初期選択タブは Exposure
* 初期 selected node は `issuer`
* 初期 debug mode は `ok` ([GitHub][2])

### 4.4 Refresh トリガー

以下の操作で live 更新を行う。

* 初回ロード時
* Refresh ボタン押下時
* issuer input の `change`
* issuer input で `Enter` 押下時
* preset ボタン押下時 ([GitHub][2])

### 4.5 URL 同期

* issuer 値は `?issuer=` に同期される
* 変更は `history.replaceState()` で反映される
* 値が空の場合は `issuer` パラメータを削除する ([GitHub][2])

### 4.6 タブ切り替え

* `Exposure` / `Risk` の2タブ
* `aria-selected` を更新する
* 非表示パネルには `hidden` を付ける
* active タブは `state.activeTab` に保持する ([GitHub][2])

### 4.7 Debug / force mode

* `ok`: live fetch を実行
* `empty`: Risk / Exposure を empty 状態へ強制
* `error`: Risk / Exposure を error 状態へ強制

目的は、空状態・エラー状態・通常状態の UI 確認をページ上で行えるようにすること。 ([GitHub][1])

## 5. 状態管理仕様

内部 state は概ね次を持つ。 ([GitHub][2])

* `mode`: `ok | empty | error`
* `selectedNodeId`: 現在の選択ノード
* `activeTab`: 現在のタブ
* `issuer`: 現在の issuer
* `refreshSeq`: 非同期更新の世代番号
* `risk`: `{ status, error, flags, accountFlags, source }`
* `exposure`: `{ status, error, model, source }`

### 5.1 stale response 防止

`refreshSeq` をインクリメントし、後から返った古いレスポンスを捨てる。これにより、連続 Refresh や preset 連打時に古い結果で上書きされることを防ぐ。 ([GitHub][2])

### 5.2 render タイミング

`render()` は以下を更新する。

* status text
* updated time
* debug status
* signal card
* metrics grid
* overall summary
* exposure panel
* risk panel ([GitHub][2])

## 6. データ取得仕様

### 6.1 Exposure 側

Exposure は XSIC の same-origin XRPL proxy に対し、`account_lines` を送る。 ([GitHub][2])

* Endpoint: `/api/xrpl`
* Method: `POST`
* Payload:

  * `method: account_lines`
  * `account: <issuer>`
  * `ledger_index: validated`
  * `limit: 400`

#### 6.1.1 レスポンス解釈

`lines` は以下の候補パスから取り出す。

* `result.result.lines`
* `result.lines`
* `result.data.lines`
* `data.result.lines`
* `data.lines`
* `lines` ([GitHub][2])

#### 6.1.2 Exposure source

* `endpointUsed` があればそれを使用
* なければ `/api/xrpl` を source 表示に使う ([GitHub][2])

### 6.2 Risk 側

Risk はまず XSIC の account-info 系 endpoint を試し、取得できない場合は public RPC を順に試す。 ([GitHub][2])

#### 6.2.1 取得順

1. `/api/xrpl/account-info?issuer=`
2. `/api/xrpl/account-info?address=`
3. `/api/xrpl/account-info?account=`
4. `https://xrplcluster.com/`
5. `https://s1.ripple.com:51234/`

#### 6.2.2 account_info の抽出候補

`account_data` は以下の候補から読む。

* `result.account_data`
* `result.result.account_data`
* `data.result.account_data`
* `data.account_data`
* `account_data` ([GitHub][2])

#### 6.2.3 Risk source

* same-origin endpoint で取れた場合はその endpoint path を source に記録
* RPC fallback で取れた場合は採用した RPC URL を source に記録

## 7. Exposure モデル生成仕様

### 7.1 基本方針

Exposure は **live `account_lines` の balance 絶対値** を重みとして作る。ページ内の methods 表示でも同趣旨が明記されている。 ([GitHub][1])

* `balance` は数値化する
* 絶対値を取る
* 正の有限値のみ採用する
* `account` が空の line は除外する
* exposureValue 降順に並べる

#### 7.1.1 用語

* `lineCount`: 返却された lines の総数
* `usableLineCount`: 正の有限 exposure を持つ lines 数
* `totalExposure`: usable lines の exposureValue 合計
* `coveredExposure`: 可視対象 top N の exposureValue 合計

### 7.2 可視対象の上限

* `MAX_VISIBLE_COUNTERPARTIES = 8`
* 可視グラフは issuer + 上位 counterparties のみで構成する
* ロングテールは集計対象に含まれ得るが、ノード表示対象には含めない ([GitHub][2])

### 7.3 ノード構成

#### 7.3.1 issuer ノード

* id: `issuer`
* 座標: `(380, 194)`
* radius: `19`
* share: `1`

#### 7.3.2 counterparty ノード

* id: `cp-1`, `cp-2`, ...
* ラベル: `先頭6文字…末尾4文字`
* 配置: 円周ではなく、横250 / 縦122 の固定楕円上
* 角度は index に応じて均等割り
* radius は `9 + min(13, round(share * 100))` ([GitHub][2])

### 7.4 集中度指標

* `top3Share`: 上位3ノード share 合計
* `top5Share`: 上位5ノード share 合計
* `top1`: 最大ノード share ([GitHub][2])

## 8. Risk モデル生成仕様

### 8.1 対象フラグ

現行 Risk は以下4項目を対象とする。 ([GitHub][2])

1. Freeze
2. GlobalFreeze
3. Clawback
4. RequireAuth

### 8.2 判定ロジック

`account_data.Flags` を整数として読み、以下で判定する。 ([GitHub][2])

| 項目           | 判定                                        |
| ------------ | ----------------------------------------- |
| Freeze       | `(Flags & 0x00200000) === 0` のとき Observed |
| GlobalFreeze | `(Flags & 0x00400000) !== 0` のとき Observed |
| Clawback     | `(Flags & 0x80000000) !== 0` のとき Observed |
| RequireAuth  | `(Flags & 0x00040000) !== 0` のとき Observed |

#### 8.2.1 Freeze の解釈

Freeze だけは `lsfNoFreeze` の反転ロジックで読む。

* `lsfNoFreeze` が **未設定** → Freeze は **Observed**
* `lsfNoFreeze` が **設定済み** → Freeze は **Not observed** ([GitHub][2])

### 8.3 ステータス語彙

* `Observed`
* `Not observed`
* `Unknown`

`Unknown` は、現在のデータからその権限の有無を確認できないことを意味する。ページ上の methods にも Unknown の意味が明記されている。 ([GitHub][1])

## 9. 出力仕様

### 9.1 Signal card

Signal card は exposure 側の濃度を一目で読むための要約カードである。 ([GitHub][2])

#### 9.1.1 Status 判定

`topShare`（最大可視 counterparty share）から濃度ラベルを出す。

* `High`: `topShare >= 0.35`
* `Medium`: `topShare >= 0.20`
* `Low`: それ未満
* `Unknown`: exposure が ready でない場合 ([GitHub][2])

#### 9.1.2 表示項目

* Status
* Top concentration
* Coverage

  * `shown / usable / reported`
* Context

  * `Exposure = trustline concentration. Risk = issuer account-control evidence.`

### 9.2 Metrics grid

現行 metrics grid は **5カード** で構成される。 ([GitHub][2])

| 項目                  | 値                     | 補足                             |
| ------------------- | --------------------- | ------------------------------ |
| Total exposure      | `model.totalExposure` | absolute trustline balances 合計 |
| Entities visible    | `model.nodes.length`  | bounded node count             |
| Top node share      | 最大可視 share            | largest visible counterparty   |
| Top 5 concentration | `model.top5Share`     | top 5 nodes の share            |
| Render mode         | `Inline SVG`          | no force engine / no loop      |

### 9.3 Overall Summary

Overall Summary は、Exposure と Risk を合わせて **decision-grade combined read** を出す最上段要約である。ページ上でも「Overall Summary / Decision-grade combined read」として描画される。 ([GitHub][2])

#### 9.3.1 Exposure signal

Exposure signal は以下を返す。

* `badge`
* `score`
* `bounded`
* `top1`
* `top3`
* `top5`
* `visibilityRatio`
* `lineCount`
* `usableLineCount`
* `visibleCount`

##### badge / score 判定

* `highly concentrated`: `top1 >= 0.5` または `top3 >= 0.82` → score 3
* `moderately concentrated`: `top1 >= 0.25` または `top3 >= 0.6` → score 2
* `distributed`: 上記以外 → score 1
* `limited visibility`: bounded かつ `visibilityRatio < 0.3` の場合 badge を上書き

#### 9.3.2 Risk signal

Risk signal は以下を集計する。

* `unknownCount`
* `observedCount`
* `controlRiskCount`
* `hasUnknown`

`controlRiskCount` は以下3項目の Observed 数である。

* GlobalFreeze
* Clawback
* RequireAuth

※ Freeze は controlRiskCount に加算しない。

#### 9.3.3 総合スコア

* 初期 score = `exposure.score + risk.controlRiskCount`
* `risk.hasUnknown` の場合は `-1`
* ただし Exposure または Risk が ready でない場合は score を 0 にする

##### 総合ステータス

* `High`: score >= 5
* `Medium`: score >= 3
* `Low`: score > 0
* `Unknown`: それ以外

#### 9.3.4 insight 生成

insight は以下の観点から組み立てる。

* exposure badge と top1 / top3
* visible counterparties 数と bounded view の明示
* weighted counterparties が少ない場合の注意
* 観測された issuer controls
* unknown control check 数
* partial fetch（片系のみ成功）の注意

#### 9.3.5 Why this matters

趣旨は次の通り。

* exposure が集中しているほど、issuer controls の影響は広い holder 群へ一度に及びやすい

#### 9.3.6 Confidence

* 両系統 ready かつ unknown なし → Higher confidence
* それ以外 → Bounded confidence

### 9.4 Legend

Legend は以下の意味を固定する。 ([GitHub][2])

* Node meaning

  * 中央ノード = issuer
  * 外周ノード = exposure 上位 counterparties
* Edge thickness

  * 太いほど visible share concentration が高い
* Bounded view

  * top 8 counterparties に限定した高速・安定表示である

### 9.5 Exposure タブ

#### 9.5.1 Graph

* 実装は inline SVG
* 物理シミュレーションなし
* `requestAnimationFrame` ループなし
* edge の太さは share に応じて変化

  * `max(1.5, min(8, share * 22))`
* ノードはクリック／Enter／Space で選択できる ([GitHub][2])

#### 9.5.2 Selected entity

##### issuer 選択時

* ラベル: `Issuer`
* issuer address
* Total exposure
* Data source

##### counterparty 選択時

* 短縮ラベル
* 生 address
* Visible share
* Exposure 値 + currency ([GitHub][2])

#### 9.5.3 Concentration list

ready 時は次を出す。

* Top 3 share
* Top 5 share
* Visible nodes（bounded）
* Usable counterparties / reported lines
* counterparties が少ない場合の安定性コメント

#### 9.5.4 Watch / activity

ready 時は上位5 counterparties を並べる。

各行は以下を持つ。

* `#順位`
* 短縮ラベル
* フラグ

##### watch フラグ判定

* `watch high`: share >= 0.25
* `watch medium`: share >= 0.12
* `stable`: それ未満

## 9.6 Risk タブ

### 9.6.1 Radar

* inline SVG で描画
* 対象軸: Freeze / GlobalFreeze / Clawback / RequireAuth
* ステータス別の値:

  * Observed = 1
  * Not observed = 0.22
  * Unknown = 0.55 ([GitHub][2])

### 9.6.2 Root cause summary

root cause summary は以下を並べる。

* observed check 数
* unknown check 数（ある場合）
* source と `account Flags=<数値>` ([GitHub][2])

### 9.6.3 Evidence list

各フラグについて card を作成する。

* title = flag 名
* status = Observed / Not observed / Unknown
* note = 説明文

#### note ルール

* Unknown

  * 現在データから確認不能
* Freeze

  * Observed: `lsfNoFreeze` 未設定なので freeze 可能
  * Not observed: `lsfNoFreeze` 設定済みなので freeze 無効
* その他

  * Observed: 現在の account flags に当該 flag が立っている
  * Not observed: 現在の account flags に当該 flag が立っていない ([GitHub][2])

## 10. 状態別挙動

### 10.1 Exposure 側

| 状態        | 主な挙動                                                             |               |
| --------- | ---------------------------------------------------------------- | ------------- |
| loading   | graph に loading 文言、detail / concentration / watch を待機表示          |               |
| no_issuer | graph に issuer 入力促し、detail は No issuer selected                  |               |
| error     | graph に error 文言、detail は model 化失敗メッセージ                         |               |
| empty     | trustline はあるが usable positive balance がない場合と、完全に露出ゼロの場合を分けて説明   |               |
| ready     | graph / legend / detail / concentration / watch を live model で描画 | ([GitHub][2]) |

#### 10.1.1 empty の詳細

* line は返ったが usableLineCount = 0 の場合

  * 「trustlines は返ったが concentration weighting に使える正の残高がない」と説明
* totalExposure = 0 の場合

  * 「validated ledger に露出がない」と説明 ([GitHub][2])

### 10.2 Risk 側

| 状態      | 主な挙動                                 |               |
| ------- | ------------------------------------ | ------------- |
| loading | Unknown ベースの仮表示                      |               |
| invalid | Unknown モデル + issuer 再入力促し           |               |
| error   | Unknown モデル + fetch failure 説明       |               |
| empty   | Unknown モデル + empty mode 説明          |               |
| ready   | radar / summary / evidence を live 描画 | ([GitHub][2]) |

### 10.3 Debug status 表示

debug status は以下を1行で表示する。

* mode
* active tab
* exposure status
* risk status ([GitHub][2])

## 11. Methods disclosure の記載内容

Methods disclosure では現行アプリの判断根拠を説明する。 ([GitHub][1])

* Exposure は `account_lines` の absolute balance を concentration weight として使う
* グラフは issuer + top counterparties の bounded graph である
* Overall Summary は concentration score + observed issuer controls から作る
* Observed / Not observed / Unknown の意味

## 12. 非機能要件・制約

### 12.1 描画制約

* lightweight SVG only
* no heavy graph engine
* no animation loop
* bounded top counterparties only ([GitHub][2])

### 12.2 UX 制約

* summary は bounded / partial-visibility aware
* long-tail 全表示はしない
* historical timeline は持たない
* 24h window は現行では表示要素であり、取得条件を変更しない ([GitHub][1])

### 12.3 モバイル対応

* current phase の quality bar として wrapping fix を含む
* 長い issuer / counterparty / source 文字列でも崩れにくい設計とする

## 13. エラー・部分成功の扱い

* Exposure 成功 / Risk 失敗

  * partial fetch として Overall Summary に明示する
* Risk 成功 / Exposure 失敗

  * 同様に partial fetch を明示する
* invalid issuer

  * Unknown 扱いで断定しない
* unknown evidence

  * control score に penalty を入れ、confidence を下げる

## 14. 後回し項目

現行 Done の外にあるものは以下。

* richer entity labeling
* deeper clustering
* historical exposure timeline
* automated browser QA in a stable environment

## 15. 完了判定

Current XSIC Phase における Exposure Graph は、以下を満たすため **完成扱い** とする。

* live Risk が動作する
* live Exposure が動作する
* presets / URL state / Overall Summary / Legend / Methods が揃う
* mobile wrapping QA fix を含む
* bounded lightweight SVG 方針が守られている
* deferred work が明確に分離されている

