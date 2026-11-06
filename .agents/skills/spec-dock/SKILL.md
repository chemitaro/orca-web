---
name: spec-dock
description: Operate and author SpecDock scopes, canonical documents, Artifacts, dependencies, work and native Git worktrees through the installed external CLI. Use for an in-scope SpecDock outcome and verify the command result and actual post-state.
---

# SpecDock

Use the installed external `spec-dock` console. Read current root and leaf help before commands; canonical documents and actual CLI/Git/GitHub evidence are authoritative. The repository shim only delegates through PATH. Do not execute checkout Python, the retired fixed bundle or shared control as a fallback.

Business commands support Linux and macOS with Python 3.10+. Other operating systems return `UNSUPPORTED_PLATFORM` (exit 3) before project admission or effects. Help, version and completion remain context-free utilities.


## Distinguish the four owned layers

- `src/spec_dock/` is provider development source. `src/spec_dock/runtime/` implements the packaged CLI; `src/spec_dock/assets/` is the provider authority for shipped static content.
- The actual command is the non-editably installed external package in the user's tool environment. Editing source or switching a checkout branch does not update that installed package. Updating it is user/tool-environment-wide, not a runtime copy inside each consumer.
- `spec-dock/docs`, `spec-dock/system`, `spec-dock/templates`, the root `.agents/skills` skill projection, workspace declaration and shim are static projections in one explicit consumer worktree. Claude Code reaches the skills through `.claude/skills/<name>` -> `../../.agents/skills/<name>` relative links that the Claude Code side creates, not SpecDock. Installation init/update does not silently update another worktree.
- `spec-dock/.agent/work-target/target-<32-hex-token>.json` is an ignored, worktree-local direct record. The opaque filename token identifies one captured record; it is not a Scope ID, GitHub issue number, UUID or operation journal entry.

Choose package update, static installation/update, or lifecycle operation according to the layer that actually owns the requested outcome. Do not describe parity between layers as proof that another layer was updated.

## 仕様の扱い

`spec-dock/workspace.json` の `schema_version` が 4 のリポジトリでは、次に従う。

- 仕様は `spec-dock/initiatives/` にある。普通のファイルとして読み書きする。
- 仕様は Git で扱わない（`git add`、`commit`、`stash`、`reset`、`checkout`、`clean` を仕様に使わない）。保存と共有は、1〜2分のうちに自動で行われる。
- 仕様が見えない、またはリンクの異常を示されたときは、`spec-dock canonical link` を実行する。サンドボックスの中で拒否されたら、利用者に、普通の端末での実行を頼む。
- 読み書きを拒否されたときは、`spec-dock canonical status` が示す1行の設定を、利用者に伝える。自分でツールの設定を変えない。
- 検索では、パスを明示する（`rg 語 spec-dock/initiatives/`、コードと一緒なら `rg 語 . spec-dock/initiatives/`）。
- Scope のディレクトリは `spec-dock/initiatives/<区切り>/<ID>/`（区切りは番号の千ごとの範囲。例 `spec-dock/initiatives/00000-00999/iss-00454/`）に平らに並ぶ。場所は `spec-dock scope show <ID> --json` の `path` で確かめる。親、子、依存は、ディレクトリの位置ではなく `spec-dock scope show <ID> --json` で確かめる。
- ID は `<種類>-<番号5桁>` で、コマンドの入力は0埋めしなくてよい（`iss-454` は `iss-00454`）。slug はなく、`scope create` と `scope import github` に `--slug` を付けない。題名は GitHub の題名が正本で、どの言語でもよい。既定のブランチ名は `<ID>`。
- 構造（作成、親子、依存、状態、題名、種類）は、SpecDock のコマンドだけで変える。Scope のディレクトリの名前を変えたり、別のディレクトリの下へ動かしたりしない。親の付け替えは `spec-dock scope move <ID> --parent <親>`（GitHub の親だけが変わり、ディレクトリは動かない）。
- `SCOPE_KIND_CHANGED` で止まったら、種類のラベルを戻すか作り直すかを利用者に確かめ、`recovery` の手順に従う。`work start` が警告 `SCOPE_IN_PROGRESS` を返したら、別のPCで作業中でないかを利用者に確かめる。
- `*.conflict-*` のファイルがあれば、中身を元のファイルに統合してから、そのファイルを消す。
- Claude Code の隔離セッション（`--worktree`）では、仕様を読むだけにする。
- 作業を終えるときは `spec-dock work finish` を使う。保存が確かめられるまで（最大180秒）待つ。確かめられずに止まったら、`spec-dock canonical status` を見る。
- リンクを消すときは `rm spec-dock/initiatives` と書く。末尾に `/` を付けない。mainのチェックアウトで `git clean -ff` を使わない。

利用者向けの用意、ツールの設定の1行、同期が止まったときの扱いは `spec-dock/docs/canonical.md` にある。

## CUE の Scope と説明資料

SpecDock 0.4.0 から、新しい Scope は CUE の Scope である。SpecDock 0.5.0 は `schema_version` が 4 のリポジトリだけを扱い、3 のリポジトリでは、どのコマンドも `CANONICAL_NOT_MIGRATED` で止まる（移し方は `spec-dock/docs/migration.md`）。

- `scope create` と `scope import github` には、`--assurance <light|standard|strict|critical>` と、空白だけでない `--assurance-reason <理由>` を必ず付ける（ないと `ASSURANCE_REQUIRED`）。レベルは失敗したときの影響と回復の難しさで選び、親の計画の切り分けで決めた値を使う。
- 正本は `requirement.cue`、`design.cue`、`plan.cue`（`requirement.cue` があれば CUE の Scope）。保証レベルは `requirement.cue` の `assurance` だけに書き、途中で書き換えてよい。人向けの説明は `explanation.html` の Markdown に書き、雛形の印の行を消す。
- 書いたら `spec-dock scope check <ID>` で、誤りと指摘がなくなるまで直す（`cue` v0.17.1 以上が要る）。`spec-dock scope render <ID>` で HTML に描ける。
- 作業しながら `plan.cue` の手順の `status`（`todo`、`doing`、`done`、`dropped`）を直接書き換え、`scope check` で確かめる。専用のコマンドはない。
- `work finish` は CUE の Scope を検査し、誤りが残れば何も書かずに `SCOPE_CHECK_FAILED` で止まる。直してから、もう一度 `work finish` を実行する。
- 詳しくは `spec-dock/docs/authoring/cue.md`（型、番号、規則、保証レベル、コード）と `spec-dock/docs/authoring/explanation.md`（説明資料）を読む。0.4.0 より前に作った Markdown の Scope を直すときは `spec-dock/docs/authoring/overview.md` から書く。

## Resolve the context and target

1. Bind one repository/worktree, using its exact absolute root with `--project` when needed.
2. Prefer the explicit Initiative, Epic, Issue or path supplied by the request or approved plan. Resolve it to one canonical path under `spec-dock/initiatives/`.
3. If a Scope is needed without an explicit selector, inspect `spec-dock active show --json` and use the deepest unambiguous Scope in its valid chain. Empty, stale, corrupt or ambiguous observations do not supply a mutation target.
4. Read the target metadata, parent chain and relevant Requirement, Design, Plan and Report. Preserve their distinct authority; Artifact and external model output remain evidence until explicitly adopted.

## Execute the requested outcome

Read help, inspect the necessary preconditions, execute the in-scope command and verify its effects and post-state. A request or approved plan authorizes ordinary documented local, Git and GitHub effects; routine operations do not need command-by-command permission. Keep lifecycle admission, implementation, review, delivery and merge evidence separate.

- New Scope creation always uses `--backend github`; GitHub issues the number. Preserve existing IDs/ref/path and do not create offline/local Scopes or add UUID Scope identities.
- Start accepts Initiative, Epic and Issue. A new branch needs `--base REF`; existing branch reuse needs explicit `--branch NAME` and no base. Start checks live readiness outside the short exclusion, then rechecks same-clone reservations, checks out and publishes one direct target while excluded.
- One worktree has at most one direct target. Only Start acquires it. `active set TARGET` keeps only the same valid direct target and at most repairs its navigation links; an empty or different target requires Start. `active clear` releases the captured direct record without closing GitHub or changing branch.
- Start, Clear and a clearing Finish align the ignored relative links `spec-dock/active/{initiative,epic,issue}` with the direct target chain or `system/active-none/<role>`. They are human navigation only: never read them as the selection, and treat `active.link` effects and `ACTIVE_LINK_NOT_UPDATED` warnings as derived-view results that do not change the selection outcome.
- Finish completes the fixed GitHub Scope and confirms closed(completed) before clearing only the captured selection. It stays on the branch. Parent completion requires every descendant to be completed or closed as not planned; an open or unknown descendant stops it with `DESCENDANT_NOT_COMPLETED`. Finish is not handover or proof of delivery, test, review or merge completion.
- Branch leaves change/observe native Git refs without a branch registry. `branch switch` checks out under the same clone Start lock as Start and link writes (`--lock-timeout`); `START_LOCK_BUSY` means another Start or switch is running, so retry later instead of using raw Git. Dependency mutations use metadata through the CLI.
- Sync observes current same-clone main/linked worktrees and their direct targets; it writes no cache, generation or projection and does not infer running agent processes. Use `--source github` for explicit live lifecycle observations.
- Installation changes only known static resources in one worktree. Its skill files live only in the fixed SpecDock slots under `.agents/skills`; it never manages other skills, `.claude/skills` links or host configuration such as `.claude/settings.json`. Update/uninstall remove only known earlier `.claude/skills/spec-dock*` copies and skip a slot reached through a link. Init refuses existing destinations. Update/uninstall require verified external preservation for changes; unknown modified files require manual merge. Package updates are separate from static updates.

## 人のタスク

人にしかできない判断・確認・操作を、そのリポジトリのカタログの `todos/` に登録して追う（`spec-dock todo`。使い方、記録の形、設定、集約は `spec-dock/docs/todo.md`、引数と契約は `spec-dock/docs/reference_cli.md`）。GitHub には何も送らない。

- 登録しない：会話の中で答えが返るもの（Claude Code や Codex の複数の質問も同じ）。PR のマージ待ち（ダッシュボードの表示を使う。意図して登録するのは妨げない）。作業者から統括への問いは Orca で行う。統括が答えられず人に上げるときだけ、統括が `decide` で登録する。
- 登録する：答えを待ったままターンを終えるとき、人しかできない操作をすぐにしてもらえないとき、数日かかる確かめ、期限のある行為。`spec-dock todo add --by agent --role <役割> --kind <種類>`（`decide`、`check`、`operate`、`act`、`checklist` から選ぶ。`todo` は人だけ）で、`--body`（背景と問い。束にも要る）、`--reply-to`（答える場所）、`--effort`（所要時間）を書く。`decide` は選択肢と推奨を付ける。止める Scope があれば `--blocks <ID>` を付ける。登録してから、止まらない作業を続ける。
- 束：1回の会話で全部の答えが返らない2つ以上の項目は、あらかじめ `--kind checklist` と `--item` で束にして登録する（束にも既定の期限が付く）。答えを受けるたびにサブタスクを閉じ、返事の終わりに `spec-dock todo show <親>` で残りを示す。1回の会話で終わる複数の問いは束にしない。
- 閉じる：答えを受けた担当が `spec-dock todo done <ID> --record <原文の記録>` で閉じ、原文の記録（ファイルか URL）へのリンクを残す。統括は、始めるときに `spec-dock todo list` を読み、答えが出たのに閉じていないものを閉じる。
- 守ること：秘密の値を書かない（操作のコマンドは書いてよい）。Claude Code の隔離セッション（`--worktree`）では、仕様と同じく読むだけにし、登録は統括に頼む。

## Documents and Artifacts

Load only sources needed for the task: canonical metadata/docs, named direct-child Artifacts and rules, dependencies and applicable references under `spec-dock/docs/`. Use `workspace validate`, `workspace sync`, `active show` and relevant queries when verifying that changed surface.

Author canonical Requirement, Design, Plan, Report and accepted ADR when requested or assigned by the approved plan. Use `artifact create --scope TARGET --type TYPE --title TITLE --json` for a supported Markdown type, then populate the returned `data.result.artifact.path`. Use `artifact import file PATH --scope TARGET --json` for one complete opaque evidence file. Prepare other formats in an ignored Workbench and import the completed file; do not invent an Artifact ID or filename. Artifact creation and content authoring are one requested outcome.

## Destructive boundary

Require an exact target and destructive result in the request or approved plan for `scope delete`, `installation uninstall`, `worktree remove` and `canonical remove`. Understand project-owned `make init` effects before executing bootstrap. Once authorized, execute and verify rather than returning the command for manual entry. Reconfirm only if the actual scope materially exceeds the authorization. Keep any repository human PR merge gate.

## Failure and protected data

Use commands for metadata, lifecycle, dependencies, selection and native worktrees. Do not manufacture state by hand after a failed command. Ordinary file editing has no shared SpecDock lock or permission enforcement.

Preserve raw Git error details and the CLI's confirmed/unknown/not-attempted effects. Keep backups, uncertain records and candidates. Inspect actual local/remote state before a new explicit operation; do not automatically replay an unknown GitHub mutation, revert Git effects or resume a retired journal. Broken or multiple direct records are diagnostics, not an empty worktree.

## Report

Return the resolved target/path, material command effects, verification and remaining gates. A successful query, readiness result or document review does not by itself finish the Issue.
