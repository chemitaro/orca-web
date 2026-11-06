// orca-web の HTTP の入口。すべての要求で Host を確かめてから、道の表で振り分ける。
// 書き込み（/api/open）は、同じオリジンの JSON の POST と、/api/token が出した短期のトークンを要する。CORS の許可は付けない。
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OpenErrorCode, OpenOutcome, OpenRequest } from '../orca/open.ts';
import type { AppConfig } from './config.ts';
import { checkHost, checkSameOriginPost, checkToken, type GuardResult, TokenStore } from './guard.ts';

export interface AppOptions {
  config: AppConfig;
  /** 開く処理。main.ts が OpenService を渡し、テストは偽の処理を渡す。 */
  open: (request: OpenRequest) => Promise<OpenOutcome>;
  tokens?: TokenStore;
  /** 画面のファイルの置き場。既定はリポジトリの web/。 */
  webRoot?: string;
}

const DEFAULT_WEB_ROOT = fileURLToPath(new URL('../../web/', import.meta.url));
const MAX_BODY_BYTES = 4 * 1024;
const MAX_WORKTREE_CHARS = 4096;
const MAX_AGENT_CHARS = 512;

/** 開く処理の誤りの種類ごとの HTTP の状態。 */
export const OPEN_ERROR_STATUS: Record<OpenErrorCode, number> = {
  busy: 409,
  target_gone: 409,
  worktree_not_found: 404,
  unavailable: 503,
  runtime_changed: 503,
  unsupported: 501,
  orca_error: 502,
  unknown_shape: 502,
  unconfirmed: 504,
};

/** 部品のファイル（道 → web/ の中の固定のファイルと型）。利用者のパスを受けない。 */
const EMBED_FILES: Record<string, { file: string; type: string; page?: true }> = {
  '/embed/open-button': { file: 'embed/open-button.html', type: 'text/html; charset=utf-8', page: true },
  '/embed/open-button.js': { file: 'embed/open-button.js', type: 'text/javascript; charset=utf-8' },
  '/embed/open-button-frame.js': { file: 'embed/open-button-frame.js', type: 'text/javascript; charset=utf-8' },
  '/embed/open-button.css': { file: 'embed/open-button.css', type: 'text/css; charset=utf-8' },
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(payload);
}

function sendRejection(res: ServerResponse, result: Exclude<GuardResult, { ok: true }>): void {
  sendJson(res, result.status, { ok: false, error: result.error });
}

class BodyError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** 物を上限まで読む。超えたら読むのをやめて 413。 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        done = true;
        req.resume();
        reject(new BodyError(413, 'payload_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', () => {
      if (done) return;
      done = true;
      reject(new BodyError(400, 'invalid_request'));
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isBoundedText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

/** `{ worktree, agent? }` だけを受ける。 */
function parseOpenRequest(text: string): OpenRequest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || Object.keys(parsed).some((k) => k !== 'worktree' && k !== 'agent')) return null;
  if (!isBoundedText(parsed.worktree, MAX_WORKTREE_CHARS)) return null;
  if (parsed.agent === undefined) return { worktree: parsed.worktree };
  if (!isBoundedText(parsed.agent, MAX_AGENT_CHARS)) return null;
  return { worktree: parsed.worktree, agent: parsed.agent };
}

function embedHeaders(config: AppConfig, type: string, page: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
  if (page) {
    headers['content-security-policy'] = [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      `frame-ancestors ${config.specdockOrigins.join(' ')}`,
    ].join('; ');
  }
  return headers;
}

export function createAppHandler(options: AppOptions): (req: IncomingMessage, res: ServerResponse) => void {
  const { config, open } = options;
  const tokens = options.tokens ?? new TokenStore();
  const webRoot = options.webRoot ?? DEFAULT_WEB_ROOT;

  const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void> | void> = {
    '/api/health': (req, res) => {
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      sendJson(res, 200, { ok: true });
    },
    '/api/token': async (req, res) => {
      const same = checkSameOriginPost(req, config);
      if (!same.ok) return sendRejection(res, same);
      await readBody(req);
      sendJson(res, 200, { ok: true, ...tokens.issue() });
    },
    '/api/open': async (req, res) => {
      const same = checkSameOriginPost(req, config);
      if (!same.ok) return sendRejection(res, same);
      const token = checkToken(req, tokens);
      if (!token.ok) return sendRejection(res, token);
      const request = parseOpenRequest(await readBody(req));
      if (!request) return sendJson(res, 400, { ok: false, error: 'invalid_request' });
      const outcome = await open(request);
      sendJson(res, outcome.ok ? 200 : (OPEN_ERROR_STATUS[outcome.error] ?? 502), outcome);
    },
  };
  for (const [route, embed] of Object.entries(EMBED_FILES)) {
    routes[route] = async (req, res) => {
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      const body = await readFile(path.join(webRoot, embed.file));
      res.writeHead(200, { ...embedHeaders(config, embed.type, embed.page === true), 'content-length': body.length });
      res.end(body);
    };
  }

  return (req, res) => {
    const host = checkHost(req, config);
    if (!host.ok) return sendRejection(res, host);
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      sendJson(res, 400, { ok: false, error: 'bad_request' });
      return;
    }
    const route = Object.hasOwn(routes, url.pathname) ? routes[url.pathname] : undefined;
    if (!route) {
      sendJson(res, 404, { ok: false, error: 'not_found' });
      return;
    }
    Promise.resolve()
      .then(() => route(req, res))
      .catch((error: unknown) => {
        if (res.headersSent) {
          res.destroy();
          return;
        }
        if (error instanceof BodyError) sendJson(res, error.status, { ok: false, error: error.code });
        else sendJson(res, 500, { ok: false, error: 'internal_error' });
      });
  };
}

export function createAppServer(options: AppOptions): Server {
  return createServer(createAppHandler(options));
}
