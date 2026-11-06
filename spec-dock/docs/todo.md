# 人のタスクの使い方

人にしかできない判断・確認・操作を、そのリポジトリのカタログ（`spec-dock/initiatives/todos/`）に登録して追うための文書です。コマンドの引数と契約は[CLI参照](reference_cli.md)の C62〜C71 と「人のタスクの契約」の節にあります。エージェントが登録する場面と閉じ方の規則は、配布するスキル（`.agents/skills/spec-dock/SKILL.md`）の「人のタスク」の節にあります。カタログの用意と保存は[canonical モードの使い方](canonical.md)を読みます。

`todo` のコマンドは GitHub に要求を送らず、Scope の状態、依存、`work start` の判定を変えません。登録は、カタログへのリンクがあるチェックアウト（`spec-dock canonical link` の後）から行います。

## 使い方

```sh
# 人が登録する（題名だけでよい。期限を付けなければ、登録の4時間後）
spec-dock todo add --title "請求先の確認"

# エージェントが登録する（役割、種類、背景と問い、答える場所、所要時間が要る）
spec-dock todo add --by agent --role worker --kind decide \
  --title "保存形式はどちらにするか" --body "背景と問い" \
  --option a=JSON --option b=YAML --recommend a --reason "既存の記録と同じ" \
  --reply-to "この会話か iss-00551 の PR" --effort 10m --blocks iss-00551

# 1回の会話で終わらない複数の項目は、束とサブタスクで登録する
spec-dock todo add --by agent --role coordinator --kind checklist --title "リリース前の確認" \
  --body "出す項目と、答えを受ける場所" --reply-to "この会話" --effort 30m --item "鍵の更新" --item "請求先の確認"

spec-dock todo list                 # 開いたタスク（期限切れ、近いもの、止めているもの、…の順）
spec-dock todo show t-7k3m          # 1件と、サブタスクの残り
spec-dock todo done t-7k3m --choice a --record docs/decisions/x.md   # 答えを受けて閉じる
spec-dock todo done t-7k3m.1 --record https://example.com/thread/1   # サブタスクを閉じる
spec-dock todo snooze t-7k3m --until 2026-12-01   # 指定の日まで一覧から隠す
spec-dock todo cancel t-7k3m --reason "不要になった"
spec-dock todo reopen t-7k3m
```

- 種類（`--kind`）は `decide`（選ぶ）、`check`（確かめる）、`operate`（操作する）、`act`（期限のある行為）、`todo`（そのほか。人が登録するものだけで、`--by agent --kind todo` は `TODO_INVALID`）、`checklist`（会話の束）です。エージェントが選ぶのは `decide`、`check`、`operate`、`act`、`checklist` です。
- ID は `t-` と4文字、サブタスクは `t-xxxx.1` です。大文字で入力しても受けます。
- 期限（`--due`）は `30m`、`4h`、`2d`、`YYYY-MM-DD`、時間帯つきの ISO 8601 で書きます。過去の時刻は `TODO_INVALID` です。
- 開いたサブタスクがある親は、`todo done` が `TODO_SUBTASKS_OPEN` で止まります。全部閉じてから、か `--include-subtasks` を付けます。
- 秘密の値（鍵、トークン、パスワード）は書きません。操作のコマンドは書いてかまいません。
- 閉じるときは `--record` に、答えの原文（会話の記録のファイルか URL）を渡して、あとから辿れるようにします。
- 登録しない場面：会話の中で答えが返るもの、PR のマージ待ち（ダッシュボードの表示を使う）。

## 記録の形

- 場所：カタログの `todos/<作った年月（UTC）>/t-xxxx.json` に1件1つ（例 `todos/2026-11/t-7k3m.json`）。閉じても動かさず、消しません。サブタスクは親の記録の中に入ります。
- 契約：`specdock.todo/v1`。主な欄は `id`、`title`、`kind`、`status`（`open`、`snoozed`、`done`、`cancelled`）、`created_at`、`updated_at`、`origin {by, role}`、`body`、`options`、`recommendation`、`reply_to`、`effort`、`due`、`snooze_until`、`scopes {related, blocks}`、`links`、`tags`、`subtasks`、`resolution`、`history` です。全部の欄と型は[CLI参照](reference_cli.md)の「人のタスクの契約」にあります。
- 時刻は UTC の `YYYY-MM-DDTHH:MM:SSZ` です。知らない欄は誤りにせず、書き換えるときに残します。
- 手で編集しません。`spec-dock todo check` が、全部のファイルを Python の検査と（`cue` v0.17.1 以上があれば）`cue vet` で確かめます。2台で同じ記録を変えたときは `*.conflict-*` の写しが残るので、中身を元のファイルに統合してから写しを消します（`TODO_CONFLICT_COPY`）。

## 設定の3段

件数の目安と既定の期限は、後の段が勝つ3段です。`spec-dock todo settings` が、効いている値と出どころを示します。

| 段 | 置き場 | 例 |
|---|---|---|
| 初めの値 | SpecDock の中 | `parent_limit` 20、`subtask_limit` 30、`default_due` `4h` |
| 利用者の設定 | `$XDG_CONFIG_HOME/spec-dock/config.json`（なければ `~/.config/spec-dock/config.json`） | 下の見本 |
| リポジトリの設定 | カタログの `todos/settings.json` | 下の見本 |

```json
{ "schema": "specdock.config/v1", "todo": { "default_due": "8h", "parent_limit": 30 } }
```

```json
{ "schema": "specdock.todo-settings/v1", "default_due": "2h", "subtask_limit": 50 }
```

SpecDock は設定のファイルを作りません。壊れた段は丸ごと飛ばし、`TODO_SETTINGS_INVALID` を警告します。目安を超えても登録でき、`TODO_LIMIT_EXCEEDED` が警告されます。

## 集約

このPCの登録簿にある全リポジトリのタスクを、チェックアウトの外から1つに並べて読めます。

```sh
spec-dock todo list --all-repositories
spec-dock todo list --repository owner/name
spec-dock todo show owner/name/t-7k3m
```

- 並びは、期限切れ、期限の近いもの、止めているもの、あとで、延期中、閉じたものの順で、リポジトリをまたいで1つです。
- 行ごとの `status` は `ok`、`unreadable`（カタログか `todos/` が読めない。次の1手は、そのリポジトリのmainのチェックアウトでの `spec-dock canonical link`）、`duplicate`（同じリポジトリの2つ目のクローン）です。読めない行があっても、ほかのリポジトリの分は返ります。
- 集まるのはこのPCの登録簿に載ったカタログだけです。`canonical link --no-schedule` でリンクしたカタログは入りません。
- `spec-dock dashboard summary` の `todos` に、そのリポジトリの開いている数、止めている数、期限切れの数が出ます。

## 外部の道具から読む

ダッシュボードやほかの道具は、`todos/` の JSON を読んで使えます。

- `specdock.todo/v1` の `schema` を確かめ、知らない版は読み飛ばします。知らない欄は無視し、書き戻す場合は残します。
- 派生の状態は読む側が決めます。延期中でも `snooze_until` を過ぎていれば開いたものとして扱い、`due` が今より前の開いたタスクは期限切れです。ファイルは書き換えません。
- 書くときは `spec-dock todo` のコマンドを使います。JSON を直接書くと、検査（`todo check`）と経緯（`history`）が崩れます。
- 衝突の写し（`*.conflict-*`）と、形の正しくない記録は、読み飛ばして警告にとどめます。
