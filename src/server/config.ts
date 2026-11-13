// 起動の設定を環境変数から読む。誤った値は起動の誤りにする（黙って既定に戻さない）。
// 待ち受けは 127.0.0.1 と、設定した Tailscale の IP だけ（0.0.0.0 に代えない）。

import { isIPv4 } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import { DEFAULT_SETTINGS_FILE } from '../state/settings.ts';

export const DEFAULT_PORT = 8791;
export const LOOPBACK = '127.0.0.1';
/** SpecDock のダッシュボードのポート。 */
export const SPECDOCK_PORT = 47800;
/** SpecDock のダッシュボードのオリジン（127.0.0.1 の 47800）。Tailscale の IP を設定すると、その :47800 も足す。 */
export const DEFAULT_READ_ORIGINS: readonly string[] = [`http://${LOOPBACK}:${SPECDOCK_PORT}`];
export const DEFAULT_ORCA_BIN = '/Applications/Orca.app/Contents/Resources/bin/orca';

export interface AppConfig {
  port: number;
  stallMinutes: number;
  /**
   * SpecDock の正確なオリジン。読み取りの CORS を許し、画面とボタンの部品の frame-ancestors にも使う。
   * 空なら、どちらも許さない。
   */
  readOrigins: string[];
  settingsFile: string;
  sendsDir: string;
  orcaBin: string;
  /** 待ち受けのアドレス（127.0.0.1 と、あれば Tailscale の IP）。 */
  bindAddresses: string[];
  /** 待ち受けのポートの `127.0.0.1` と `localhost` のほかに許す Host（Tailscale の IP の `<IP>:<port>`）。 */
  extraHosts: string[];
}

export class ConfigError extends Error {}

/** カンマ区切りのオリジンを読む。`new URL(o).origin` と同じ文字列（http か https、パスも末尾の / もない）だけを受ける。 */
export function parseOrigins(text: string, name = 'ORCA_WEB_READ_ORIGINS'): string[] {
  const origins = text
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  for (const origin of origins) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(origin);
    } catch {
      parsed = null;
    }
    if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== origin) {
      throw new ConfigError(`${name}: "${origin}" is not an exact origin like http://127.0.0.1:47800`);
    }
  }
  return origins;
}

/** Tailscale の IPv4。0.0.0.0、ループバック、マルチキャスト、ブロードキャストは受けない。 */
function parseTailscaleIp(raw: string | undefined): string | null {
  if (raw === undefined || raw === '') return null;
  if (!isIPv4(raw)) throw new ConfigError(`ORCA_WEB_TAILSCALE_IP: "${raw}" is not an IPv4 address`);
  const first = Number(raw.split('.')[0]);
  if (first === 0 || first === 127 || first >= 224) {
    throw new ConfigError(`ORCA_WEB_TAILSCALE_IP: "${raw}" must be a unicast address that is not 0.0.0.0 or loopback`);
  }
  return raw;
}

export function loadConfig(env: Readonly<Record<string, string | undefined>> = process.env): AppConfig {
  const portText = env.PORT ?? String(DEFAULT_PORT);
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port > 65535) {
    throw new ConfigError(`PORT: "${portText}" is not a port`);
  }
  const stallText = env.ORCA_WEB_STALL_MINUTES ?? '30';
  const stallMinutes = Number(stallText);
  if (!/^\d+$/.test(stallText) || !Number.isInteger(stallMinutes) || stallMinutes < 1 || stallMinutes > 1440) {
    throw new ConfigError('ORCA_WEB_STALL_MINUTES: must be an integer from 1 to 1440');
  }
  const tailscaleIp = parseTailscaleIp(env.ORCA_WEB_TAILSCALE_IP);
  const readOrigins =
    env.ORCA_WEB_READ_ORIGINS === undefined
      ? [...DEFAULT_READ_ORIGINS, ...(tailscaleIp ? [`http://${tailscaleIp}:${SPECDOCK_PORT}`] : [])]
      : parseOrigins(env.ORCA_WEB_READ_ORIGINS);
  return {
    port,
    stallMinutes,
    readOrigins: [...new Set(readOrigins)],
    sendsDir: env.ORCA_WEB_SENDS_DIR || path.join(homedir(), 'Library', 'Application Support', 'orca-web', 'sends'),
    settingsFile: env.ORCA_WEB_SETTINGS_FILE || DEFAULT_SETTINGS_FILE,
    orcaBin: env.ORCA_BIN || DEFAULT_ORCA_BIN,
    bindAddresses: tailscaleIp ? [LOOPBACK, tailscaleIp] : [LOOPBACK],
    extraHosts: tailscaleIp ? [`${tailscaleIp}:${port}`] : [],
  };
}
