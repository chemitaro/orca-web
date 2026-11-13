// orca-web の HTTP の入口。状態の API（/api/state）、項目の一覧と選択（/api/fields、/api/settings/fields）、
// 「Orca で開く」（/api/token、/api/open、/embed/*）、静的な画面（web/）を配る。
// すべての要求で Host を selfHosts と完全一致で確かめる（DNS の付け替えへの守り）。読み取りの CORS は許したオリジンにだけ返す。
// 書き込み（項目の選択の保存と開く口）は、同じオリジンの JSON と、/api/token が出した短期のトークンを要する。書き込みに CORS は付けない。
// 会話の API（/api/transcript、/api/transcript/events）は同じオリジンだけに読ませ、CORS を付けない（画面は orca-web のオリジンの iframe の中から読む）。
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import { buildInbox } from '../inbox/classify.ts';
import type { InboxInputs } from '../inbox/model.ts';
import type { OpenErrorCode, OpenOutcome, OpenRequest } from '../orca/open.ts';
import type { TranscriptErrorCode, TranscriptReader } from '../orca/read-transcript.ts';
import { buildRunList, buildRunTree } from '../runs/tree.ts';
import type { SendFailure, SendService } from '../send/service.ts';
import { checkSelection, FIELDS } from '../state/fields.ts';
import type { StateDocument } from '../state/model.ts';
import type { SettingsStore } from '../state/settings.ts';
import { buildWorktreeSummary } from '../summary/build.ts';
import type { HubErrorCode, TranscriptEvent, TranscriptHub } from '../transcript/hub.ts';
import { buildDocument, decodeBefore, normalizePage } from '../transcript/normalize.ts';
import { checkHost, checkSameOriginWrite, checkToken, type GuardResult, TokenStore } from './guard.ts';
import type { ListenerStatus } from './listen.ts';

export interface StateSource {
  noteViewer(): void;
  snapshot(): Promise<StateDocument>;
}

export interface AppOptions {
  send?: Pick<SendService, 'status' | 'intent' | 'confirm' | 'check'>;
  /** 守りの拒否件数だけを出す。本文・票・操作IDは含めない。 */
  sendGuard?: { now?: () => number; log?: (counts: Record<string, number>) => void };
  poller?: StateSource;
  runs?: StateSource;
  inbox?: { snapshot(): Promise<InboxInputs>; noteViewer(): void };
  stallMinutes?: number;
  settings?: SettingsStore;
  /** 開く処理。main.ts が OpenService を渡し、テストは偽の処理を渡す。 */
  open?: (request: OpenRequest) => Promise<OpenOutcome>;
  /** 書き込みの短期のトークン。待ち受けのアドレスごとのサーバーで共有する。 */
  tokens?: TokenStore;
  /** SpecDock の正確なオリジン。読み取りの CORS と、画面の frame-ancestors に使う。 */
  readOrigins?: readonly string[];
  /** 受ける Host（`<名前>:<ポート>`）の追加。既定は、待ち受けのポートの `127.0.0.1` と `localhost`。 */
  extraHosts?: readonly string[];
  /**
   * `/api/health` の中身（プロセスの pid と、待ち受けのアドレスごとの状態）。main.ts が渡す。
   * service:install は、この pid を launchd のサービスの pid と照らす（同じポートの別のプロセスを成功と見なさない）。
   */
  health?: () => { pid: number; listeners: readonly ListenerStatus[] };
  /** 会話の読み手と共有の見張り。main.ts が組み立てて渡す。 */
  transcripts?: { reader: TranscriptReader; hub: TranscriptHub };
  /** 画面のファイルの置き場。既定はリポジトリの web/。 */
  webDir?: string;
}

const SEND_ERROR_STATUS: Record<SendFailure['error'], number> = {
  invalid_text: 400,
  send_disabled: 403,
  agent_not_found: 404,
  not_sendable: 409,
  target_changed: 409,
  ticket_invalid: 409,
  busy: 409,
  unsupported: 501,
  unknown_shape: 502,
  unreachable: 503,
  record_failed: 503,
};

const DEFAULT_WEB_DIR = path.resolve(import.meta.dirname, '..', '..', 'web');
const MAX_SETTINGS_BODY_BYTES = 64 * 1024;
const MAX_OPEN_BODY_BYTES = 4 * 1024;
const MAX_WORKTREE_CHARS = 4096;
const MAX_AGENT_CHARS = 512;
const READ_ROUTES = new Set(['/api/state', '/api/fields', '/api/worktrees/summary']);
const TRANSCRIPT_ROUTES = new Set(['/api/transcript', '/api/transcript/events']);
const DEFAULT_TRANSCRIPT_LIMIT = 40;
const MAX_TRANSCRIPT_LIMIT = 200;
const SSE_KEEPALIVE_MS = 15_000;

/** 会話の API の誤りの種類。 */
export type TranscriptApiError =
  | TranscriptErrorCode
  | HubErrorCode
  | 'invalid_request'
  | 'session_changed'
  | 'transcript_unavailable';

/** 会話の API の誤りの種類ごとの HTTP の状態。 */
export const TRANSCRIPT_ERROR_STATUS: Record<TranscriptApiError, number> = {
  invalid_request: 400,
  agent_not_found: 404,
  no_session: 404,
  transcript_not_found: 404,
  session_changed: 409,
  unsupported: 501,
  read_failed: 502,
  unknown_shape: 502,
  unreachable: 503,
  busy: 503,
  transcript_unavailable: 503,
};

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
  '/inbox.js': { file: 'inbox.js', type: 'text/javascript; charset=utf-8' },
  '/inbox-view.js': { file: 'inbox-view.js', type: 'text/javascript; charset=utf-8' },
  '/inbox-dom.js': { file: 'inbox-dom.js', type: 'text/javascript; charset=utf-8' },
  '/runs': { file: 'runs.html', type: 'text/html; charset=utf-8', page: 'index' },
  '/runs.js': { file: 'runs.js', type: 'text/javascript; charset=utf-8' },
  '/run.js': { file: 'run.js', type: 'text/javascript; charset=utf-8' },
  '/project.js': { file: 'project.js', type: 'text/javascript; charset=utf-8' },
  '/runs-view.js': { file: 'runs-view.js', type: 'text/javascript; charset=utf-8' },
  '/runs-dom.js': { file: 'runs-dom.js', type: 'text/javascript; charset=utf-8' },
  '/poll-loop.js': { file: 'poll-loop.js', type: 'text/javascript; charset=utf-8' },
  '/settings': { file: 'settings.html', type: 'text/html; charset=utf-8', page: 'index' },
  '/main.js': { file: 'main.js', type: 'text/javascript; charset=utf-8' },
  '/view.js': { file: 'view.js', type: 'text/javascript; charset=utf-8' },
  '/write.js': { file: 'write.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
  '/embed/open-button': { file: 'embed/open-button.html', type: 'text/html; charset=utf-8', page: 'embed' },
  '/embed/open-button.js': { file: 'embed/open-button.js', type: 'text/javascript; charset=utf-8' },
  '/embed/open-button-frame.js': { file: 'embed/open-button-frame.js', type: 'text/javascript; charset=utf-8' },
  '/embed/open-button.css': { file: 'embed/open-button.css', type: 'text/css; charset=utf-8' },
  '/embed/agent': { file: 'embed/agent.html', type: 'text/html; charset=utf-8', page: 'embed' },
  '/embed/agent-frame.js': { file: 'embed/agent-frame.js', type: 'text/javascript; charset=utf-8' },
  '/embed/agent-view.js': { file: 'embed/agent-view.js', type: 'text/javascript; charset=utf-8' },
  '/embed/agent-dom.js': { file: 'embed/agent-dom.js', type: 'text/javascript; charset=utf-8' },
  '/embed/send-view.js': { file: 'embed/send-view.js', type: 'text/javascript; charset=utf-8' },
  '/embed/send-dom.js': { file: 'embed/send-dom.js', type: 'text/javascript; charset=utf-8' },
  '/embed/agent.css': { file: 'embed/agent.css', type: 'text/css; charset=utf-8' },
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

  let rejectedCounts: Record<string, number> = {};
  let lastRejectionLog = -Infinity;

  async function handleSend(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const service = options.send;
    const pathname = url.pathname;
    const writing = pathname === '/api/send/intent' || pathname === '/api/send/confirm';
    const reject = (status: number, error: string): void => {
      sendError(res, status, error);
      if (![401, 403, 405, 413, 415].includes(status)) return;
      const route = writing || pathname === '/api/send/status' ? pathname : '/api/send/:operationId';
      const key = `${route}:${error}`;
      rejectedCounts[key] = (rejectedCounts[key] ?? 0) + 1;
      const now = (options.sendGuard?.now ?? Date.now)();
      if (now - lastRejectionLog >= 60_000) {
        (options.sendGuard?.log ?? ((counts) => console.log(JSON.stringify(counts))))({ ...rejectedCounts });
        rejectedCounts = {};
        lastRejectionLog = now;
      }
    };
    if (writing) {
      const same = checkSameOriginWrite(req, 'POST');
      if (!same.ok) return reject(same.status, same.error);
      const token = checkToken(req, tokens);
      if (!token.ok) return reject(token.status, token.error);
    }
    if (!writing) {
      if (req.method !== 'GET') return reject(405, 'method_not_allowed');
      const site = req.headers['sec-fetch-site'];
      if (
        (req.headers.origin !== undefined && req.headers.origin !== `http://${req.headers.host}`) ||
        (site !== undefined && site !== 'same-origin' && site !== 'none')
      )
        return reject(403, 'forbidden_origin');
    }
    if (!service) return sendError(res, 503, 'unreachable');
    if (writing) {
      const raw = await readBody(req, 128 * 1024);
      if (raw === null) return reject(413, 'payload_too_large');
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return sendError(res, 400, 'invalid_request');
      }
      const key = pathname === '/api/send/intent' ? 'agent' : 'ticket';
      if (
        !isRecord(body) ||
        Object.keys(body).some((k) => k !== key && k !== 'text') ||
        !isBoundedText(body[key], key === 'agent' ? MAX_AGENT_CHARS : 128 * 1024) ||
        typeof body.text !== 'string'
      )
        return sendError(res, 400, 'invalid_request');
      const answer =
        key === 'agent'
          ? await service.intent({ agent: body[key] as string, text: body.text })
          : await service.confirm({ ticket: body[key] as string, text: body.text });
      if (!answer.ok) return sendJson(res, SEND_ERROR_STATUS[answer.error], answer);
      const { ok: _ok, ...result } = answer;
      return sendJson(res, 200, result);
    }
    if (pathname === '/api/send/status') {
      const agent = agentParam(url);
      if (!agent) return sendError(res, 400, 'invalid_request');
      return sendJson(res, 200, await service.status(agent));
    }
    const operationId = pathname.slice('/api/send/'.length);
    if (!/^\d{13}-[a-f0-9]{32}$/.test(operationId)) return sendError(res, 400, 'invalid_request');
    const answer = await service.check(operationId, { query: url.searchParams.get('check') === '1' });
    if (!answer.ok) return sendJson(res, SEND_ERROR_STATUS[answer.error], answer);
    const { ok: _ok, ...result } = answer;
    sendJson(res, 200, result);
  }

  /** `?agent=` の値。なければ null。 */
  const agentParam = (url: URL): string | null => {
    const agent = url.searchParams.get('agent');
    return agent !== null && isBoundedText(agent, MAX_AGENT_CHARS) ? agent : null;
  };

  async function handleTranscript(res: ServerResponse, url: URL): Promise<void> {
    const t = options.transcripts;
    const fail = (error: TranscriptApiError): void => sendError(res, TRANSCRIPT_ERROR_STATUS[error], error);
    if (!t) return fail('transcript_unavailable');
    const agent = agentParam(url);
    const limitText = url.searchParams.get('limit');
    const limit = limitText === null ? DEFAULT_TRANSCRIPT_LIMIT : Number(limitText);
    const beforeText = url.searchParams.get('before');
    const before = beforeText === null ? null : decodeBefore(beforeText);
    if (
      agent === null ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_TRANSCRIPT_LIMIT ||
      (beforeText !== null && before === null)
    ) {
      return fail('invalid_request');
    }
    const resolved = await t.reader.resolve(agent);
    if (!resolved.ok) return fail(resolved.error);
    const target = resolved.target;
    // 前のページは、要求の位置のセッションの鍵が今のセッションと同じときだけ読む（別の会話を混ぜない）。
    if (before && before.key !== target.key) return fail('session_changed');
    const read = await t.reader.read(target, before ? { limit, before: before.position } : { limit });
    if (!read.ok) return fail(read.error);
    const messages = normalizePage(read.page);
    if (!messages) return fail('unknown_shape');
    sendJson(res, 200, buildDocument(target, read.page, messages, new Date()));
  }

  function handleTranscriptEvents(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const t = options.transcripts;
    const agent = agentParam(url);
    if (!t || agent === null) {
      sendError(res, t ? 400 : 503, t ? 'invalid_request' : 'transcript_unavailable');
      return;
    }
    res.writeHead(200, baseHeaders({ 'content-type': 'text/event-stream; charset=utf-8', connection: 'keep-alive' }));
    res.write('retry: 5000\n\n');
    const write = (event: TranscriptEvent): void => {
      const { type, ...data } = event;
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const subscription = t.hub.subscribe(agent, write);
    if (!subscription.ok) {
      write({ type: 'unavailable', error: subscription.error });
      res.end();
      return;
    }
    const keepalive = setInterval(() => res.write(': keepalive\n\n'), SSE_KEEPALIVE_MS);
    keepalive.unref();
    const stop = (): void => {
      clearInterval(keepalive);
      subscription.unsubscribe();
    };
    req.on('close', stop);
    res.on('close', stop);
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const pathname = url.pathname;
    const method = req.method ?? 'GET';
    const runTreeRoute = /^\/api\/runs\/(.*)\/tree$/.exec(pathname);
    const host = checkHost(req, selfHosts(req));
    if (!host.ok) {
      sendRejection(res, host);
      return;
    }
    if (pathname.startsWith('/api/send/')) return handleSend(req, res, url);
    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/health') {
        if (method !== 'GET') sendError(res, 405, 'method_not_allowed');
        else sendJson(res, 200, options.health ? { ok: true, ...options.health() } : { ok: true });
        return;
      }
      if (
        TRANSCRIPT_ROUTES.has(pathname) ||
        pathname === '/api/inbox' ||
        pathname === '/api/runs' ||
        runTreeRoute !== null
      ) {
        // 同じオリジンだけ（Origin がないか、自分のオリジン）。CORS を付けない。
        const origin = req.headers.origin;
        if (origin !== undefined && origin !== `http://${req.headers.host}`) {
          sendError(res, 403, 'forbidden_origin');
          return;
        }
        if (method !== 'GET') {
          sendError(res, 405, 'method_not_allowed');
          return;
        }
        if (runTreeRoute !== null) {
          let id: string;
          try {
            id = decodeURIComponent(runTreeRoute[1] ?? '');
          } catch {
            sendError(res, 400, 'invalid_request');
            return;
          }
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
            sendError(res, 400, 'invalid_request');
            return;
          }
          if (!options.runs) {
            sendError(res, 503, 'runs_unavailable');
            return;
          }
          options.runs.noteViewer();
          const document = buildRunTree(await options.runs.snapshot(), id);
          if (document === null) sendError(res, 404, 'not_found');
          else sendJson(res, 200, document);
        } else if (pathname === '/api/runs') {
          const project = url.searchParams.get('project');
          if (project !== null && project.length > 512) {
            sendError(res, 400, 'invalid_request');
            return;
          }
          if (!options.runs) {
            sendError(res, 503, 'runs_unavailable');
            return;
          }
          options.runs.noteViewer();
          sendJson(res, 200, buildRunList(await options.runs.snapshot(), project));
        } else if (pathname === '/api/inbox') {
          const project = url.searchParams.get('project');
          if (project !== null && project.length > 512) {
            sendError(res, 400, 'invalid_request');
            return;
          }
          if (!options.inbox) {
            sendError(res, 503, 'inbox_unavailable');
            return;
          }
          options.inbox.noteViewer();
          const inputs = await options.inbox.snapshot();
          sendJson(
            res,
            200,
            buildInbox({ ...inputs, now: Date.now(), stallMs: (options.stallMinutes ?? 30) * 60_000, project }),
          );
        } else if (pathname === '/api/transcript') await handleTranscript(res, url);
        else handleTranscriptEvents(req, res, url);
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
        if (pathname === '/api/worktrees/summary') {
          if (!options.poller) {
            sendError(res, 503, 'summary_unavailable', access);
            return;
          }
          options.poller.noteViewer();
          sendJson(res, 200, buildWorktreeSummary(await options.poller.snapshot()), access);
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

    let asset = Object.hasOwn(STATIC_FILES, pathname) ? STATIC_FILES[pathname] : undefined;
    const pageRoute = /^\/(runs|projects)\/([^/]+)$/.exec(pathname);
    if (pageRoute) {
      let id = '';
      try {
        id = decodeURIComponent(pageRoute[2] ?? '');
      } catch {
        // 誤ったエンコードは、画面の道として扱わない。
      }
      const isRun = pageRoute[1] === 'runs';
      if (isRun ? /^[A-Za-z0-9_-]{1,128}$/.test(id) : isBoundedText(id, 512)) {
        asset = { file: isRun ? 'run.html' : 'project.html', type: 'text/html; charset=utf-8', page: 'index' };
      }
    }
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
    handle(req, res, url).catch(() => {
      if (!res.headersSent) sendError(res, 500, 'internal_error');
      else res.destroy();
    });
  };
}

export function createAppServer(options: AppOptions = {}): Server {
  return createServer(createAppHandler(options));
}
