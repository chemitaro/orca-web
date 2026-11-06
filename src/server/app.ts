// orca-web の HTTP の入口。状態の API（/api/state）、項目の一覧と選択（/api/fields、/api/settings/fields）、
// 静的な画面（web/）を配る。/api/ の口は Host を selfHosts と完全一致で確かめ（DNS の付け替えへの守り）、
// 読み取りの CORS は許したオリジンにだけ返す。書き込みは同じオリジンの項目の選択の保存だけ。
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import { checkSelection, FIELDS } from '../state/fields.ts';
import type { StateDocument } from '../state/model.ts';
import type { SettingsStore } from '../state/settings.ts';
import { checkSameOriginWrite } from './same-origin-write.ts';

export interface StateSource {
  noteViewer(): void;
  snapshot(): Promise<StateDocument>;
}

export interface AppOptions {
  poller?: StateSource;
  settings?: SettingsStore;
  /** 読み取りの CORS を許す、正確なオリジン。 */
  readOrigins?: readonly string[];
  /** 受ける Host（`<名前>:<ポート>`）の追加。既定は、待ち受けのポートの `127.0.0.1` と `localhost`。 */
  extraHosts?: readonly string[];
  /** 画面のファイルの置き場。既定はリポジトリの web/。 */
  webDir?: string;
}

const DEFAULT_WEB_DIR = path.resolve(import.meta.dirname, '..', '..', 'web');
const MAX_BODY_BYTES = 64 * 1024;
const READ_ROUTES = new Set(['/api/state', '/api/fields']);

const STATIC_FILES: Readonly<Record<string, { file: string; type: string }>> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/main.js': { file: 'main.js', type: 'text/javascript; charset=utf-8' },
  '/view.js': { file: 'view.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
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

/** 本文を上限まで読む。超えたら null。 */
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) over = true;
      else chunks.push(chunk);
    });
    req.on('end', () => resolve(over ? null : Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createAppServer(options: AppOptions = {}): Server {
  const readOrigins = new Set(options.readOrigins ?? []);
  const webDir = options.webDir ?? DEFAULT_WEB_DIR;

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

  async function handle(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const method = req.method ?? 'GET';
    if (pathname.startsWith('/api/')) {
      if (!selfHosts(req).has(req.headers.host ?? '')) {
        sendError(res, 421, 'misdirected_host');
        return;
      }
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
      if (pathname === '/api/settings/fields') {
        if (method !== 'PUT') {
          sendError(res, 405, 'method_not_allowed');
          return;
        }
        const check = checkSameOriginWrite(req);
        if (!check.ok) {
          sendError(res, check.status, check.error);
          return;
        }
        if (!options.settings) {
          sendError(res, 503, 'settings_unavailable');
          return;
        }
        const raw = await readBody(req);
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
        const selection =
          typeof body === 'object' && body !== null && !Array.isArray(body)
            ? checkSelection((body as Record<string, unknown>).selected)
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
    if (asset.type.startsWith('text/html')) {
      headers['content-security-policy'] = "default-src 'self'; base-uri 'none'; form-action 'self'";
    }
    res.writeHead(200, headers);
    res.end(method === 'HEAD' ? undefined : content);
  }

  return createServer((req, res) => {
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
  });
}
