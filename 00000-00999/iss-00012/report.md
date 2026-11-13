---
種別: レポート（Issue）
ID: "iss-00012"
関連GitHub: ["#12"]
最終更新: "2026-11-13"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

会話のログの API と、エージェントの詳細とチャットの画面（読むだけ）を作った。送信の欄は置いていない（iss-00013）。

- 会話の読み手（`src/orca/read-transcript.ts`）：状態の API のエージェントの id から、Orca がタブに持つセッションの識別子と記録のパス（Orca の画面の `resolveNativeChatSession` と同じ）を解き、端末は `nativeChat.readSession`（`capabilities: { transcriptSourceOrder: 1 }`）、構造化 Chat は `agentSession.history` で読む。`READ_METHODS` に `agentSession.history` を足した（streaming の method は入れない）。誤りは `agent_not_found`、`no_session`、`transcript_not_found`、`unsupported`、`unreachable`、`read_failed`、`unknown_shape` に分け、Orca の誤りの文と記録のパスは返さない。
- 正規化（`src/transcript/normalize.ts`、`orca-web.transcript/v1`）：役割 user・assistant・tool・system と、本文、ツールの呼び出しと結果、「表示できない」の印（画像、サブエージェント、裏の作業、diff など決めた名前だけ）。思考は印も付けずに落とす。端末の件は並べ替えず、構造化 Chat は journal の位置の順。長い本文と出力は切る。古いページの位置はセッションの鍵を含む不透明な文字。
- 窓の差分と共有の見張り（`src/transcript/diff.ts`、`hub.ts`）：エージェントごとに1つの見張りが 1.5 秒ごとに末尾を読み直し、追記（足された件と同じ id で変わった件）と置き換えに分ける。セッションが変われば置き換え、読めなければ unavailable、回復で置き換え。見張り 8、購読者 32 の上限。見る人がいなければ止める。
- HTTP（`src/server/app.ts`）：`GET /api/transcript`（ページング）と `GET /api/transcript/events`（SSE）。同じオリジンだけで CORS を付けない。`/embed/agent` を既存の埋め込みと同じ CSP（inline を許さない、frame-ancestors は読み取りのオリジンだけ）で配る。
- 画面（`web/embed/agent.*`）：上に詳細（題名、worktree、種類、状態、モデルと推論と意味、親と子、PR と CI、Orca で開く）、下に会話（吹き出し、折り畳んだツール、知らせの行、表示できない印）。文字は textContent だけで描く。幅 390px 以下では Orca で開くを出さず、詳細を畳んで始める。置き換えの後や鍵の違う古いページは足さない。
- 状態の画面のエージェントの行の見出しを、詳細とチャットの画面へのリンクにした。
- 実機の確かめの道具（`npm run transcript:live`）。

実装中に見つけて直したこと：

- 窓の差分で、件の並びが入れ替わると追記と誤る穴（足された件に前の窓の件が混ざる）。置き換えにした。
- 会話の行で、本文の吹き出しと続くツールの行の key が重なる穴。吹き出しの key を最初の本文の位置にした。
- 仕様のレビュー round 1 の P1：「機能が使えない」と「Orca に届かない」を同じ code にしていた。`unsupported` と `unreachable` に分けた。

## Verification

（ゲートの結果は、コードのレビューと最終品質ゲートの後に書き足す）

### 実機の確かめ（読むだけ、2026-11-13）

この Mac の Orca 1.4.256（CLI も 1.4.256）。`npm run transcript:live` の集計（件数だけ）。呼んだのは CLI の読むコマンドと、RPC の `session.tabs.listAll`、`session.tabs.list`、`nativeChat.readSession`、`agentSession.history` だけ。送信の RPC、開く口、購読の口（subscribe）は呼んでいない。会話の中身は記録していない。

| 取得元：種類 | エージェント | 解けた | 読めた | 誤り | Orca の返す順で位置が減らない | 2回目の読みの差分 | 前のページ（重なり） |
|---|---|---|---|---|---|---|---|
| nativeChat：claude | 13 | 13 | 12 | transcript_not_found 1 | 12/12 | none 12 | 12（0） |
| nativeChat：codex | 1 | 1 | 1 | なし | 1/1 | none 1 | 1（0） |
| agentSession：claude（構造化 Chat） | 2 | 2 | 2 | なし | 1/2（1 は位置なし） | none 2 | 1（0） |
| 解けない（セッションなし） | 36 | 0 | 0 | no_session 36 | ― | ― | ― |

- 読めた件：Claude 465 件（落とした思考 15）、Codex 40 件、構造化 Chat 40 件。部品は本文、ツールの呼び出しと結果だけで、「表示できない」の印は出なかった。
- **並び**：端末のエージェントは、Orca のデスクトップの画面と同じ読み方（`readNativeChatTranscriptTail` の sourceOrder。RPC は `transcriptSourceOrder: 1`）で読み、返る順のまま並べる。返った順で `transcriptOrder` が減った会話は 0。構造化 Chat は journal の位置の順に並べ、返った順で sequence が減った会話は 0。
- **購読の口**：Orca 1.4.256 のソースで、Unix ソケットの要求は `RuntimeRpcRequestAdmission.handleMessage` が `dispatcher.dispatch` だけを呼び、`dispatch` は streaming の method を `method_not_supported` で拒む（`rpc-request-admission-prologue.ts`）。streaming を通すのは WebSocket の `dispatchStreaming` だけ。実機では subscribe を送っていない（読む RPC の一覧を広げない）。
- 「セッションがない」36 件は、スリープ中や指示を受ける前のタブ（`providerSession` なし）。空の会話ではなく `no_session` で返る。
- 画面：headless の Chrome（CDP）で、このリポジトリの worktree の自分の会話を `/embed/agent` で開いた。幅 390px で横のはみ出し 0、Orca で開くは出ない。幅 1024px で出る。詳細 10 行、会話の行、送信の欄なし、`script`・`img` の要素 0。

## Residual Risks / Follow-ups

- `nativeChat.readSession` と `agentSession.history` は非公開の口。Orca の版が変わったら `npm run transcript:live` で確かめ直す。
- 読み直しの間隔（1.5 秒）の分だけ、Orca の画面より遅れる。40 件より多い件が1回の間隔で足されると置き換えになる。
- 構造化 Chat の会話は手元に2つだけで、サブエージェントの行や approval・question の件は実機で見ていない（「表示できない」の印になる）。
- SpecDock のオリジンの試しの画面での受け入れは iss-00014。
