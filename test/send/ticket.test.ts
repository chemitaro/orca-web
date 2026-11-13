import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspect } from 'node:util';
import { checkText, digestText, newOperationId, TicketStore } from '../../src/send/ticket.ts';
import { terminalTarget } from './fixture.ts';

test('本文は空白だけや文字列以外を理由つきで拒み、タブと改行を保つ', () => {
  for (const value of [undefined, null, 1, {}, []])
    assert.deepEqual(checkText(value), { ok: false, error: 'invalid_text', reason: 'not_string' });
  for (const value of ['', ' \t\n', '\u3000'])
    assert.deepEqual(checkText(value), { ok: false, error: 'invalid_text', reason: 'empty' });
  assert.deepEqual(checkText('仮の本文\t次\n'), { ok: true });
});

test('本文の上限は UTF-8 の16384バイトで、超えたときだけ拒む', () => {
  assert.deepEqual(checkText('a'.repeat(16384)), { ok: true });
  assert.deepEqual(checkText(`${'あ'.repeat(5461)}a`), { ok: true });
  for (const text of ['a'.repeat(16385), 'あ'.repeat(5462)])
    assert.deepEqual(checkText(text), { ok: false, error: 'invalid_text', reason: 'too_large' });
});

test('CR、C0、DEL、C1 の制御文字を拒み、タブとLFは通す', () => {
  for (const code of [...Array.from({ length: 32 }, (_, i) => i), ...Array.from({ length: 33 }, (_, i) => 127 + i)]) {
    const result = checkText(`a${String.fromCharCode(code)}b`);
    assert.deepEqual(
      result,
      code === 9 || code === 10 ? { ok: true } : { ok: false, error: 'invalid_text', reason: 'control_character' },
      `code ${code}`,
    );
  }
  assert.deepEqual(checkText('本文\r\n'), { ok: false, error: 'invalid_text', reason: 'control_character' });
});

test('本文の指紋は既知の sha256 と一致し、操作の ID は時刻と16バイトの乱数で作る', () => {
  assert.equal(digestText('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(
    newOperationId(1760000000000, (size) => {
      assert.equal(size, 16);
      return Uint8Array.from({ length: 16 }, (_, i) => i);
    }),
    '1760000000000-000102030405060708090a0b0c0d0e0f',
  );
  assert.match(newOperationId(), /^\d{13}-[0-9a-f]{32}$/);
});

const ticketInput = () => ({
  target: terminalTarget(),
  digest: digestText('仮の本文'),
  operationId: '1760000000000-0123456789abcdef0123456789abcdef',
});

test('票は32バイトのbase64urlで発行し、60秒の期限と識別子を保持する', () => {
  const store = new TicketStore({ now: () => 1760000000000 });
  const issued = store.issue(ticketInput());
  assert.match(issued.ticket, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(issued.ticket, 'base64url').length, 32);
  assert.equal(issued.expiresAt, 1760000060000);
  assert.ok(!inspect(store, { showHidden: true, depth: 10 }).includes(issued.ticket));
  assert.ok(!JSON.stringify(store).includes(issued.ticket));
});

test('票の取り出しは同期的に消費し、2回目には unknown、操作の ID は保持する', () => {
  const store = new TicketStore({ now: () => 1760000000000 });
  const input = ticketInput();
  const issued = store.issue(input);
  const taken = store.take(issued.ticket);
  assert.ok(!(taken instanceof Promise));
  assert.deepEqual(taken, { ok: true, value: { ...input, expiresAt: issued.expiresAt } });
  assert.deepEqual(store.take(issued.ticket), { ok: false, reason: 'unknown' });
});

test('期限の直前は使え、60秒ちょうどで expired にして票を消す', () => {
  let now = 1760000000000;
  const store = new TicketStore({ now: () => now });
  const first = store.issue(ticketInput());
  const second = store.issue(ticketInput());
  now += 59999;
  assert.ok(store.take(first.ticket).ok);
  now += 1;
  assert.deepEqual(store.take(second.ticket), { ok: false, reason: 'expired' });
  assert.deepEqual(store.take(second.ticket), { ok: false, reason: 'unknown' });
});

test('33個目の票は最も古い票だけを捨て、残る32個を使える', () => {
  const store = new TicketStore({ now: () => 1760000000000 });
  const tickets = Array.from({ length: 33 }, (_, i) =>
    store.issue({ ...ticketInput(), operationId: newOperationId(1760000000000 + i) }),
  );
  const first = tickets[0];
  assert.ok(first);
  assert.deepEqual(store.take(first.ticket), { ok: false, reason: 'unknown' });
  for (const ticket of tickets.slice(1)) assert.ok(store.take(ticket.ticket).ok);
});

test('操作の ID で票を同期的に取り消し、期限外でも消し、他の操作の票を残す', () => {
  let now = 1760000000000;
  const store = new TicketStore({ now: () => now });
  const input = ticketInput();
  const first = store.issue(input);
  const sameOperation = store.issue(input);
  const other = store.issue({ ...input, operationId: newOperationId(now + 1) });
  assert.equal(store.cancelByOperation(input.operationId), true);
  assert.deepEqual(store.take(first.ticket), { ok: false, reason: 'unknown' });
  assert.deepEqual(store.take(sameOperation.ticket), { ok: false, reason: 'unknown' });
  assert.equal(store.cancelByOperation(input.operationId), false);
  assert.ok(store.take(other.ticket).ok);
  const expired = store.issue(input);
  now += 60000;
  assert.equal(store.cancelByOperation(input.operationId), true);
  assert.deepEqual(store.take(expired.ticket), { ok: false, reason: 'unknown' });
});

test('同じ票を同時に使おうとしても1つだけが取り出せ、発行後の入力の変更は票に影響しない', async () => {
  const store = new TicketStore({ now: () => 1760000000000 });
  const input = ticketInput();
  const issued = store.issue(input);
  input.target.handle = 'term_changed';
  input.operationId = 'changed';
  input.digest = 'changed';
  const results = await Promise.all([
    Promise.resolve().then(() => store.take(issued.ticket)),
    Promise.resolve().then(() => store.take(issued.ticket)),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.deepEqual(results[0], { ok: true, value: { ...ticketInput(), expiresAt: issued.expiresAt } });
  assert.deepEqual(results[1], { ok: false, reason: 'unknown' });
});
