# XRPL Sell Impact Checker — Spec (MVP)

本書は **XRPL Sell Impact Checker** のMVP仕様を固定するための契約文書である。  
**Fiat換算は常時併記**、**Slippageという語は残し一文説明を併記**、**閾値は切替（1/2/5/10/20%）**、グラフは有効箇所に採用。  
無料運営を成立させるための方式（クライアント直結／フェイルオーバー／キャッシュ／フォールバック）も本書に統合する。

---

# XRPL Sell Impact Checker（MVP）完成後の全挙動（無料運営ベスト方式 追記版）

## 0) 画面全体（1ページ構成）
上から順に以下のブロックが常に存在する：

1. ヘッダー（ツール名＋1行説明）  
2. 入力（Simple / Advanced）  
3. 実行（Estimateボタン＋ステータス行）  
4. 結果サマリー（最上段3点）  
5. グラフ（2種類）  
6. 補足カード（Max sell under X% / Why）  
7. 警告・提案（条件付き）  
8. FAQ  
9. 免責・データソース  

**【追記｜無料運営モード】**  
9の「データソース」には、**現在使用中のXRPL endpoint名（Primary/Secondary）** と **Fiatレートの取得状態（Live/Last-known/Manual）** を必ず表示する（初心者が混乱しないため）。

---

## 1) 初期表示（未計算状態）
- Simpleモードが開いている  
- Tokenはプリセット選択（デフォルト1件選択 or 未選択）  
- Amountは空  
- Fiatはデフォルト（例：JPY）  
- Impact Threshold（影響閾値）はデフォルト **5%**  
- 結果サマリー/グラフは「未計算」空状態表示  

**【追記｜無料運営モード】**  
- 初期表示時点で裏で軽く「接続準備」を行ってよい（表示は変えない）  
  - XRPL endpointの疎通（軽いPing相当）※失敗してもUIは未計算のまま  
  - Fiatレートの **last-known** があるかを確認（あれば「前回値あり」程度の小表示はOK）

---

## 2) 入力の挙動

### 2-1) Simple（デフォルト）
**表示項目**
- Token（プリセット） 表示：`SYMBOL • issuer短縮`（例：`USD • rvYA…s59B`）  
- Amount（売却量）  
- Fiat（JPY / USD …）※最低 JPY+USD  
- Orderbook limit（任意：50/100/200）  

**挙動**
- Tokenを変えると、内部的に currency/issuer が更新（Advancedを開くと反映が見える）  
- Fiatを変えると、**Fiat併記の全表示**（受取Fiat・グラフ軸・Max sellのFiat換算）が切り替わる  
  - 再計算が必要な項目は「再計算推奨」表示 or 自動で再計算（実装で統一）  
- Amount入力中はリアルタイム検証（0/負数/NaNは即エラー表示）

**【追記｜無料運営モード】**  
- Token/Amount/FIATの変更で **毎回APIを叩かない**  
  - 直近の板スナップショットが一定時間内なら再利用（例：数秒〜十数秒）  
  - 閾値（X%）変更は **API不要（ローカル計算のみ）**  
- Token変更時は板を取り直すが、連続変更はレート制限になり得るため  
  - ステータス行で「Waiting / Backoff」を出しつつ、数秒待機して再試行してよい

---

### 2-2) Advanced（折りたたみ）
**表示項目**
- currency（手入力）  
- issuer（手入力）  
- limit（手入力 or セレクト）  
- 影響閾値（Impact Threshold）切替：**1% / 2% / 5% / 10% / 20%**  

**挙動**
- 手入力するとTokenは「Custom」扱い（プリセット解除）  
- issuer/currency形式不正は即エラー  
- Impact Thresholdを変えると、以降の表示は **「Max sell under X%」のX** が変わる  
  - グラフ上の縦線（閾値ライン）も **選択中のXのみ** 移動

**【追記｜無料運営モード】**  
- Advancedには「Endpoint（任意）」を置いてもよい（上級者向け・折りたたみ内）  
  - ただし初心者を迷わせないため **デフォルトは自動（Primary/Secondary）**  
  - ユーザーが指定した場合も、障害時は自動フェイルオーバーしてよい（説明を出す）

---

## 3) 実行（Estimateボタン）の挙動
Estimate押下で：

- ボタン disabled + スピナー  
- ステータス行が段階表示：  
  1. Validating…  
  2. Fetching order book…  
  3. Simulating fills…  
  4. Fetching XRP→Fiat rate…  
  5. Computing “Max sell under X%”…  
  6. Done  

成功で結果更新、失敗でエラー表示しボタン復帰。

**【追記｜無料運営モード】**  
- “Fetching order book…” の段階で失敗した場合、以下の順で自動対応してよい：  
  1) **Primary endpointでリトライ（短いバックオフ）**  
  2) だめなら **Secondary endpointへ切替して再試行**  
  3) それでもだめならエラー表示＋Retry導線  
- 失敗時でも、直前に成功した結果があるなら **Last result（時刻付き）** を画面に保持表示する（空白に戻さない）

---

## 4) 内部処理（Estimate押下時）

### 4-1) 入力バリデーション
- amount <= 0 → 入力エラー（計算しない）  
- issuer/currency 不正 → 入力エラー（計算しない）  
- limit不正 →補正 or エラー（実装で統一）

### 4-2) XRPL Order Book取得（book_offers）
- `book_offers` で Sell→XRP の板を取得  
- 0件なら **No liquidity** 分岐  

**【追記｜無料運営モード】**  
- 取得は原則 **クライアント直結**（ユーザーのブラウザ→XRPL endpoint）  
- “サーバ（Workers等）をプロキシにして集約”はしない（無料運営で全ユーザー巻き添えが起きるため）  
- endpointは **Primary/Secondary（複数）** を持ち、自動切替できる  
- 同一入力で短時間に再計算する場合は、板結果を短TTLで再利用してよい（API回数を減らす）

### 4-3) “板食い”シミュレーション（逐次約定）
- 価格の良い順にオファーを消費して受取XRPを積算  
- 売却量が満たせれば Full fill（100%）  
- 途中で板が尽きれば Partial fill（例：68%）  
- 指標：  
  - filled amount / fill rate  
  - receive XRP  
  - effective price（受取XRP/売れた量）

### 4-4) Slippage（推定）の算出
- 表示名は **Slippage (est.)** を維持  
- 参照価格はMVPでは **best（最良気配）** を採用  
- Full fill時のみSlippage%を算出して表示  
- Partial/No liquidity時は **Slippage = N/A**（誤誘導防止）

### 4-5) XRP→Fiatレート取得
- 外部価格APIで XRPのFiat価格を取得  
- 受取Fiat = 受取XRP × XRP/Fiat  
- 取得失敗時は Fiat換算のみ unavailable（受取XRPや板表示は維持）

**【追記｜無料運営モード（重要：Fiat常時併記を守る）】**  
上の「unavailable」は **表示上は最終的に“空にしない”** 方式に上書きする。つまり：  
- 取得失敗時は次の優先順位でFiat換算を必ず表示する：  
  1) **最新取得（Live）**  
  2) **last-known（前回成功レート）**：時刻付きで「前回値」と明記  
  3) **manual（ユーザー手動入力レート）**：初回のみ許可、以降保存可  
- どのモードか（Live/Last-known/Manual）は結果UI内に明示する  
- “Fetching XRP→Fiat rate…” が失敗しても、**Fiat併記そのものは消えない**

### 4-6) Max sell under X%（Xは選択中の閾値）
- X（1/2/5/10/20%）を基準に、  
  - full fill かつ slippage<=X% を満たす最大amountを探索（2分探索）  
- 板不足で full fill が成立しない場合は Not available（insufficient liquidity）

**【追記｜無料運営モード】**  
- 閾値変更（X%）でこの探索をやり直す場合、**追加APIは叩かない**（同じ板スナップショットで再計算）  
- 重くて遅い場合は「計算中」を出してよい（遅延は許容）

---

## 5) 結果サマリー（最上段・大きく3点）

### 5-1) Sellability（売れる判定）
- ✅ 売却可能（100%）  
- ⚠️ 一部のみ（例：68%）  
- ❌ 売却困難（板なし）  

併記（小さく）：`Filled: 680 / 1000 (68%)`

### 5-2) You receive（受取）※Fiat併記は常時
- 受取XRP（推定）  
- 受取Fiat（推定）を必ず併記 例：`1,234 XRP（≈ ¥420,000）`  
- 小さく：`1 XRP = ¥xxx (Fetched at HH:mm:ss)`  

Fiatレート失敗なら：  
- `≈ ¥…` 部分は `Unavailable` に置換＋警告表示

**【追記｜無料運営モード（重要：この部分を上書き）】**  
上の「Unavailable置換」は“最後の最後”では使わない。Fiatは常時併記要件なので、実際の表示は以下に置き換わる：  
- 失敗時も `≈ ¥…` は **last-known** または **manual** で出す  
- 表示例：  
  - `≈ ¥420,000 (last-known, 12:34:56)`  
  - `≈ ¥420,000 (manual)`  
- それでも値が出せない“初回かつ手動も拒否”のような例外時のみ、エラー扱いでEstimate失敗にする（中途半端に空表示にしない）

### 5-3) Slippage（推定）※語を残す＋一文説明
- `Slippage (est.) 9.4%`  
- 併記の一文（固定）：  
  - **「板が薄いと、売るほどレートが悪化して受取が減る度合い」**  
- Partial/No liquidity の場合：  
  - `Slippage (est.) N/A`（代わりに板不足警告を強調）

---

## 6) グラフ（視覚効果）

### 6-1) グラフ①：売却量 vs 受取Fiat（常時表示）
- 横軸：売却量（token）  
- 縦軸：受取Fiat（選択Fiat）  
- 表示要素：  
  - 受取Fiatカーブ  
  - 入力amountの点  
  - **閾値X%ライン（縦線）**：選択中のXのみ表示  
  - “Max sell under X%” の点（可能な場合）  
- 板不足がある場合：  
  - カーブが途中で途切れる  
  - 途切れ地点に “insufficient liquidity” 注釈

**【追記｜無料運営モード】**  
- カーブ生成のためにAPIを複数回叩かない  
  - **1回取得した板**を使ってローカルで複数点を計算して描く  
- Fiatがlast-known/manualの場合、グラフの凡例にそれを明示（初心者の誤解防止）

### 6-2) グラフ②：Order Book Depth（常時表示）
- “どの範囲の注文を食うか” を棒/階段で可視化  
- Partialなら「ここで尽きる」マーク

**【追記｜無料運営モード】**  
- Depth表示も板スナップショットからローカル描画（追加APIなし）

---

## 7) 補足カード

### 7-1) Max sell under X%（必須）
- `Max sell under 5% (est.) : XXXX token（≈ ¥ZZZ）` ※Xは選択中の閾値に追随（1/2/5/10/20）  
- Not available 条件：  
  - 板不足で full fill 不可  
  - 板なし  
  - 探索が成立しない

**【追記｜無料運営モード】**  
- Fiat換算はここでも常時併記（Live/Last-known/Manualの種別を表示）

### 7-2) Why（理由の一言）
条件付き（Slippage高い or Partial or No liquidity）で表示：  
- 「この売りは上位 23件の注文を消費します」  
- 「途中で買い手が尽きるため、全量は売れません」

---

## 8) 警告・提案（条件分岐）

### 8-1) Partial fill（最優先警告）
- 「板が不足：指定量の **X%しか換金できません**」  
- 「上位N件の注文を食い尽くします」

### 8-2) No liquidity
- 「板が存在しないため売却困難」  
- 「issuer/currencyが正しいか確認」

### 8-3) Full fill でも Slippage大
- 「Slippageが大きい：一括売却で受取が減る可能性」  
- 「閾値X%以内の最大量を目安に少額/分割を検討」

### 8-4) Fiatレート取得失敗
- 「XRP→Fiat価格が取得できません（Fiat換算のみUnavailable）」

**【追記｜無料運営モード（上書き）】**  
- ここで言う “Unavailable” は最終表示では使わず、実際は  
  - 「Fiatは前回値（last-known）で表示中」  
  - 「Fiatは手動レート（manual）で表示中」  
  のように案内する（Fiat併記は維持）

### 8-5) Endpoint自動切替が発生した場合（追加）
- 「接続先を切り替えました（Primary → Secondary）」  
- 「一時的に遅延する可能性があります」  
※初心者向けに短く、詳細はFAQへ

---

## 9) エラー時の挙動

### 9-1) 入力エラー
- 入力欄直下に赤字  
- Estimateは実行されない

### 9-2) Endpoint/ネットワークエラー
- ステータス行に理由表示  
- Retry（再試行）可能

### 9-3) レート制限
- “Rate limited” 表示＋再試行誘導

**【追記｜無料運営モード】**  
- レート制限時は自動で短いバックオフ（例：数秒）→再試行してよい  
- それでも失敗なら Secondaryへ切替 → だめならユーザーにRetry案内  
- 失敗しても **Last result（時刻付き）** を保持表示する

---

## 10) FAQ / 免責 / データソース（常時）
- FAQ：issuer/currency/板/Slippage（上の一文説明と整合）  
- 免責：見積であり実約定は変動、投資助言ではない、実行しない  
- データソース：XRPL RPC（book_offers）＋Fiatレート取得元＋取得時刻

**【追記｜無料運営モード】**  
FAQに以下を追加（短文でOK）：  
- 「なぜブラウザが直接接続するのか（無料運営で全体巻き添えを防ぐため）」  
- 「あなたのIPは接続先（XRPL endpoint / 価格API）に見える（Webの通常動作）」  
- 「Fiatの表示に Live/Last-known/Manual がある理由」  
- 「接続先が切り替わることがある（Primary/Secondary）」  

---

## 11) 無料運営のためのベスト方式（追記・固定）
ここまでの挙動を **無料運営で成立**させるための固定ルール：

1. **板/見積はクライアント直結**（プロキシ集約しない）  
2. XRPL endpointは **Primary/Secondaryを持ち自動フェイルオーバー**  
3. 板は短TTLで再利用し、**グラフや閾値変更で追加APIを叩かない**  
4. Fiatは **キャッシュ＋フォールバック（Live→Last-known→Manual）で常時併記を守る**  
5. 失敗時でも **Last result（時刻付き）を保持表示**して空にしない  

---

# Acceptance Criteria（満たす条件：チェックリスト）

## A. UI/UX（モバイル）
- [ ] **最小幅360px**で表示崩れがない（横スクロールを発生させない）
- [ ] 360px時は**1カラム**（2カラム/横並びレイアウト禁止）
- [ ] issuerなど長文字列は **省略表示（…）＋コピー**で対応し、レイアウトを壊さない
- [ ] グラフ領域は高さ0pxにならない（min-height or aspect-ratio で固定）

## B. 機能要件（必須挙動）
- [ ] Estimate押下でステータス行が **Validating→Fetching→Simulating→Fiat→Max→Done** と段階表示
- [ ] `book_offers`で板取得し、**Full/Partial/No liquidity** を判定できる
- [ ] Full fill のときのみ **Slippage (est.) %** を表示する
- [ ] Partial/No liquidity のときは **Slippage (est.) = N/A**
- [ ] **Fiat換算は常時併記**され、空にならない（Live/Last-known/Manual いずれか）
- [ ] 閾値切替 **1/2/5/10/20%** が動作し、**Max sell under X%** と **グラフ縦線**が追随する
- [ ] グラフ表示のために API 呼び出し回数を増やさない（板スナップショット再利用）

## C. 無料運営要件（Free Ops）
- [ ] 板/見積取得は **クライアント直結**（プロキシ集約しない）
- [ ] XRPL endpoint は **Primary/Secondary** を持ち、失敗時に自動切替する
- [ ] Rate limited 時は **バックオフ→再試行→切替** の順で処理する
- [ ] エラー時でも **Last result（時刻付き）** を保持表示する

---
