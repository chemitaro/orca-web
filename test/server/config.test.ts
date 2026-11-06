import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, loadConfig } from '../../src/server/config.ts';

test('既定は 127.0.0.1:8791 だけで待ち受け、SpecDock は http://127.0.0.1:47800', () => {
  const c = loadConfig({});
  assert.equal(c.port, 8791);
  assert.deepEqual(c.bindAddresses, ['127.0.0.1']);
  assert.deepEqual(c.allowedHosts, ['127.0.0.1:8791']);
  assert.deepEqual(c.selfOrigins, ['http://127.0.0.1:8791']);
  assert.deepEqual(c.specdockOrigins, ['http://127.0.0.1:47800']);
  assert.equal(c.orcaCli, '/Applications/Orca.app/Contents/Resources/bin/orca');
});

test('Tailscale の IP があれば、2つのアドレスで待ち受け、Host、自分のオリジン、SpecDock のオリジンを導く', () => {
  const c = loadConfig({ ORCA_WEB_PORT: '9000', ORCA_WEB_TAILSCALE_IP: '100.101.102.103' });
  assert.deepEqual(c.bindAddresses, ['127.0.0.1', '100.101.102.103']);
  assert.deepEqual(c.allowedHosts, ['127.0.0.1:9000', '100.101.102.103:9000']);
  assert.deepEqual(c.selfOrigins, ['http://127.0.0.1:9000', 'http://100.101.102.103:9000']);
  assert.deepEqual(c.specdockOrigins, ['http://127.0.0.1:47800', 'http://100.101.102.103:47800']);
});

test('SpecDock のオリジンは設定で変えられ、scheme://host[:port] の形だけを受ける', () => {
  const c = loadConfig({ ORCA_WEB_SPECDOCK_ORIGINS: 'http://127.0.0.1:47801, https://dash.example.ts.net' });
  assert.deepEqual(c.specdockOrigins, ['http://127.0.0.1:47801', 'https://dash.example.ts.net']);
  for (const bad of ['http://x:1/path', 'ftp://x', 'http://u:p@x', 'http://x?a=1', 'not a url', "'self'"]) {
    assert.throws(() => loadConfig({ ORCA_WEB_SPECDOCK_ORIGINS: bad }), ConfigError, bad);
  }
});

test('0.0.0.0、ループバック、IPv4 でない値の Tailscale の IP と、不正なポート、相対の CLI のパスを拒む', () => {
  for (const ip of ['0.0.0.0', '127.0.0.1', '255.255.255.255', '224.0.0.1', '::', 'localhost', '100.1.2']) {
    assert.throws(() => loadConfig({ ORCA_WEB_TAILSCALE_IP: ip }), ConfigError, ip);
  }
  for (const port of ['0', '70000', 'abc', '-1']) {
    assert.throws(() => loadConfig({ ORCA_WEB_PORT: port }), ConfigError, port);
  }
  assert.throws(() => loadConfig({ ORCA_WEB_ORCA_CLI: 'bin/orca' }), ConfigError);
});
