XSIC 可視化安全仕様書 v1.0

0. 目的

本仕様書は、XSIC（XRPL Signal & Insight Console）内の可視化ページに対し、ブラウザクラッシュ・描画負荷・不安定化を防ぐための共通安全基準を定めるものである。

XSIC の各ページは役割が分かれている。Sell Impact は意思決定ページ、Liquidity Pulse は市場観測ページ、Flow Alert は履歴付きフロー観測ページ、Exposure Graph は issuer exposure / risk の軽量表示ページである。したがって、本仕様書は各ページの役割を崩さず、**「落ちない」「白画面にならない」「低めの端末でも読める」**ことを最優先にする。    


---

1. 適用範囲

本仕様書は、XSIC 内の以下4ページに適用する。

Sell Impact

Liquidity Pulse

Flow Alert

Exposure Graph


加えて、今後 XSIC に追加される可視化ページにも原則として適用する。


---

2. 基本方針

2.1 最優先順位

XSIC の可視化は、派手さより安定性を優先する。

2.2 ページの主目的

Sell Impact は観測ページではなく、実行品質を判断する意思決定ページである。 

Liquidity Pulse は execution estimate を行わず、市場観測に責務を限定する。 

Flow Alert は event 一覧ページではなく、Signal / Metrics 主体の履歴付き観測ダッシュボードである。 

Exposure Graph は軽量 bounded graph による issuer exposure / risk 読み取りページであり、重い graph engine や animation loop を持ち込まない。 


2.3 共通原則

可視化は説明のための手段であり、演出のための主役ではない

更新時だけ描き直すを基本とする

部分成功・劣化・古いデータでもページを成立させる

360px 幅で横スクロールなしを守る

JS が一部失敗しても HTML 構造と主要情報は残す



---

3. 共通安全要件

3.1 描画方式の選定

描画方式は以下で固定する。

SVG
要素数が少なく、位置が固定でき、説明性が高い図に使う

Canvas 2D
セル・点・イベント数が多いが、更新時描画で済む場合に限定して使う

HTML / CSS
bar、track、legend、metrics、state overlay に使う


3.2 デフォルト原則

常時アニメーションは禁止

常時 requestAnimationFrame ループは禁止

更新時だけの短い再描画のみ許可

重い CSS 演出は禁止

表示対象数は必ず bounded にする



---

4. 共通禁止事項

以下は XSIC 全ページで禁止する。

4.1 描画ループ

無限 requestAnimationFrame

常時 setInterval による再描画

hidden tab でも回り続ける描画

hover 中に延々続くアニメ


4.2 CSS / レイアウト負荷

新規 backdrop-filter

新規 position: sticky を可視化本体に使うこと

clip-path ベースの重い擬似チャート

多層 shadow 多用

blur / filter の常用

standalone mock の重い装飾 CSS を本番へ丸ごと移植すること


Liquidity Pulse の仕様でも、これらは明示的に禁止寄りの扱いであり、XSIC 全体に拡張して適用する。 

4.3 イベント駆動の危険実装

mousemove ごとの全面再描画

pointermove ごとの高コスト計算

scroll ごとのレイアウト再計算

resize 即時再構築

cleanup されない listener / timer / RAF


4.4 無制限描画

node / edge / event 点 / history サンプルの無制限表示

devicePixelRatio の無制限利用

desktop と mobile で同じ情報量を無条件表示

「取得できた分を全部描く」実装



---

5. 共通許可事項

以下は XSIC 全体で許可する。

軽量な SVG 図

軽量 Canvas 1枚

stacked bar / simple bar / track

state overlay

静的カード

短い sparkline / mini bars

更新時だけの軽い再描画

200〜300ms 程度の短い transition


Liquidity Pulse 仕様でも「軽量な canvas 1枚」「静的カード」「更新時だけの軽い再描画」が許可事項とされており、本仕様でもそれを共通基準として採用する。 


---

6. 描画予算ルール

6.1 必須原則

すべての可視化は、描画対象数の上限をコード上で固定する。

6.2 上限を持つべき対象

visible nodes

visible edges

heatmap buckets

storm event dots

recent rows

sparkline samples

candidate routes

legend items


6.3 bounded view の原則

Exposure Graph では top 8 counterparties に限定する bounded lightweight SVG が前提であり、この考え方を XSIC 全体の安全基準に拡張する。  


---

7. DPR・Canvas 安全ルール

7.1 DPR 上限

Canvas を使う場合、以下を必須とする。

effectiveDpr = Math.min(window.devicePixelRatio || 1, 1.5)


Lite mode では以下を推奨する。

effectiveDpr = Math.min(window.devicePixelRatio || 1, 1.25)


7.2 360px 端末

360px 幅付近では、DPR・描画量・イベント数をさらに削る。

7.3 Canvas 数

1ページ内の高頻度描画対象 Canvas は 原則1枚まで とする。
複数 Canvas を使う場合は、それぞれが静止または低頻度であること。


---

8. 再描画ルール

8.1 再描画してよいタイミング

データ取得完了時

ユーザーの明示操作時

debounced resize 後

状態切替時

hover で tooltip 位置のみ更新するとき


8.2 再描画してはいけないタイミング

毎フレーム

スクロール中連続

mousemove / pointermove のたびに全面

hidden tab 中


8.3 resize / scroll

resize は debounce 150ms 以上

scroll 追従は throttle 必須

重い再レイアウトは scroll と分離する



---

9. タイマー・ポーリング・hidden tab

9.1 ポーリング

1ページあたり原則 1 本

エラー時は retry / backoff を入れる

更新中でも既存表示を消さない


Flow Alert でも「更新中でも既存表示を消さない」「一瞬出て白紙へ戻る挙動は禁止」が前提であり、XSIC 全体に適用する。 

9.2 hidden tab

document.hidden === true 時は polling / animation / repaint を停止

再表示時に必要分だけ再開する


9.3 stale 優先

取得失敗時も、可能な限り stale / cached / partial として段階劣化し、白画面を避ける。


---

10. 状態設計ルール

全ページで最低限以下の状態を持つ。

loading

ready

stale

partial

empty

error


必要に応じて：

invalid

demo

degraded

quiet

no_issuer

no_route


Flow Alert は quiet を「取得失敗ではなく、取れた上で大きなラベル付き流れが少ない状態」と定義している。Exposure Graph は invalid / empty / partial を区別する。よって XSIC 全体でも、“取れない” と “取った結果少ない” を混同しない。  


---

11. 劣化耐性ルール

11.1 全体原則

可視化が一部死んでもページ全体を壊さない

text / cards / reason panel を残す

stale / partial を必ず明示する

cached / fallback / demo は明確に区別する


11.2 Quick-first 原則

Sell Impact では Quick 成功後に Explain を追加取得する設計が前提であり、Explain 失敗でもページ成立が必要である。これを XSIC 全体の代表的な劣化設計として採用する。  


---

12. モバイル安全ルール

12.1 共通

360px で横スクロール禁止

touch で誤操作しにくい hit area を確保

ラベル長が長くても折り返す

graph より summary / reason / metrics の可読性を優先


12.2 mobile / lite

desktop より visible 数を減らす

sparkline / event dots / recent rows を削減する

装飾を足すのではなく、情報量を引く


Flow Alert の Lite mode は mobile / low-power を想定し、Liquidity Pulse の Lite mode も update 頻度・描画負荷・Storm 点数を下げる前提である。  


---

13. cleanup ルール

各ページは destroy 相当の cleanup を必須とする。

最低限、以下を解放する。

timer clear

RAF cancel

fetch abort

resize listener remove

scroll listener remove

pointer / mouse listener remove

hover state reset



---

14. ページ別ルール


---

14-A. Sell Impact 固有安全仕様

Sell Impact は意思決定ページであり、観測ページではない。したがって、動くページではなく、段階的に説明が増えるページとして実装する。 

A-1. 固定ルール

Main Viz は静的 SVG / HTML を基本にする

Why Route? は同一ページ内の詳細セクションに留める

Pathfinding Visualizer は 最大候補数 3 本を厳守する

Candidate Routes も 最大 3 件

Snapshot Strips は短い軽量履歴のみ

long timeline / force layout / graph engine は禁止


候補ルート 3 本、軽量 snapshot strip、Quick / Explain 分離は、元仕様の制約そのものとして維持する。   

A-2. 表示順ルール

上に結論

下に理由

最下段に debug

Explain の可視化は必要時だけ描く


A-3. 安全実装ルール

Pathfinding は固定座標のみ

selected route 強調、alternative は弱表示

Bottleneck Map は小 track / bar で済ませる

Snapshot Strips は sparkline / mini bars で十分

scroll / resize 追従 UI は throttle 必須


A-4. 禁止

force simulation

route 数の無制限拡張

長期履歴タイムライン

Explain 完了までページ全体を待たせること



---

14-B. Liquidity Pulse 固有安全仕様

Liquidity Pulse は 市場観測ページであり、複雑なリアルタイム高頻度描画や常時重いアニメーションをやらないことが仕様上明記されている。ここは XSIC 内で最も厳しく縛る。  

B-1. 固定ルール

Main Viz は 観測パネル とする

1枚の重いアニメではなく、
Depth / Thinness
Fragmentation
LP Health
Pool Storm
の軽量サブ領域で構成する

Canvas を使う場合でも 1枚まで

再描画は snapshot 更新時だけ

Lite mode では update 頻度・描画負荷・Storm 点数を下げる


B-2. 強制ルール

常時 RAF ループ禁止

常時アニメーション禁止

Demo mode はデータソースの区別であり、演出モードにしない

storm は静止点列または低頻度更新にする

Fragmentation は stacked bar を基本とする

Health はカード / bar / track で表現する


B-3. 禁止

背景波形の常時描画

粒子演出の常時ループ

blur / sticky / clip-path の導入

standalone mock の装飾 CSS の移植


B-4. 判定

Liquidity Pulse は「動くとすごい」より「低端末でも落ちない」を優先する。


---

14-C. Flow Alert 固有安全仕様

Flow Alert は履歴付き観測ダッシュボードであり、Signal / Metrics が主役、Heatmap と sparkline は補助である。 repo-json を主ソースにし、quiet を意味ある状態として扱う。  

C-1. 固定ルール

Heatmap は補助であり主役ではない

sparkline も小型補助に留める

recent detections / escrow はテキスト中心でよい

履歴 JSON 優先の方針を守る


C-2. 強制ルール

mousemove ごとの全面 heatmap 再描画禁止

hover は tooltip / highlight のみ更新

本体 heatmap は
data change
debounced resize
pinned selection change
の時だけ再描画

quiet は error にしない

price fallback 失敗でもページを壊さない


C-3. Lite mode

heatmap bucket 数削減

recent rows 削減

sparkline sample 数削減

mobile は 3〜5 件程度を基本


C-4. 禁止

hover で毎回全面描画

event 0 で画面を空扱いにすること

取得失敗と quiet の混同



---

14-D. Exposure Graph 固有安全仕様

Exposure Graph は XSIC の安全基準の見本とする。
仕様上すでに lightweight SVG only / no heavy graph engine / no animation loop / bounded top counterparties only が明記されているため、この方針を維持する。  

D-1. 固定ルール

inline SVG only

no animation loop

no heavy graph engine

bounded top counterparties only

historical timeline を持たない


D-2. 上限

visible counterparties は top 8 まで

long-tail 全表示禁止

node / edge 数の自動拡張禁止


D-3. 維持すべき点

summary は bounded / partial-aware

risk / exposure の partial fetch 明示

current phase の mobile wrapping fix を維持


D-4. 禁止

force layout

physics simulation

history animation

counterparties の無制限追加



---

15. 共通実装チェックリスト

以下を満たさない限り、XSIC の可視化ページは完成扱いにしない。

1. hidden tab で timer / animation が止まる


2. 360px で横スクロールしない


3. Lite mode で描画量が確実に減る


4. Canvas に DPR cap がある


5. scroll / resize / mousemove で全面描画しない


6. stale / partial / empty / error を区別する


7. data source が不安定でも白画面にならない


8. 可視化が失敗しても cards / text は残る


9. mock 用重 CSS を本番へ持ち込んでいない


10. 表示件数上限がコードで固定されている


11. cleanup が実装されている


12. debug は主 UI の邪魔をしない


13. JS が死んでも hero / controls / basic text は残る


14. low-power / mobile でも実用になる




---

16. 優先順位

P0

Liquidity Pulse の常時アニメ / 常時 RAF を禁止

Flow Alert の hover 全面再描画を禁止

全 Canvas に DPR cap 導入


P1

hidden tab 停止を全ページ統一

resize / scroll の debounce / throttle 統一

Lite mode の実際の軽量化


P2

Sell Impact Explain の遅延描画強化

共通 safety helper の導入

perf / crash QA 手順の docs 化



---

17. 最終決定

XSIC の可視化方針は、以下で確定とする。

Exposure Graph 型の軽量・bounded・非ループ設計を全体基準にする

Liquidity Pulse は特に厳しく縛る

Flow Alert は heatmap を補助に降格し、hover 再描画を抑える

Sell Impact は Quick-first / Explain-later の段階劣化を維持する

全ページで“演出より安定性”を優先する
