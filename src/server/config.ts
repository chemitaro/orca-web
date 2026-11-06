// orca-web の設定。環境変数から、待ち受けのアドレス、許す Host、自分のオリジン、SpecDock のオリジンを導く。
// 待ち受けは 127.0.0.1 と、設定した Tailscale の IP だけ（0.0.0.0 に代えない）。
import { isIPv4 } from 'node:net';
import path from 'node:path';

export const LOOPBACK = '127.0.0.1';
export const DEFAULT_PORT = 8791;
export const SPECDOCK_PORT = 47800;
export const DEFAULT_ORCA_CLI = '/Applications/Orca.app/Contents/Resources/bin/orca';

export interface AppConfig {
  port: number;
  /** 待ち受けのアドレス（127.0.0.1 と、あれば Tailscale の IP）。 */
  bindAddresses: string[];
  /** Host の見出しとして許す値（`<アドレス>:<port>`）。 */
  allowedHosts: string[];
  /** orca-web 自身のオリジン（`http://<アドレス>:<port>`）。 */
  selfOrigins: string[];
  /** ボタンの画面を埋め込んでよい SpecDock のオリジン（frame-ancestors）。 */
  specdockOrigins: string[];
  orcaCli: string;
}

export class ConfigError extends Error {}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  if (!/^\d+$/.test(raw)) throw new ConfigError('ORCA_WEB_PORT must be a port number');
  const port = Number(raw);
  if (port < 1 || port > 65535) throw new ConfigError('ORCA_WEB_PORT must be between 1 and 65535');
  return port;
}

/** Tailscale の IPv4。0.0.0.0、ループバック、ブロードキャストなどの特別な値は受けない。 */
function parseTailscaleIp(raw: string | undefined): string | null {
  if (raw === undefined || raw === '') return null;
  if (!isIPv4(raw)) throw new ConfigError('ORCA_WEB_TAILSCALE_IP must be an IPv4 address');
  const first = Number(raw.split('.')[0]);
  if (first === 0 || first === 127 || first >= 224 || raw === '255.255.255.255') {
    throw new ConfigError('ORCA_WEB_TAILSCALE_IP must be a unicast address that is not 0.0.0.0 or loopback');
  }
  return raw;
}

/** `http(s)://host[:port]` の形（パス、問い合わせ、利用者の情報なし）だけを受け、正規の形で返す。 */
export function parseOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`invalid origin: ${raw}`);
  }
  const bare = url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !bare || raw.replace(/\/$/, '') !== url.origin) {
    throw new ConfigError(`origin must be scheme://host[:port] only: ${raw}`);
  }
  return url.origin;
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const port = parsePort(env.ORCA_WEB_PORT);
  const tailscaleIp = parseTailscaleIp(env.ORCA_WEB_TAILSCALE_IP);
  const bindAddresses = tailscaleIp ? [LOOPBACK, tailscaleIp] : [LOOPBACK];
  const rawOrigins = env.ORCA_WEB_SPECDOCK_ORIGINS;
  const specdockOrigins =
    rawOrigins !== undefined && rawOrigins.trim() !== ''
      ? rawOrigins
          .split(',')
          .map((o) => o.trim())
          .filter((o) => o !== '')
          .map(parseOrigin)
      : bindAddresses.map((a) => `http://${a}:${SPECDOCK_PORT}`);
  const orcaCli = env.ORCA_WEB_ORCA_CLI || DEFAULT_ORCA_CLI;
  if (!path.isAbsolute(orcaCli)) throw new ConfigError('ORCA_WEB_ORCA_CLI must be an absolute path');
  return {
    port,
    bindAddresses,
    allowedHosts: bindAddresses.map((a) => `${a}:${port}`),
    selfOrigins: bindAddresses.map((a) => `http://${a}:${port}`),
    specdockOrigins: [...new Set(specdockOrigins)],
    orcaCli,
  };
}
