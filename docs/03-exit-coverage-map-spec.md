# Exit Coverage Map 固定仕様書

## 1. 目的

Exit Coverage Map は、**ある issuer 配下のトークン群が「XRP へ抜けられるか」を状態別に可視化するページ**である。
ここでいう「抜けられるか」は、価格や深さの評価ではなく、まず **退出経路の有無** を判定することを目的とする。価格影響の詳細評価は Sell Impact の責務であり、本ページはその前段である。

本ページは次の問いに答える。

* その issuer の各トークンに、XRP exit route があるか
* あるなら order book なのか、AMM なのか、両方なのか
* ないなら、少なくとも現時点の観測では route 不在なのか
* Sell Impact に遷移して、個別に深さ評価できるか

## 2. スコープ

このページが扱うのは **coverage 判定** までである。

含むもの:

* issuer 入力
* candidate token 抽出
* 各 token の coverage state 判定
* summary 集計
* row 一覧
* detail panel
* Sell Impact への deep link
* invalid issuer / empty / no coverage / fetch failure の扱い

含まないもの:

* 売却額ごとの impact 計算
* 実行可能価格の提示
* route 最適化
* AMM と book のどちらが有利かの判断
* token の信頼性評価
* issuer の真偽判定

## 3. 用語定義

### 3.1 candidate token

入力 issuer に紐づく「coverage 判定対象の token」。
外部仕様としては、**ページは issuer に対して candidate 群を列挙できなければならない**。
内部でどの探索経路を使うかは実装詳細だが、外部 contract としては「candidate extraction が成立し、row が生成されること」を必須とする。 

### 3.2 exit route

その token から XRP へ抜けるための経路。判定対象は 2 種類。

* **book**: live の XRP/token book が存在する
* **amm**: XRP/token AMM pair が存在する

### 3.3 coverage state

各 row は必ず次の 4 状態のいずれかに分類される。

* **dual**: book あり、AMM あり
* **book-only**: book あり、AMM なし
* **amm-only**: AMM あり、book なし
* **none**: book なし、AMM なし

この 4 状態は仕様上の必須分類であり、UI・集計・detail はこの 4 状態を前提に作る。`dual/none` だけを前提にしてはならない。 `amm-only` は live 実測済み、`book-only` も live 実測済みである。  

## 4. 固定した証拠基準

本仕様の「4 状態は現実に存在する」という根拠は、以下で固定する。

### 4.1 contract baseline

基準 issuer に対する contract test の実測:

* `validIssuerAccountInfoOk: true`
* `invalidIssuerRejected: true`
* `invalidIssuerHttpStatus: 404`
* `invalidIssuerError: actMalformed`
* `candidateCount: 4`
* `summary: dual 2 / book-only 0 / amm-only 0 / none 2`
* `allRowsHaveSellImpactUrl: true`
* row: `EUR=dual`, `USD=dual`, `BTC=none`, `ARMY=none` 

### 4.2 UI baseline

UI smoke の確認事項:

* 初期表示で 4 行
* summary `dual 2 / none 2`
* row click で detail binding
* invalid issuer で `Issuer check: failed`, summary 0, detail `Invalid issuer`, `404 / actMalformed`
* EUR row の deep link が Sell Impact に遷移し、`currency=EUR&issuer=rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq` を含む 

### 4.3 live ledger baseline

固定 ledger:

* ledger hash: `E549C50B6C88925669DC7C67FC768E49B118E4EB4F1708CD995E7EFE4596A4C5`
* ledger index: `103197813`
* endpoint: `https://xrplcluster.com/`  

### 4.4 `amm-only` 実測 baseline

同 fixed ledger 上で:

* `amm_total_checked: 405`
* `dual_count: 36`
* `amm_only_count: 369` 

### 4.5 `book-only` 実測 baseline

同 fixed ledger 上で:

* pair: `534F4C4F00000000000000000000000000000000`
* issuer: `rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz`
* `book_offer_count_seen: 1`
* `pages_done: 1`
* `checked_non_amm_pairs: 1` 

## 5. 実行モード

本機能は 2 モードを持つ。

### 5.1 production mode

通常利用時のページ挙動。
最新の観測対象 ledger を使って coverage を返す。
ユーザーは固定 ledger を意識しない。

### 5.2 proof / regression mode

4 状態存在証明や regression 確認のための再現モード。
必要時に fixed ledger baseline へ pin できる構造を持つのが望ましい。
少なくともテスト側では、固定 ledger と固定サンプルで `dual/book-only/amm-only/none` を再確認できなければならない。

## 6. 入力仕様

### 6.1 必須入力

* `issuer`
  XRPL issuer account。

### 6.2 任意入力

* 初期選択したい `currency`
* deep link 用の selected row key
* proof / regression 用の fixed ledger 指定（通常 UI に露出しなくてよい）

### 6.3 入力バリデーション

* issuer 形式が不正なら、**HTTP 404 + `actMalformed`** を返せること
* UI はこれを `Issuer check: failed` として表示すること
* invalid issuer では summary は全ゼロ、detail は `Invalid issuer` を表示すること 

## 7. 出力仕様

ページの主出力は 3 層で構成する。

### 7.1 summary

全 candidate を coverage state ごとに集計した要約。
最低限以下を持つ。

* total candidates
* dual count
* book-only count
* amm-only count
* none count
* issuer check status
* observed ledger info または freshness info

### 7.2 row list

各 candidate token ごとの一覧。
1 row は最低限以下を持つ。

* currency
* issuer
* state
* bookPresent
* ammPresent
* Sell Impact URL
* selection 可能な row id

### 7.3 detail panel

選択中 row の詳細。最低限以下を持つ。

* currency
* issuer
* state label
* book presence
* AMM presence
* Sell Impact deep link
* 必要なら evidence 補助情報

  * AMM account / AMM index
  * sample offer account / sequence
  * ledger hash / index
  * error detail

## 8. state 判定ルール

各 candidate について、`bookPresent` と `ammPresent` を真偽で持ち、その組み合わせで state を決める。

* `bookPresent && ammPresent` → `dual`
* `bookPresent && !ammPresent` → `book-only`
* `!bookPresent && ammPresent` → `amm-only`
* `!bookPresent && !ammPresent` → `none`

この mapping は **変更禁止の核仕様** とする。

## 9. 判定の意味

### 9.1 dual

その token は、少なくとも観測時点で

* XRP/token book
* XRP/token AMM

の両方が存在する。
「退路が複数ある」状態だが、有利不利は本ページでは判断しない。

### 9.2 book-only

その token は live book はあるが AMM は見当たらない。
order book exit はあるが AMM exit はない。

### 9.3 amm-only

その token は AMM はあるが live book は見当たらない。
AMM exit はあるが book exit はない。

### 9.4 none

candidate としては存在するが、現観測では XRP exit route が見つからない。
これは「token が存在しない」の意味ではなく、**coverage 不在** の意味である。

## 10. データ取得仕様

### 10.1 candidate discovery

issuer から candidate 群を取得する。
外部仕様として必須なのは次だけである。

* valid issuer で candidates が返ること
* invalid issuer で invalid response になること
* candidate が row に落ちること

candidate discovery の内部探索手段は将来差し替え可能だが、外部挙動は維持する。

### 10.2 AMM 判定

token/XRP の AMM pair があるかを判定する。
探索・検証では AMM ledger entry を基点に pair を収集し、pair key は `currency|issuer` で表現していた。これは実装でも同じ正規化でよい。 

### 10.3 book 判定

token/XRP の live book があるかを判定する。
探索・検証では `book_offers` に対して `taker_gets: XRP`, `taker_pays: {currency, issuer}` を投げ、offer 1 件以上で `bookPresent=true` としていた。実装もこの定義に合わせる。 

### 10.4 pair key

内部正規化 key は `currency|issuer` とする。
row id, detail lookup, cache key, regression fixture で共通利用してよい。 

## 11. UI 構成仕様

ページは最低限、以下の表示ブロックを持つ。

### 11.1 hero / input area

* ページ名
* 目的説明
* issuer 入力
* 実行ボタン
* optional examples

### 11.2 summary strip

* dual
* book-only
* amm-only
* none
* total
* issuer check

### 11.3 coverage table / row list

* state を一目で見分けられる表示
* currency と issuer
* Sell Impact 導線
* 選択状態の表示

### 11.4 detail panel

* row click で同期更新
* 初期は最初の row か empty placeholder
* invalid issuer 時は invalid detail を表示

## 12. UI 挙動仕様

### 12.1 初期表示

* 入力前は placeholder を表示
* baseline issuer を投入した場合、4 行が並ぶことがある
* summary が row 構成と一致すること

### 12.2 検索実行中

* loading 状態を見せる
* 古い selection は loading 完了まで保持してよいが、完了後に新 row と整合させる

### 12.3 row click

* detail panel が即時に選択 row へ同期する
* summary は row click では変わらない

### 12.4 invalid issuer

* issuer check failed
* summary 0
* detail は invalid issuer 用表示
* backend error code を表示可能なら出す
* baseline では `404 / actMalformed` を確認済み 

### 12.5 no candidates

* row 0
* summary 0
* detail は “No candidates” 系 placeholder

### 12.6 no coverage

* row は存在しても state が `none`
* deep link は維持する
* Sell Impact 先で no liquidity になりうる

## 13. Sell Impact deep link 仕様

各 row は必ず Sell Impact deep link を持つ。
contract baseline で `allRowsHaveSellImpactUrl: true` が確認されているため、**state に関係なく URL を持つことを必須**とする。 

URL には最低限以下を含める。

* `currency`
* `issuer`

baseline では EUR row が `currency=EUR&issuer=rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq` を含んで遷移している。 

## 14. 表示ラベル仕様

内部 state と表示文言は分けてよいが、意味は固定する。

推奨表示:

* dual → `Book + AMM`
* book-only → `Book only`
* amm-only → `AMM only`
* none → `No XRP exit observed`

重要なのは、**曖昧語を使わず route 種別が分かること**である。

## 15. エラー仕様

### 15.1 invalid issuer

* 404
* `actMalformed`
* UI は失敗状態を明示

### 15.2 upstream fetch failure

* hard fail なら summary と detail を error state にする
* stale / partial を区別できるなら区別する
* invalid issuer と upstream failure は混同してはならない

### 15.3 partial discovery

* candidate discovery は成功したが coverage 判定の一部だけ失敗した場合、

  * possible: partial badge
  * failed rows: unknown/error 扱い
    ただし現固定仕様では state は 4 種のみなので、production 初版では partial 自体をページ全体 status として扱い、row state に `error` を増やさない方がよい

## 16. 並び順仕様

row list の並び順は明示して固定する。

推奨優先順:

1. `dual`
2. `book-only`
3. `amm-only`
4. `none`
5. 同 state 内は currency 昇順

理由は、退出可能性が高い順に上へ出すため。
ただしこれは UI 仕様であり、state 判定とは独立。

## 17. detail 表示項目の固定仕様

detail は最低限以下を必須表示とする。

* currency
* issuer
* state
* book: yes / no
* AMM: yes / no
* Sell Impact button

デバッグ / explanation 用として、以下は表示可能項目とする。

* ledger hash
* ledger index
* AMM account
* AMM index
* sample offer account
* sample offer sequence

`book-only` baseline では `sample_offer_account` と `sample_offer_sequence` が取れているため、デバッグ表示は仕様上許可してよい。 

## 18. キャッシュと freshness

本番では最新観測を返す。
ただし regression や proof のために fixed ledger baseline を再利用できる設計を推奨する。

必要条件:

* runtime は最新観測でよい
* tests / fixtures は固定 ledger で再現可能であること
* page 表示には観測時刻か ledger index を出せること

## 19. 最低受け入れ条件

実装完了の判定基準は次の通り。

### 19.1 contract

* valid issuer で rows が出る
* invalid issuer で 404 / malformed 系失敗
* detail panel が機能する
* deep link が row 全件に付く

### 19.2 state coverage

* `dual` を表示できる
* `book-only` を表示できる
* `amm-only` を表示できる
* `none` を表示できる

### 19.3 regression samples

最低でも以下を固定 fixture に持つ。

* `dual`: `EUR` または `USD`
* `none`: `BTC` または `ARMY`
* `amm-only`: 今回の fixed ledger で 1 件以上
* `book-only`: `SOLO` / `rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz`   

## 20. 非機能要件

* row 数が増えても summary と detail が破綻しないこと
* state 集計と row 表示が常に一致すること
* selection 中の row が reload 後も復元できるなら望ましい
* mobile でも summary → rows → detail の順で読めること
* row click / keyboard selection の両方に対応できるとなおよい

## 21. この仕様で固定するもの / 固定しないもの

### 固定するもの

* Exit Coverage Map の目的
* 4 状態定義
* deep link 必須
* invalid issuer 挙動
* detail binding
* `book_offers` を book 存在判定に使うこと
* `currency|issuer` 正規化
* 4 状態存在の baseline evidence

### 固定しないもの

* candidate discovery の内部アルゴリズム詳細
* 使用 RPC の最終選定
* row UI の見た目
* キャッシュ TTL
* proof mode を UI に出すかどうか

## 22. 実装開始判断

この仕様に基づき、**Exit Coverage Map は実装開始可** とする。
理由は、実装前提だった `dual / book-only / amm-only / none` の存在証明が揃い、`dual/none` のみしか出ないのではないかという懸念が解消したためである。 `amm-only` は 405 AMM pair 検証で 369 件、`book-only` は SOLO pair で live 検出済みである。  


