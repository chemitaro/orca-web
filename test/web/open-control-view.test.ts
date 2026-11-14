import assert from 'node:assert/strict';
import { test } from 'node:test';

test('openResult は成功を決めた言葉にする', async () => {
  const { openResult } = await import('../../web/embed/open-control-view.js');
  assert.deepEqual(openResult({ kind: 'response', status: 200, body: { ok: true } }), {
    state: 'done',
    message: '開きました',
  });
});

test('openResult は端末が作られる可能性を成功の言葉に含める', async () => {
  const { openResult } = await import('../../web/embed/open-control-view.js');
  assert.deepEqual(openResult({ kind: 'response', status: 200, body: { ok: true, mayCreateInitialTerminal: true } }), {
    state: 'done',
    message: '開きました（Orca が端末を作ることがあります）',
  });
});

const errors = {
  busy: 'ほかの開く処理が動いています',
  worktree_not_found: 'Orca にこの worktree がありません',
  target_gone: 'タブが閉じられていました',
  unavailable: 'Orca につながりません',
  runtime_changed: 'Orca が再起動しました。もう一度押してください',
  unsupported: 'この Orca の版では開けません',
  unknown_shape: 'Orca の応答を読めません',
  orca_error: 'Orca が誤りを返しました',
  unconfirmed: '開いたか確かめられません',
};

test('openResult は9種類の誤りを表の言葉だけで示す', async () => {
  const { openResult, OPEN_MESSAGES } = await import('../../web/embed/open-control-view.js');
  assert.deepEqual(OPEN_MESSAGES, errors);
  for (const [error, message] of Object.entries(errors)) {
    assert.deepEqual(openResult({ kind: 'response', status: 409, body: { error, message: '<img onerror=secret>' } }), {
      state: 'error',
      message,
    });
  }
});

test('openResult は未知・欠落・継承された鍵を HTTP 状態だけにし、応答の文字を使わない', async () => {
  const { openResult } = await import('../../web/embed/open-control-view.js');
  for (const error of ['future_error', undefined, null, 'toString', '__proto__', 42]) {
    assert.deepEqual(
      openResult({
        kind: 'response',
        status: 503,
        body: { ok: 'true', error, message: '秘密', mayCreateInitialTerminal: true },
      }),
      { state: 'error', message: '開けません（503）' },
    );
  }
  assert.deepEqual(openResult({ kind: 'response', status: 403, body: {} }), {
    state: 'error',
    message: '開けません（403）',
  });
});

test('openResult は通信失敗を固定の言葉にする', async () => {
  const { openResult } = await import('../../web/embed/open-control-view.js');
  assert.deepEqual(openResult({ kind: 'network' }), { state: 'error', message: 'orca-web につながりません' });
});

test('openControlView は5状態と text・none を D-02 の表示にする', async () => {
  const { openControlView, OPEN_DONE_MS } = await import('../../web/embed/open-control-view.js');
  assert.equal(OPEN_DONE_MS, 2000);
  const cases = [
    ['idle', 'Orca で開く', 'orca', false, false, null, ''],
    ['busy', '開いています…', 'spinner', true, true, null, '開いています…'],
    ['done', '結果の言葉', 'check', false, false, null, '結果の言葉'],
    ['error', '結果の言葉', 'orca', false, false, 'warn', '結果の言葉'],
    ['missing', '結果の言葉', 'orca', true, false, 'warn', '結果の言葉'],
  ] as const;
  for (const [state, title, icon, disabled, busy, tone, status] of cases) {
    for (const label of ['text', 'none'] as const) {
      assert.deepEqual(
        openControlView(state, { label, message: '結果の言葉' }),
        {
          text: label === 'text' ? 'Open' : null,
          ariaLabel: label === 'text' ? 'Open（Orca で開く）' : 'Orca で開く',
          title,
          icon,
          disabled,
          busy,
          tone,
          status,
        },
        `${state}/${label}`,
      );
    }
  }
  assert.deepEqual(openControlView('idle'), openControlView('idle', { label: 'text' }));
});

test('missing は言葉を渡せばその言葉を title と status に使い、なければ worktree の指定がないと言う（レビュー P3-2）', async () => {
  const { openControlView } = await import('../../web/embed/open-control-view.js');
  assert.equal(openControlView('missing').title, 'worktree の指定がありません');
  assert.equal(openControlView('missing').status, 'worktree の指定がありません');
  const view = openControlView('missing', { message: 'エージェントが見つかりません' });
  assert.equal(view.title, 'エージェントが見つかりません');
  assert.equal(view.status, 'エージェントが見つかりません');
  assert.equal(view.disabled, true);
});
