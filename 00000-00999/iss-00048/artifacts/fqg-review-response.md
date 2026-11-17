# review-response（iss-00048-fqg）

## attempt 01（43a47629a5bba5702b968c455526ff2051396e14）

- 主のレビュー（quality-gate-reviewer、Opus 5.5 / medium）：pass、P0/P1 0、P3 1（FQG-01：空を許すその他に空の文で答えた質問の要約が「（答えなし）」）。
- 2人目（ChatGPT GPT-6 / Extra High、chatgpt-code-review-strict、GitHub の SHA の一致を確かめた）：pass、P0/P1 0、P2 4。
- P2/P3 は情報。方針のとおり直さず、再レビューも始めない。次の Issue の案として report.md の Residual Risks に書く。
  - P2-a 確定の 5xx を refused と示す：Orca の revision の比較（compare-and-set）で、同じ質問への2つ目の答えは拒まれる（答え済みなら question_changed／agent_session_already_resolved）ので、二重の答えにはならない。表示の正確さの問題として残す。
  - P2-b 応答のない通信で sending のまま：表示が止まる。送り直しは起きない。
  - P2-c 64KiB の other を2つで本文の上限 128KiB を超える：極端な長さだけの境界。
  - P2-d 端末の質問の失敗したツールの結果を答え済みと示す：表示だけ。端末の答えを作る iss-00049 で直すのがよい。
