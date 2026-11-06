---
種別: レポート（Issue）
ID: "iss-00005"
関連GitHub: ["#5"]
最終更新: "2026-11-06"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

orca-web の土台を作った。

- 雛形：Node.js 24（`.node-version` は 24.21.0）と TypeScript 7.0.2（Node の型の剥がしで直接動かす）、Biome 2.6.2、`node:test`。`npm test`、`npm run lint`（Biome と `tsc --noEmit`）、`npm run build`。CI は `.github/workflows/ci.yml`。実行時の依存はない。`AGENTS.md` と `CLAUDE.md`（`@AGENTS.md`）。
- Orca のアダプター（`src/orca/`）：
  - CLI の境界（`cli.ts`、`orca-cli.ts`）：絶対パス、引数の配列、許した名前だけの環境変数（`ORCA_` の変数は渡さない）、固定の作業ディレクトリ、時間切れ。`--json` の封筒を型の結果に解く。`ReadOnlyOrcaCli` は読むコマンドだけを呼べる。
  - RPC の境界（`runtime.ts`、`rpc.ts`）：`orca-runtime.json` から口と authToken を読み、NDJSON の単発の要求を送る。分割された行、keepalive、`method_not_found`、時間切れ、接続断、不正な JSON、id の食い違い、大きすぎる行を区別する。authToken は `RuntimeEndpoint` の非公開のフィールドだけに持ち、結果、誤りの文、JSON、inspect に出ない。`ReadOnlyRpc` は読む RPC だけを送れる。
  - 機能の確かめ（`capabilities.ts`）：`readState`、`readTabs`、`openExistingTab`、`readTranscript`、`sendGuarded` ごとに、使えるか、満たした確かめ、欠けた確かめ、呼ぶときまで確かめられないこと（activate の口）を返す。runtime の ID の食い違いで書き込みの機能を止め、ID の変化で確かめ直す（`CapabilityCache`）。
  - 録画と再生（`replay/`）：CLI と RPC の録画の形、`ReplayCliRunner`、`ReplayRpcTransport`、`ReplayRpcServer`（一時の Unix ソケット）、`RecordingCliRunner`、`RecordingRpcTransport`、`Pseudonymizer`、`sanitizeRecording`、`assertRecordingSafe`、`writeRecording`。
- 実機の確かめの道具（`src/tools/probe-live.ts`、`npm run probe:live`）：読むだけで集め、集計だけを出す。`--record <dir>` で、仮名化と検査を通した録画（会話の読み取りを除く）を書く。

実装中に見つけて直したこと：

- CLI と RPC の録画を別々の仮名の表で仮名化すると、録画をまたいで同じ値を突き合わせられない。一緒に再生する録画は `Pseudonymizer` を共有するようにした（design.cue D-05 に追記）。
- `agentStatus.agentType` が欠けたタブで、`providerSession.key`（`session_id` というキーの名前）をエージェント名として `nativeChat.readSession` に渡していた。`launchAgent` を使い、どちらもなければ読まないようにした。
- `orca agent-context --json` は `ok`／`result` の封筒のない JSON を返す。`OrcaCli.document()` を足した。

## 実機の確かめ（読むだけ）

2026-11-06、この Mac の Orca 1.4.251（CLI も 1.4.251。ソースの根拠はタグ v1.4.249）。`npm run probe:live` の集計（件数と値の種類だけ）は Artifact `artifacts/20261106t091336z--probe-live-summary-20261106.json` にある。書き込みの RPC（activate、send）は呼んでいない。呼んだのは CLI の `--version`、`status`、`agent-context`、`worktree list`、`worktree ps`、`terminal list` と、RPC の `session.tabs.listAll`、`session.tabs.list`（worktree ごと、105件）、`nativeChat.readSession`（provider のセッションごとに `limit: 1`。中身は件数に減らして捨てた）だけ。

機能の確かめの結果：`readState`、`readTabs`、`openExistingTab`、`readTranscript` は使える（`openExistingTab` の `session.tabs.activate` と `worktree.activate` の有無は呼ぶときに確かめる）。`sendGuarded` は `orca-web:guarded-send-verified`（epic-00004）の欠けで使えない。runtime の ID は `status`、`orca-runtime.json`、RPC の応答で一致した。

### 1. `agentStatus.model` と `providerSession.effort` は値として出るか

| エージェント | agentStatus のあるタブ | model | providerSession | effort |
|---|---|---|---|---|
| Claude Code（ふつう 4、オーケストレーションの担当 5） | 9 | 0 | 9 | 9（high 5、xhigh 3、medium 1） |
| agentType の欠けた行（effort の値から Claude と見られる） | 2 | 0 | 2 | 2 |
| Codex（統括が `--model gpt-6.1-sol --effort low` で起動） | 1 | 0 | 指示を受ける前は 0、1回の後は 1 | 0 |

- **model は、Claude Code でも Codex でも出ない**（12件すべてで欠ける）。ソースでは `AgentStatusEntry.model` は任意の項目で、この Mac のフックは値を入れていない。ふつうのエージェントのモデルは、状態の API で「取れない」と返す。オーケストレーションの担当は、CLI の `worker-show` の `startOptions.launch.requested`／`effective` が別の取得元になる。
- **effort は Claude Code でだけ出る**（`providerSession.effort`、Claude の今の推論レベル）。Codex では、起動の要求が low でも、`providerSession` に effort がない。ソースのコメントも Claude だけの項目としている。
- Codex の `providerSession`（key は `session_id`、id、transcriptPath、cwd）は、最初の指示を受けた後に初めて出た。起動の直後は、agentStatus（state=done）だけで provider のセッションはない。

### 2. スリープ中のエージェントは一覧でどう見えるか

terminal のタブ 89件の組み合わせ：

| status | 端末の handle | agentStatus | launchAgent | 件数 |
|---|---|---|---|---|
| pending-handle | なし | なし | あり（claude） | 34 |
| pending-handle | なし | なし | なし | 13 |
| ready | あり | done / working | あり | 9 |
| ready | あり | done | なし | 3 |
| ready | あり | なし | なし | 30 |

- スリープ中（または、Orca が端末をまだ復元していない）のタブは、`status: "pending-handle"`、`terminal: null` で、**agentStatus を持たない**。`worktree ps` の agents にも出ない。
- エージェントのタブだと分かるのは `launchAgent` があるとき（34件）だけ。`launchAgent` のない 13件は、シェルかエージェントかを、読む RPC だけでは見分けられない（試作はプロファイルの DB の `sleepingAgentSessionsByPaneKey` を読んでいた。既定の依存にはしない）。
- `ptyId` は pending-handle のタブにも残っている。ptyId があることを、生きている証拠にしない。
- `pending-handle` だけからは、「スリープ」と「まだ復元していない」を区別できない。状態の API では「端末なし（復元待ち）」と示し、スリープと断定しない。

### 3. worktree → タブ → leaf → 端末 → provider のセッションを、取り違えずに結べるか

**結べる。ただし、端末へは handle で結ぶ。**

- worktree → タブ：`session.tabs.list` に `{ worktree: "id:<worktreeId>" }` を渡す。105件すべてで、応答の `worktree` が渡した ID と一致した。
- タブ → leaf：terminal のタブの `parentTabId` と `leafId`。タブの `id` は `<parentTabId>::<leafId>` の形で、`parentTabId` とは違う。paneKey は `<parentTabId>:<leafId>` で、agentStatus の `paneKey`（12/12）と `worktree ps` の `paneKey`（12件中 11件。残りの1件はタブのない done の行）が一致した。
- leaf → 端末：handle を持つタブ 42件は、すべて、タブの `terminal` の handle で `terminal list` の1件に一意に結べた。ところが、そのうち 14件は、`terminal list` の `tabId` と `leafId` が `pty:<repoId>::<path>` という仮の値で、タブの識別子と一致しない。**`terminal list` の tabId と leafId で結ぶと、14件を取り違えるか取りこぼす**。結ぶ鍵は handle にする。
- 端末 → provider のセッション：`agentStatus.providerSession.id` は 12件すべてで別の値で、2つのタブが同じセッションを指すことはなかった。スリープ中のタブは agentStatus がないので、provider のセッションまでは結べない。

### 4. `nativeChat.readSession` は読めるか

**読める。** provider のセッション 10件（Claude 9、Codex 1）に `{ agent, sessionId, transcriptPath, limit: 1 }` で呼び、10件すべてが成功し、10件すべてが本文を1件以上返した（中身は件数に減らし、録画にも記録にも残していない）。`transcriptPath` は Orca が報告した値をそのまま渡した。空の引数で呼ぶと `invalid_argument` が返り、口の有無の確かめに使える。

## 後の Issue への申し送り

- iss-00006（状態の API）：ふつうのエージェントの model は「取れない」（理由つき）。effort は Claude だけ `providerSession.effort` を「今の選択」として返す。Codex の effort は取れない。担当の model と effort は `worker-show` の起動の要求と解決を使う。スリープ中は「端末なし（復元待ち）」と示す。
- iss-00007（開く口）：タブと端末は handle で結ぶ。`terminal list` の tabId と leafId に頼らない。
- epic-00004（会話）：`nativeChat.readSession` は Claude と Codex の両方で読める。Codex は最初の指示の後にしか provider のセッションを持たない。

## Verification

- 仕様のレビュー（spec-review、spec-reviewer opus / medium）：round 1 は P1 1・P2 4（本文の残る録画を検査が拒む規則とテストがない、ほか）。直して round 2 で pass（P0・P1 0、P3 1）。
- コードのレビュー（code-review、code-reviewer sonnet / high、standards と spec の2人、範囲 bb53171..3a96e01）：どちらも pass。spec は指摘 0。standards は P2 1（不正な request-target でサーバーが落ちる）・P3 2（出力の超過を起動の失敗として返す、`--record` が出力先を作らず片方だけ書きうる）。3件とも 9489460 で直した（テストつき）。
- 最終品質ゲート（final-quality-gate、quality-gate-reviewer opus / high、1人、ChatGPT なし）：campaign `iss-00005-fqg-1`、試み1で **合格**。合格したコミットは `9489460c80489af0caacda59c8c020263d8e70f5`。
  - レビューのレーン：status pass、coverage complete（functional-correctness、requirements-closure、test-adequacy）、P0 0・P1 0・P2 0・P3 3。
  - テストのレーン（同じコミット）：`npm run lint` exit 0、`npm test` exit 0（65件すべて成功）、`npm run build` exit 0。
  - P3（情報のみ）：FQG-001 RPC の `_meta.runtimeId` の食い違いを確かめるテストがない。FQG-002 keepalive が時間切れを延ばすことを確かめるテストがない。FQG-003 AGENTS.md が、すでにある RPC の境界などを「後の手順で足します」と書いている。
- 実機：`npm run probe:live`（読むだけ）を 2026-11-06 にこの Mac の Orca 1.4.251 で走らせた。結果は上の「実機の確かめ」。
- CI（GitHub Actions）：PR で確かめる（結果は PR に残る）。

## Residual Risks / Follow-ups

- 内部の RPC は非公開。Orca の版が変わったら `npm run probe:live` を走らせ直し、録画を取り直す。
- 構造化 Chat のタブ（`agent-session`、1件）のモデルと推論（`agentSession.options`）は、この Issue では確かめていない。
- 仮名化は、短い列挙の形の値（40文字以下の英数字と記号）を残す。手元の実機の録画では、repo の名前、projectId、ブランチ名、家のディレクトリを repo とした行の repo の名前（アカウント名）が残った。実機の録画はコミットしていない。コミットするときは人が読んでから、または自由な文の項目の一覧を足してから。
- 最終品質ゲートの P3 の3件（FQG-001〜003）は、後の Issue で直す候補。
