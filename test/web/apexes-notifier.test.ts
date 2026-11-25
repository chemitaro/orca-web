import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createApexNotifier, NOTIFY_BUTTON_TEXT } from '../../web/apexes-dom.js';
import { createNotifyTracker } from '../../web/apexes-notify.js';

class FakeButton {
  type = '';
  className = '';
  textContent = '';
  listeners: Record<string, (() => void)[]> = {};
  addEventListener(type: string, fn: () => void) {
    this.listeners[type] ??= [];
    this.listeners[type].push(fn);
  }
  click() {
    for (const fn of this.listeners.click ?? []) fn();
  }
}

const fakeDoc = (hidden: boolean) => ({ hidden, createElement: () => new FakeButton() });

type Shown = { title: string; options: { body: string; tag: string }; onclick: (() => void) | null };

/** 注入する Notification。作ったものを shown に残す。 */
function fakeNotification(permission: string, granted = 'granted') {
  const shown: Shown[] = [];
  let requests = 0;
  class Fake {
    static permission = permission;
    static async requestPermission() {
      requests++;
      Fake.permission = granted;
      return granted;
    }
    title: string;
    options: { body: string; tag: string };
    onclick: (() => void) | null = null;
    constructor(title: string, options: { body: string; tag: string }) {
      this.title = title;
      this.options = options;
      shown.push(this);
    }
  }
  return { Notification: Fake, shown, requests: () => requests };
}

const candidate = { id: 'a', key: 'a\napex_waiting', title: '題名 A', reasons: ['入力待ち'] };

test('T-04: isSecureContext が偽・Notification がない・denied では、ボタンも通知もない', () => {
  const cases = [
    { env: { ...fakeNotification('default'), isSecureContext: false }, label: 'http' },
    { env: { Notification: undefined, isSecureContext: true }, label: 'no Notification' },
    { env: { ...fakeNotification('denied'), isSecureContext: true }, label: 'denied' },
    { env: { ...fakeNotification('granted'), isSecureContext: false }, label: 'granted but insecure' },
  ];
  for (const { env, label } of cases) {
    const notifier = createApexNotifier({ doc: fakeDoc(true), env, onOpen: () => {} });
    assert.equal(
      notifier.renderControl(() => {}),
      null,
      label,
    );
    assert.equal(notifier.keepAliveWhenHidden(), false, label);
    const marked: string[] = [];
    notifier.deliver([candidate], (key: string) => marked.push(key));
    assert.deepEqual(marked, [], label);
    if ('shown' in env) assert.equal(env.shown.length, 0, label);
  }
});

test('T-04: default なら「通知を許可」のボタンを出し、押したときだけ requestPermission を呼ぶ', async () => {
  const fake = fakeNotification('default');
  const env = { ...fake, isSecureContext: true };
  const notifier = createApexNotifier({ doc: fakeDoc(false), env, onOpen: () => {} });
  let changed = 0;
  const button = notifier.renderControl(() => changed++) as FakeButton;
  assert.ok(button);
  assert.equal(button.textContent, NOTIFY_BUTTON_TEXT);
  assert.equal(button.type, 'button');
  assert.equal(fake.requests(), 0);
  assert.equal(notifier.keepAliveWhenHidden(), false);
  button.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fake.requests(), 1);
  assert.equal(changed, 1);
  assert.equal(notifier.keepAliveWhenHidden(), true);
  assert.equal(
    notifier.renderControl(() => {}),
    null,
    'granted ではボタンを出さない',
  );
});

test('T-04: granted でも document.hidden が偽なら出さず、markShown もしない', () => {
  const fake = fakeNotification('granted');
  const notifier = createApexNotifier({
    doc: fakeDoc(false),
    env: { ...fake, isSecureContext: true },
    onOpen: () => {},
  });
  const marked: string[] = [];
  notifier.deliver([candidate], (key: string) => marked.push(key));
  assert.equal(fake.shown.length, 0);
  assert.deepEqual(marked, []);
});

test('T-04: granted で隠れていれば題名と理由の言葉だけで出し、押すと窓を前に出して頂点を選ぶ。最後の一言は入らない', () => {
  const fake = fakeNotification('granted');
  let focused = 0;
  const opened: string[] = [];
  const doc = fakeDoc(true);
  const notifier = createApexNotifier({
    doc,
    env: { ...fake, isSecureContext: true, focus: () => focused++ },
    onOpen: (id: string) => opened.push(id),
  });
  const secret = '最後の一言の秘密の本文';
  const tracker = createNotifyTracker();
  const item = {
    id: 'a',
    group: 'needs_action',
    reasons: ['apex_waiting', 'question'],
    title: '題名 A',
    lastAssistantMessage: secret,
    worktreeName: '/Users/someone/secret-path',
  };
  tracker.observe({ stale: false, items: [] });
  tracker.observe({ stale: false, items: [] });
  tracker.observe({ stale: false, items: [item] });
  const candidates = tracker.observe({ stale: false, items: [item] });
  notifier.deliver(candidates, (key: string) => tracker.markShown(key));
  assert.equal(fake.shown.length, 1);
  const n = fake.shown[0] as Shown;
  assert.equal(n.title, '題名 A');
  assert.equal(n.options.body, '入力待ち・未回答の質問');
  assert.equal(n.options.tag, candidates[0]?.key);
  for (const text of [n.title, n.options.body, n.options.tag]) {
    assert.ok(!text.includes(secret));
    assert.ok(!text.includes('/Users/'));
  }
  assert.deepEqual(tracker.observe({ stale: false, items: [item] }), [], '出したものは二度と返さない');
  n.onclick?.();
  assert.equal(focused, 1);
  assert.deepEqual(opened, ['a']);
});

test('T-04: Notification を作るのに失敗しても例外を出さず、markShown しない', () => {
  class Broken {
    static permission = 'granted';
    constructor() {
      throw new Error('blocked');
    }
  }
  const notifier = createApexNotifier({
    doc: fakeDoc(true),
    env: { Notification: Broken, isSecureContext: true },
    onOpen: () => {},
  });
  const marked: string[] = [];
  assert.doesNotThrow(() => notifier.deliver([candidate], (key: string) => marked.push(key)));
  assert.deepEqual(marked, []);
});

test('T-04: 入口は通知の口を tracker と輪につなぐ（keepAliveWhenHidden と 30 秒、読みの失敗で observeFailure）', async () => {
  const entry = await readFile(new URL('../../web/apexes.js', import.meta.url), 'utf8');
  assert.match(entry, /keepAliveWhenHidden: \(\) => notifier\.keepAliveWhenHidden\(\)/);
  assert.match(entry, /hiddenDelayMs: HIDDEN_POLL_MS/);
  assert.match(entry, /const HIDDEN_POLL_MS = 30_000;/);
  assert.match(entry, /notifyTracker\.observeFailure\(\)/);
  assert.match(entry, /notifier\.deliver\(notifyTracker\.observe\(doc\)/);
});
