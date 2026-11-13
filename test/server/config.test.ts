import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, loadConfig } from '../../src/server/config.ts';

test('既定は 127.0.0.1:8791 だけで待ち受け、SpecDock は http://127.0.0.1:47800、Host の追加はない', () => {
  const c = loadConfig({});
  assert.equal(c.port, 8791);
  assert.deepEqual(c.bindAddresses, ['127.0.0.1']);
  assert.deepEqual(c.extraHosts, []);
  assert.deepEqual(c.readOrigins, ['http://127.0.0.1:47800']);
  assert.equal(c.orcaBin, '/Applications/Orca.app/Contents/Resources/bin/orca');
});

test('Tailscale の IP があれば、2つのアドレスで待ち受け、その Host と SpecDock のオリジンを足す', () => {
  const c = loadConfig({ PORT: '9000', ORCA_WEB_TAILSCALE_IP: '100.101.102.103' });
  assert.deepEqual(c.bindAddresses, ['127.0.0.1', '100.101.102.103']);
  assert.deepEqual(c.extraHosts, ['100.101.102.103:9000']);
  assert.deepEqual(c.readOrigins, ['http://127.0.0.1:47800', 'http://100.101.102.103:47800']);
  const explicit = loadConfig({ ORCA_WEB_TAILSCALE_IP: '100.64.0.1', ORCA_WEB_READ_ORIGINS: 'http://127.0.0.1:47801' });
  assert.deepEqual(explicit.readOrigins, ['http://127.0.0.1:47801'], '明示したオリジンだけを使う');
});

test('ORCA_WEB_READ_ORIGINS は正確なオリジンだけを受け、空なら SpecDock を許さない（frame-ancestors は none）', () => {
  assert.deepEqual(loadConfig({ ORCA_WEB_READ_ORIGINS: ' , ' }).readOrigins, []);
  for (const bad of ['http://x:1/path', 'ftp://x', 'http://u:p@x', 'http://x?a=1', 'not a url', "'self'", '*']) {
    assert.throws(() => loadConfig({ ORCA_WEB_READ_ORIGINS: bad }), ConfigError, bad);
  }
});

test('0.0.0.0、ループバック、IPv4 でない値の Tailscale の IP と、不正なポートを拒む', () => {
  for (const ip of ['0.0.0.0', '127.0.0.1', '255.255.255.255', '224.0.0.1', '::', 'localhost', '100.1.2']) {
    assert.throws(() => loadConfig({ ORCA_WEB_TAILSCALE_IP: ip }), ConfigError, ip);
  }
  for (const port of ['70000', 'abc', '-1', '1.5', '']) {
    assert.throws(() => loadConfig({ PORT: port }), ConfigError, port);
  }
});

test('停滞の閾値は既定30分、1〜1440の整数だけを受ける', () => {
  assert.equal(loadConfig({}).stallMinutes, 30);
  for (const value of ['1', '1440', '60']) {
    assert.equal(loadConfig({ ORCA_WEB_STALL_MINUTES: value }).stallMinutes, Number(value));
  }
  for (const value of ['', '0', '-1', '1441', '1.1', 'NaN', 'Infinity', ' 30 ', '1e2', 'abc']) {
    assert.throws(() => loadConfig({ ORCA_WEB_STALL_MINUTES: value }), ConfigError, value);
  }
});

test('送信の記録の場所は空なら既定、ORCA_WEB_SENDS_DIR があればそれを使う', () => {
  assert.match(loadConfig({}).sendsDir, /\/Library\/Application Support\/orca-web\/sends$/);
  assert.equal(loadConfig({ ORCA_WEB_SENDS_DIR: '' }).sendsDir, loadConfig({}).sendsDir);
  assert.equal(loadConfig({ ORCA_WEB_SENDS_DIR: '/tmp/orca-web-test-sends' }).sendsDir, '/tmp/orca-web-test-sends');
});
