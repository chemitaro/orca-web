// 録画の仮名化と検査。リポジトリは公開なので、秘密、利用者の家のパス、プロンプトや会話の本文を録画に残さない。
// 仮名化（sanitizeRecording）と検査（assertRecordingSafe）は別に作り、検査は仮名化の結果を信じずに録画全体を読む。
import { homedir } from 'node:os';
import type { CliRecording, Recording, RpcRecording } from './recording.ts';

/** 消す項目の名前（authToken、pairingCode など）。 */
const SECRET_KEY = /token$|secret|password|pairing|credential|api[-_]?key/i;

/** 値が自由な文になる項目の名前。文字列ならいつも text-N に置き換える。 */
export const FREE_TEXT_KEYS: ReadonlySet<string> = new Set([
  'prompt',
  'preview',
  'lastAssistantMessage',
  'lastCompletedAssistantMessage',
  'toolInput',
  'interactivePrompt',
  'title',
  'customTitle',
  'generatedTitle',
  'terminalTitle',
  'taskTitle',
  'task_title',
  'displayName',
  'display_name',
  'conversationName',
  'quickCommandLabel',
  'launchDraft',
  'spec',
  'result',
  'objective',
  'comment',
  'message',
  'text',
  'content',
  'body',
  'summary',
  'detail',
  'reason',
  'url',
  'remoteUrl',
  'name',
  'description',
  'argv',
  'command',
  'agentCommand',
  'agentArgs',
]);

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HEX = /(?<![0-9A-Za-z])(?=[0-9a-fA-F]*\d)(?=[0-9a-fA-F]*[a-fA-F])[0-9a-fA-F]{8,}(?![0-9A-Za-z])/g;
const SEGMENT = String.raw`[^\s/:"'\x60<>|,;()\[\]{}\\]`;
const ABS_PATH = new RegExp(String.raw`(?<![\w.~/-])/${SEGMENT}+(?:/${SEGMENT}*)*`, 'g');
const PSEUDONYM = /^(?:uuid|hex|p|text)-\d+$/;
const PSEUDONYM_ANY = /(?:uuid|hex|p|text)-\d+/g;
const SAFE_REMAINDER = /^[A-Za-z0-9._:/-]*$/;
const MAX_ENUM_CHARS = 40;
const IDENTIFIER_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const ID_PLACEHOLDER = '$ID';

/** 仮名と短い列挙の値と区切りだけでできた文字列か。仮名にしていない ID、パス、自由な文は false。 */
export function isSafeString(value: string): boolean {
  if (value === '' || value === ID_PLACEHOLDER) return true;
  if (value.includes('orca://pair')) return false;
  if (new RegExp(UUID.source, 'i').test(value)) return false;
  if (new RegExp(HEX.source).test(value)) return false;
  for (const match of value.match(new RegExp(ABS_PATH.source, 'g')) ?? []) {
    if (!match.split('/').every((segment) => segment === '' || PSEUDONYM.test(segment))) return false;
  }
  const remainder = value.replace(PSEUDONYM_ANY, '');
  return remainder.length <= MAX_ENUM_CHARS && SAFE_REMAINDER.test(remainder);
}

/** 1つの録画で1つ使う。同じ値には同じ仮名を返す。 */
export class Pseudonymizer {
  readonly #maps = new Map<string, Map<string, string>>();

  #name(kind: string, original: string): string {
    let map = this.#maps.get(kind);
    if (!map) {
      map = new Map();
      this.#maps.set(kind, map);
    }
    let name = map.get(original);
    if (!name) {
      name = `${kind}-${map.size + 1}`;
      map.set(original, name);
    }
    return name;
  }

  /** 自由な文の仮名。空の文は空のまま。 */
  text(original: string): string {
    return original === '' ? '' : this.#name('text', original);
  }

  /** 文字列の中の ID とパスを仮名に置き換える。置き換えた後に安全でなければ、元の文字列ごと text-N にする。 */
  string(original: string): string {
    if (original === ID_PLACEHOLDER || original === '') return original;
    if (original.includes('orca://pair')) return this.text(original);
    let out = original.replace(UUID, (m) => this.#name('uuid', m.toLowerCase()));
    out = out.replace(HEX, (m) => this.#name('hex', m.toLowerCase()));
    out = out.replace(ABS_PATH, (m) =>
      m
        .split('/')
        .map((segment) => (segment === '' || PSEUDONYM.test(segment) ? segment : this.#name('p', segment)))
        .join('/'),
    );
    return isSafeString(out) ? out : this.text(original);
  }

  key(original: string): string {
    return IDENTIFIER_KEY.test(original) ? original : this.string(original);
  }

  /** 値を仮名化する。key は、その値の項目の名前（自由な文か秘密かの判定に使う）。 */
  value(input: unknown, key = ''): unknown {
    if (typeof input === 'string') return FREE_TEXT_KEYS.has(key) ? this.text(input) : this.string(input);
    if (Array.isArray(input)) return input.map((item) => this.value(item, key));
    if (typeof input === 'object' && input !== null) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input)) {
        if (SECRET_KEY.test(k)) continue;
        out[this.key(k)] = this.value(v, k);
      }
      return out;
    }
    return input;
  }

  /** JSON の文として読めれば中を仮名化して書き戻す。読めなければ、引用符の中の文字列を置き換える。末尾の改行は保つ。 */
  jsonText(raw: string): string {
    const newline = raw.endsWith('\n') ? '\n' : '';
    const body = newline ? raw.slice(0, -1) : raw;
    try {
      return JSON.stringify(this.value(JSON.parse(body))) + newline;
    } catch {
      if (!/^\s*[[{"]/.test(body)) {
        return (
          body
            .split('\n')
            .map((line) => this.string(line))
            .join('\n') + newline
        );
      }
      return (
        body.replace(/"((?:[^"\\]|\\.)*)"/g, (_m, inner: string) => {
          let decoded: string;
          try {
            decoded = JSON.parse(`"${inner}"`) as string;
          } catch {
            return JSON.stringify(this.text(inner));
          }
          return JSON.stringify(this.string(decoded));
        }) + newline
      );
    }
  }
}

/** 録画を仮名化した写しを返す。元の録画は変えない。 */
export function sanitizeRecording(recording: Recording): Recording {
  const p = new Pseudonymizer();
  if (recording.kind === 'cli') {
    const out: CliRecording = {
      version: 1,
      kind: 'cli',
      entries: recording.entries.map((e) => {
        const entry = {
          ...e,
          argv: e.argv.map((a) => p.string(a)),
          stdout: p.jsonText(e.stdout),
          stderr: p.text(e.stderr),
        };
        if (e.spawnError !== undefined) entry.spawnError = p.string(e.spawnError);
        return entry;
      }),
    };
    return out;
  }
  const out: RpcRecording = {
    version: 1,
    kind: 'rpc',
    exchanges: recording.exchanges.map((e) => {
      const exchange = { ...e, method: p.string(e.method), chunks: e.chunks.map((c) => p.jsonText(c)) };
      if ('params' in e) exchange.params = p.value(e.params);
      return exchange;
    }),
  };
  return out;
}

export class UnsafeRecordingError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`unsafe recording: ${problems.slice(0, 10).join('; ')}${problems.length > 10 ? ' …' : ''}`);
    this.problems = problems;
  }
}

export interface SafetyOptions {
  /** 残っていてはいけない authToken の値。 */
  authToken?: string;
  /** 利用者の家のパス。既定は os.homedir()。 */
  homeDir?: string;
}

/**
 * 録画全体を読み、秘密、家のパス、orca://pair、本文、仮名にしていない文が残っていれば UnsafeRecordingError を投げる。
 * 誤りの文には、見つけた場所だけを書き、値は書かない。
 */
export function assertRecordingSafe(recording: Recording, options: SafetyOptions = {}): void {
  const home = options.homeDir ?? homedir();
  const problems: string[] = [];
  const raw = (where: string, text: string): void => {
    if (options.authToken && text.includes(options.authToken)) problems.push(`${where}: auth token value`);
    if (home && home !== '/' && text.includes(home)) problems.push(`${where}: home directory path`);
    if (text.includes('orca://pair')) problems.push(`${where}: pairing link`);
  };
  const str = (where: string, value: string, key: string): void => {
    if (FREE_TEXT_KEYS.has(key)) {
      if (value !== '' && !/^text-\d+$/.test(value)) problems.push(`${where}: free text in "${key}"`);
      return;
    }
    if (!isSafeString(value)) problems.push(`${where}: string is not pseudonymized`);
  };
  const walk = (where: string, value: unknown, key: string): void => {
    if (typeof value === 'string') str(where, value, key);
    else if (Array.isArray(value)) {
      for (const [i, item] of value.entries()) walk(`${where}[${i}]`, item, key);
    } else if (typeof value === 'object' && value !== null) {
      for (const [k, v] of Object.entries(value)) {
        if (SECRET_KEY.test(k)) problems.push(`${where}: secret field`);
        if (!IDENTIFIER_KEY.test(k) && !isSafeString(k)) problems.push(`${where}: key is not pseudonymized`);
        walk(`${where}.${IDENTIFIER_KEY.test(k) ? k : '<key>'}`, v, k);
      }
    }
  };
  const text = (where: string, body: string): void => {
    raw(where, body);
    for (const [i, line] of body.split('\n').entries()) {
      if (!line.trim()) continue;
      const at = `${where} line ${i + 1}`;
      try {
        walk(at, JSON.parse(line), '');
        continue;
      } catch {
        // JSON として読めない行は、JSON の切れ端なら引用符の中の文字列ごとに、そうでなければ行ごとに見る。
      }
      if (!/^\s*[[{"]/.test(line)) {
        str(at, line.trim(), '');
        continue;
      }
      let lastKey = '';
      for (const m of line.matchAll(/"((?:[^"\\]|\\.)*)("|$)(\s*:)?/g)) {
        const inner = m[1] ?? '';
        if (m[3]) {
          lastKey = inner;
          if (SECRET_KEY.test(inner)) problems.push(`${at}: secret field`);
          continue;
        }
        str(at, inner, lastKey);
        lastKey = '';
      }
    }
  };
  if (recording.kind === 'cli') {
    recording.entries.forEach((e, i) => {
      const where = `entries[${i}]`;
      e.argv.forEach((a, j) => {
        raw(`${where}.argv[${j}]`, a);
        str(`${where}.argv[${j}]`, a, '');
      });
      text(`${where}.stdout`, e.stdout);
      raw(`${where}.stderr`, e.stderr);
      if (e.stderr !== '' && !/^text-\d+$/.test(e.stderr)) problems.push(`${where}.stderr: free text`);
    });
  } else {
    recording.exchanges.forEach((e, i) => {
      const where = `exchanges[${i}]`;
      str(`${where}.method`, e.method, '');
      if ('params' in e) {
        raw(`${where}.params`, JSON.stringify(e.params) ?? '');
        walk(`${where}.params`, e.params, '');
      }
      text(`${where}.chunks`, e.chunks.join(''));
    });
  }
  if (problems.length > 0) throw new UnsafeRecordingError(problems);
}
