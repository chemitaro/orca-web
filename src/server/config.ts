// 起動の設定を環境変数から読む。誤った値は起動の誤りにする（黙って既定に戻さない）。
import { DEFAULT_SETTINGS_FILE } from '../state/settings.ts';

export const DEFAULT_PORT = 8791;
/** SpecDock のダッシュボードのオリジン（127.0.0.1 の 47800）。Tailscale のアドレスは ORCA_WEB_READ_ORIGINS で足す。 */
export const DEFAULT_READ_ORIGINS: readonly string[] = ['http://127.0.0.1:47800'];
export const DEFAULT_ORCA_BIN = '/Applications/Orca.app/Contents/Resources/bin/orca';

export interface AppConfig {
  port: number;
  /** 読み取りの CORS を許す、正確なオリジン。 */
  readOrigins: string[];
  settingsFile: string;
  orcaBin: string;
}

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
      throw new Error(`${name}: "${origin}" is not an exact origin like http://127.0.0.1:47800`);
    }
  }
  return origins;
}

export function loadConfig(env: Readonly<Record<string, string | undefined>> = process.env): AppConfig {
  const portText = env.PORT ?? String(DEFAULT_PORT);
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT: "${portText}" is not a port`);
  return {
    port,
    readOrigins:
      env.ORCA_WEB_READ_ORIGINS === undefined ? [...DEFAULT_READ_ORIGINS] : parseOrigins(env.ORCA_WEB_READ_ORIGINS),
    settingsFile: env.ORCA_WEB_SETTINGS_FILE || DEFAULT_SETTINGS_FILE,
    orcaBin: env.ORCA_BIN || DEFAULT_ORCA_BIN,
  };
}
