// 書き込みの守り。ブラウザー由来の偽の要求（DNS rebinding、別のオリジンからの CSRF）を、Orca に何も送る前に止める。
// 同じ Mac の悪意あるプロセスへの認証の境界ではない（その前提は epic-00003 の設計にある）。
import { randomBytes } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { inspect } from 'node:util';
import type { AppConfig } from './config.ts';

export interface RequestLike {
  method?: string | undefined;
  headers: IncomingHttpHeaders;
}

export type GuardResult = { ok: true } | { ok: false; status: number; error: string };

const OK: GuardResult = { ok: true };
const reject = (status: number, error: string): GuardResult => ({ ok: false, status, error });

export const TOKEN_HEADER = 'x-orca-web-token';

/** Host の見出しが、許す Host（`<アドレス>:<port>`）のどれかと完全一致するか。すべての要求に当てる。 */
export function checkHost(req: RequestLike, config: Pick<AppConfig, 'allowedHosts'>): GuardResult {
  const host = req.headers.host;
  return typeof host === 'string' && config.allowedHosts.includes(host) ? OK : reject(403, 'host_rejected');
}

function mediaType(value: string | undefined): string {
  return (value ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/**
 * 同じオリジンからの JSON の POST か。Origin は要求の Host の orca-web 自身のオリジン（`http://<Host>`）と完全一致を求める。
 * checkHost を通った後に呼ぶ。
 */
export function checkSameOriginPost(req: RequestLike, config: Pick<AppConfig, 'allowedHosts'>): GuardResult {
  if (req.method !== 'POST') return reject(405, 'method_not_allowed');
  if (mediaType(req.headers['content-type']) !== 'application/json') return reject(415, 'unsupported_media_type');
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (typeof host !== 'string' || !config.allowedHosts.includes(host) || origin !== `http://${host}`) {
    return reject(403, 'origin_rejected');
  }
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin') return reject(403, 'origin_rejected');
  return OK;
}

export interface TokenStoreOptions {
  ttlMs?: number;
  max?: number;
  now?: () => number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_TOKENS = 64;

/** 短期のトークン。メモリーにだけ持ち、値を inspect や JSON に出さない。 */
export class TokenStore {
  readonly #ttlMs: number;
  readonly #max: number;
  readonly #now: () => number;
  /** トークン → 期限（ミリ秒）。挿入の順が古い順。 */
  readonly #tokens = new Map<string, number>();

  constructor(options: TokenStoreOptions = {}) {
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.#max = options.max ?? DEFAULT_MAX_TOKENS;
    this.#now = options.now ?? Date.now;
  }

  issue(): { token: string; expiresAt: string } {
    const now = this.#now();
    for (const [token, expires] of this.#tokens) if (expires <= now) this.#tokens.delete(token);
    while (this.#tokens.size >= this.#max) {
      const oldest = this.#tokens.keys().next().value;
      if (oldest === undefined) break;
      this.#tokens.delete(oldest);
    }
    const token = randomBytes(32).toString('base64url');
    const expires = now + this.#ttlMs;
    this.#tokens.set(token, expires);
    return { token, expiresAt: new Date(expires).toISOString() };
  }

  verify(token: string | undefined): boolean {
    if (token === undefined) return false;
    const expires = this.#tokens.get(token);
    if (expires === undefined) return false;
    if (expires <= this.#now()) {
      this.#tokens.delete(token);
      return false;
    }
    return true;
  }

  toJSON(): { tokens: number } {
    return { tokens: this.#tokens.size };
  }

  toString(): string {
    return `TokenStore(${this.#tokens.size})`;
  }

  [inspect.custom](): string {
    return this.toString();
  }
}

/** 独自ヘッダーのトークンを確かめる。 */
export function checkToken(req: RequestLike, store: TokenStore): GuardResult {
  const value = req.headers[TOKEN_HEADER];
  if (value === undefined) return reject(401, 'token_missing');
  return typeof value === 'string' && store.verify(value) ? OK : reject(401, 'token_invalid');
}
