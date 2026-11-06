// orca-web の HTTP の入口。今は健康の確かめだけを持つ。API は後の Issue で足す。
import { createServer, type Server, type ServerResponse } from 'node:http';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

export function createAppServer(): Server {
  return createServer((req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      sendJson(res, 400, { ok: false, error: 'bad_request' });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 404, { ok: false, error: 'not_found' });
  });
}
