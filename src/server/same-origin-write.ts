// 書き込みの小さな守り（項目の選択の保存だけに使う）。iss-00007 が一般の書き込みの守り（短期のトークンなど）を作るときに置き換える。
// Host の確かめ（selfHosts との完全一致）は、呼ぶ前に app.ts が済ませている。
import type { IncomingMessage } from 'node:http';

export type WriteCheck = { ok: true } | { ok: false; status: 403 | 415; error: string };

/** Content-Type が JSON で、Origin があり、要求の Host の http のオリジンと完全に一致するときだけ受ける。 */
export function checkSameOriginWrite(req: IncomingMessage): WriteCheck {
  const type = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/json') return { ok: false, status: 415, error: 'content_type_must_be_json' };
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host || origin !== `http://${host}`) return { ok: false, status: 403, error: 'forbidden_origin' };
  return { ok: true };
}
