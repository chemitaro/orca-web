---
種別: ADR（Architecture Decision Record）
ID: "<ADR_ID>"
タイトル: "<ADR_TITLE>"
状態: "draft"
作成者: "<YOUR_NAME>"
最終更新: "YYYY-MM-DD"
親: ["<SCOPE_ID>"]
authority: "draft"
accepted_authority: ""
accepted_at: ""
accepted_by: ""
mirror_eligible: false
derived_from: []
reflected_to: []
---

# <ADR_ID> <ADR_TITLE>

architecture / contract / migration の判断候補を記録します。明示的に `accepted` となった ADR だけが durable authority になり得ます。original は `artifacts/` に残り、legacy `discussions/` も accepted ADR の mirror source として扱えます。

## Context

- 判断が必要な背景と制約:
  - ...

## Decision

- draft の間は未決。明示的な判断後に結論を記録する。
- accepted にするときだけ、次を明示する:
  - `状態: "accepted"`
  - `authority: "accepted"`
  - `accepted_authority: "accepted ADR"`
  - `accepted_at: "YYYY-MM-DD"`
  - `accepted_by: "<DECISION_OWNER>"`
  - `mirror_eligible: true`

## Options

- 検討した選択肢と trade-off:
  - ...

## Consequences

- 影響、移行、または見直し条件:
  - ...

## References

- 根拠と反映先:
  - ...
