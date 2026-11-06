# Historical authoring

旧 Profile、Assurance、workflow、draft、repair、provider 固有 authoring は、既存の証跡として保持します。これらは新規作成には使いません。

既存の文書、template、artifact は自動で削除、rename、rewrite しません。内容が将来も残すべき判断や制約であれば、必要に応じて Current の `requirement.md`、`design.md`、`plan.md`、または accepted ADR に明示的に反映します。

このページは Historical surface の保持方針を説明するものであり、Current の推奨手順を示しません。

過去の Assurance（`.assurance.json`、旧 Profile の証跡）は、SpecDock 0.4.0 の保証レベル（Assurance Level、CUE の Scope の `requirement.cue` の `assurance`）とは別のものです。名前が似ていますが、過去の Assurance を新しい保証レベルとして読んだり、書き写したりしません。保証レベルは [CUE Authoring Guide](cue.md) にあります。
