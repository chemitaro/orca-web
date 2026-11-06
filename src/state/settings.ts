// 表示する項目の選択を、この Mac の利用者の設定のファイルに持つ。
// 読めない、壊れているときは既定の選択で動き、理由を返す。書くときは一時ファイルに書いてから名前を変える。
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { DEFAULT_SELECTED, FIELD_IDS } from './fields.ts';

export const DEFAULT_SETTINGS_FILE = path.join(
  homedir(),
  'Library',
  'Application Support',
  'orca-web',
  'settings.json',
);

export interface SettingsInfo {
  source: 'file' | 'default';
  error: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export class SettingsStore {
  readonly #file: string;
  #selected: string[] = [...DEFAULT_SELECTED];
  #info: SettingsInfo = { source: 'default', error: null };

  constructor(file: string = DEFAULT_SETTINGS_FILE) {
    this.#file = file;
  }

  get selected(): string[] {
    return [...this.#selected];
  }

  get info(): SettingsInfo {
    return { ...this.#info };
  }

  /** ファイルを読み直す。例外を投げない。 */
  async load(): Promise<void> {
    const fallback = (error: string | null): void => {
      this.#selected = [...DEFAULT_SELECTED];
      this.#info = { source: 'default', error };
    };
    let raw: string;
    try {
      raw = await readFile(this.#file, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      fallback(code === 'ENOENT' ? null : `settings file is not readable (${code ?? 'read failed'})`);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      fallback('settings file is not valid JSON');
      return;
    }
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.fields)) {
      fallback('settings file has an unknown shape');
      return;
    }
    const known = parsed.fields.filter((id): id is string => typeof id === 'string' && FIELD_IDS.has(id));
    this.#selected = [...new Set(known)];
    this.#info = { source: 'file', error: null };
  }

  /** 選択を保存する。呼ぶ側が checkSelection で確かめた値を渡す。書けなければ投げ、メモリーの選択も変えない。 */
  async saveSelected(selected: readonly string[]): Promise<void> {
    const dir = path.dirname(this.#file);
    const tmp = path.join(dir, `.settings.${process.pid}.${randomUUID()}.tmp`);
    const body = `${JSON.stringify({ version: 1, fields: selected }, null, 2)}\n`;
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeFile(tmp, body, { mode: 0o600, flag: 'wx' });
      await rename(tmp, this.#file);
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => {});
      const code = (error as NodeJS.ErrnoException).code ?? 'write failed';
      throw new Error(`cannot save settings (${code})`);
    }
    this.#selected = [...selected];
    this.#info = { source: 'file', error: null };
  }
}
