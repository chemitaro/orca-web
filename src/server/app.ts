// orca-web の HTTP の入口。状態の API（/api/state）、項目の一覧と選択（/api/fields、/api/settings/fields）、
// 「Orca で開く」（/api/token、/api/open、/embed/*）、静的な画面（web/）を配る。
// すべての要求で Host を selfHosts と完全一致で確かめる（DNS の付け替えへの守り）。読み取りの CORS は許したオリジンにだけ返す。
// 書き込み（項目の選択の保存と開く口）は、同じオリジンの JSON と、/api/token が出した短期のトークンを要する。書き込みに CORS は付けない。
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import type { OpenErrorCode, OpenOutcome, OpenRequest } from '../orca/open.ts';
import { checkSelection, FIELDS } from '../state/fields.ts';
import type { StateDocument } from '../state/model.ts';
import type { SettingsStore } from '../state/settings.ts';
import { checkHost, checkSameOriginWrite, checkToken, type GuardResult, TokenStore } from './guard.ts';

export interface StateSource {
  noteViewer(): void;
  snapshot(): Promise<StateDocument>;
}

export interface AppOptions {
  poller?: StateSource;
  settings?: SettingsStore;
  /** 開く処理。main.ts が OpenService を渡し、テストは偽の処理を渡す。 */
  open?: (request: OpenRequest) => Promise<OpenOutcome>;
  /** 書き込みの短期のトークン。待ち受けのアドレスごとのサーバーで共有する。 */
  tokens?: TokenStore;
  /** SpecDock の正確なオリジン。読み取りの CORS と、画面の frame-ancestors に使う。 */
  readOrigins?: readonly string[];
  /** 受ける Host（`<名前>:<ポート>`）の追加。既定は、待ち受けのポートの `127.0.0.1` と `localhost`。 */
  extraHosts?: readonly string[];
  /** 画面のファイルの置き場。既定はリポジトリの web/。 */
  webDir?: string;
}

const DEFAULT_WEB_DIR = path.resolve(import.meta.dirname, '..', '..', 'web');
const MAX_SETTINGS_BODY_BYTES = 64 * 1024;
const MAX_OPEN_BODY_BYTES = 4 * 1024;
const MAX_WORKTREE_CHARS = 4096;
const MAX_AGENT_CHARS = 512;
const READ_ROUTES = new Set(['/api/state', '/api/fields']);

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

/** 配るファイル（道 → web/ の中の固定のファイルと型）。利用者のパスを受けない。page は CSP を付ける画面。 */
const STATIC_FILES: Readonly<Record<string, { file: string; type: string; page?: 'index' | 'embed' }>> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8', page: 'index' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8', page: 'index' },
  '/main.js': { file: 'main.js', type: 'text/javascript; charset=utf-8' },
  '/view.js': { file: 'view.js', type: 'text/javascript; charset=utf-8' },
  '/write.js': { file: 'write.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
  '/embed/open-button': { file: 'embed/open-button.html', type: 'text/html; charset=utf-8', page: 'embed' },
  '/embed/open-button.js': { file: 'embed/open-button.js', type: 'text/javascript; charset=utf-8' },
  '/embed/open-button-frame.js': { file: 'embed/open-button-frame.js', type: 'text/javascript; charset=utf-8' },
  '/embed/open-button.css': { file: 'embed/open-button.css', type: 'text/css; charset=utf-8' },
};

type Headers = Record<string, string>;

function baseHeaders(extra: Headers = {}): Headers {
  return { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra };
}

function sendJson(res: ServerResponse, status: number, body: unknown, extra: Headers = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(
    status,
    baseHeaders({
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(Buffer.byteLength(payload)),
      ...extra,
    }),
  );
  res.end(payload);
}

const sendError = (res: ServerResponse, status: number, error: string, extra: Headers = {}): void =>
  sendJson(res, status, { ok: false, error }, extra);

const sendRejection = (res: ServerResponse, result: Exclude<GuardResult, { ok: true }>): void =>
  sendError(res, result.status, result.error);

/** 本文を上限まで読む。超えたら null（残りは読み捨てる）。 */
function readBody(req: IncomingMessage, maxBytes: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) over = true;
      else chunks.push(chunk);
    });
    req.on('end', () => resolve(over ? null : Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
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

/** 画面の CSP。埋め込みは SpecDock のオリジンだけに許す（なければ 'none'）。inline の script と style は許さない。 */
function pagePolicy(page: 'index' | 'embed', frameAncestors: string): string {
  const common = ["base-uri 'none'", `frame-ancestors ${frameAncestors}`];
  if (page === 'index') return ["default-src 'self'", "form-action 'self'", ...common].join('; ');
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "connect-src 'self'",
    "form-action 'none'",
    ...common,
  ].join('; ');
}

export function createAppHandler(options: AppOptions = {}): (req: IncomingMessage, res: ServerResponse) => void {
  const readOrigins = new Set(options.readOrigins ?? []);
  const frameAncestors = readOrigins.size > 0 ? [...readOrigins].join(' ') : "'none'";
  const webDir = options.webDir ?? DEFAULT_WEB_DIR;
  const tokens = options.tokens ?? new TokenStore();

  const selfHosts = (req: IncomingMessage): Set<string> => {
    const port = req.socket.localPort;
    return new Set([`127.0.0.1:${port}`, `localhost:${port}`, ...(options.extraHosts ?? [])]);
  };

  /** 読み取りの CORS。通すなら付ける見出し、拒むなら null。 */
  const readAccess = (req: IncomingMessage): Headers | null => {
    const origin = req.headers.origin;
    const vary = { vary: 'Origin' };
    if (origin === undefined || origin === `http://${req.headers.host}`) return vary;
    if (readOrigins.has(origin)) return { ...vary, 'access-control-allow-origin': origin };
    return null;
  };

  /** 書き込みの守り（同じオリジンの JSON とトークン）。通らなければ応答を送って false。 */
  const guardWrite = (req: IncomingMessage, res: ServerResponse, method: 'POST' | 'PUT'): boolean => {
    const same = checkSameOriginWrite(req, method);
    if (!same.ok) {
      sendRejection(res, same);
      return false;
    }
    const token = checkToken(req, tokens);
    if (!token.ok) {
      sendRejection(res, token);
      return false;
    }
    return true;
  };

  async function handleSettings(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!guardWrite(req, res, 'PUT')) return;
    if (!options.settings) {
      sendError(res, 503, 'settings_unavailable');
      return;
    }
    const raw = await readBody(req, MAX_SETTINGS_BODY_BYTES);
    if (raw === null) {
      sendError(res, 400, 'body_too_large');
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      sendError(res, 400, 'invalid_json');
      return;
    }
    const selection = isRecord(body)
      ? checkSelection(body.selected)
      : ({ ok: false, message: 'body must be an object with selected' } as const);
    if (!selection.ok) {
      sendJson(res, 400, { ok: false, error: 'invalid_selection', message: selection.message });
      return;
    }
    try {
      await options.settings.saveSelected(selection.selected);
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'cannot save settings');
      return;
    }
    sendJson(res, 200, { ok: true, selected: options.settings.selected, settings: options.settings.info });
  }

  async function handleOpen(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!guardWrite(req, res, 'POST')) return;
    const raw = await readBody(req, MAX_OPEN_BODY_BYTES);
    if (raw === null) {
      sendError(res, 413, 'payload_too_large');
      return;
    }
    const request = parseOpenRequest(raw);
    if (!request) {
      sendError(res, 400, 'invalid_request');
      return;
    }
    if (!options.open) {
      sendError(res, 503, 'open_unavailable');
      return;
    }
    const outcome = await options.open(request);
    sendJson(res, outcome.ok ? 200 : (OPEN_ERROR_STATUS[outcome.error] ?? 502), outcome);
  }

  async function handle(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const method = req.method ?? 'GET';
    const host = checkHost(req, selfHosts(req));
    if (!host.ok) {
      sendRejection(res, host);
      return;
    }
    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/health') {
        if (method !== 'GET') sendError(res, 405, 'method_not_allowed');
        else sendJson(res, 200, { ok: true });
        return;
      }
      if (READ_ROUTES.has(pathname)) {
        const access = readAccess(req);
        if (!access) {
          sendError(res, 403, 'forbidden_origin', { vary: 'Origin' });
          return;
        }
        if (method === 'OPTIONS') {
          res.writeHead(
            204,
            baseHeaders({ ...access, 'access-control-allow-methods': 'GET', 'access-control-max-age': '600' }),
          );
          res.end();
          return;
        }
        if (method !== 'GET') {
          sendError(res, 405, 'method_not_allowed', access);
          return;
        }
        if (pathname === '/api/state') {
          if (!options.poller) {
            sendError(res, 503, 'state_unavailable', access);
            return;
          }
          options.poller.noteViewer();
          sendJson(res, 200, await options.poller.snapshot(), access);
          return;
        }
        if (!options.settings) {
          sendError(res, 503, 'settings_unavailable', access);
          return;
        }
        sendJson(
          res,
          200,
          { fields: FIELDS, selected: options.settings.selected, settings: options.settings.info },
          access,
        );
        return;
      }
      if (pathname === '/api/token') {
        const same = checkSameOriginWrite(req, 'POST');
        if (!same.ok) {
          sendRejection(res, same);
          return;
        }
        await readBody(req, MAX_OPEN_BODY_BYTES);
        sendJson(res, 200, { ok: true, ...tokens.issue() });
        return;
      }
      if (pathname === '/api/settings/fields') {
        await handleSettings(req, res);
        return;
      }
      if (pathname === '/api/open') {
        await handleOpen(req, res);
        return;
      }
      sendError(res, 404, 'not_found');
      return;
    }

    const asset = Object.hasOwn(STATIC_FILES, pathname) ? STATIC_FILES[pathname] : undefined;
    if (!asset) {
      sendError(res, 404, 'not_found');
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') {
      sendError(res, 405, 'method_not_allowed');
      return;
    }
    const content = await readFile(path.join(webDir, asset.file));
    const headers = baseHeaders({ 'content-type': asset.type, 'content-length': String(content.length) });
    if (asset.page) {
      headers['content-security-policy'] = pagePolicy(asset.page, frameAncestors);
      // no-referrer だと、Fetch の仕様では同じオリジンの POST の Origin が null になりうる（守りが拒む）。
      headers['referrer-policy'] = 'same-origin';
    }
    res.writeHead(200, headers);
    res.end(method === 'HEAD' ? undefined : content);
  }

  return (req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      sendError(res, 400, 'bad_request');
      return;
    }
    handle(req, res, url.pathname).catch(() => {
      if (!res.headersSent) sendError(res, 500, 'internal_error');
      else res.destroy();
    });
  };
}

export function createAppServer(options: AppOptions = {}): Server {
  return createServer(createAppHandler(options));
}
