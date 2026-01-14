# Deep link (URL params)

共有リンクで入力状態を再現するためのパラメータ仕様です。

## Parameters

| Param | Description | Normalization |
| --- | --- | --- |
| `currency` | 通貨コード（3文字 or 40hex） | `trim()` → uppercase |
| `issuer` | 発行者アドレス | `trim()` |
| `amount` | 売却量 | `Number()` にできない/負数/0は無視 |
| `lang` | UI言語 | `ja` / `en` のみ有効 |

## Notes

- 初回ロードではフォームに反映するだけで、自動でEstimateは実行しません。
- URLは `history.replaceState` のみ使用します。
- 互換性のため、既存のパラメータ（例: `limit`, `threshold` など）があれば引き続き解釈します。
