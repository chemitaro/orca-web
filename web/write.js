// 書き込み（項目の選択の保存、開く口）の送り方。同じオリジンの POST /api/token で短期のトークンを得て、
// X-Orca-Web-Token の見出しで送る。トークンはこのメモリーにだけ持ち、URL、記録、親の画面に出さない。
// no-referrer にすると、Fetch の仕様では同じオリジンの POST の Origin が null になりうるので、same-origin にする。

/** 期限まで、この時間より短ければ取り直す。 */
const REFRESH_MARGIN_MS = 30_000;

/**
 * 使う fetch の形（テストは偽の fetch を渡す）。
 * @typedef {(url: string, init: Record<string, unknown>) => Promise<{ ok: boolean, status: number, json: () => Promise<any> }>} FetchLike
 */

/**
 * @param {{ fetch?: FetchLike, now?: () => number }} [deps]
 */
export function createWriter(deps = {}) {
  const doFetch = deps.fetch ?? /** @type {FetchLike} */ ((url, init) => globalThis.fetch(url, init));
  const now = deps.now ?? Date.now;
  /** @type {{ value: string, expiresAt: number } | null} */
  let token = null;

  /** @param {string} method @param {Record<string, string>} headers @param {string} body */
  const request = (method, headers, body) => ({
    method,
    mode: 'same-origin',
    credentials: 'omit',
    referrerPolicy: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });

  async function fetchToken() {
    const res = await doFetch('/api/token', request('POST', {}, '{}'));
    if (!res.ok) throw new Error(`cannot get a write token (${res.status})`);
    const body = await res.json();
    token = { value: String(body.token), expiresAt: Date.parse(String(body.expiresAt)) };
    return token.value;
  }

  async function ensureToken() {
    if (token && token.expiresAt - now() >= REFRESH_MARGIN_MS) return token.value;
    return fetchToken();
  }

  /**
   * JSON の書き込みを送る。401 なら（拒まれた要求は届いていないので）トークンを取り直して1回だけ送り直す。
   * @param {string} path
   * @param {'POST' | 'PUT'} method
   * @param {unknown} body
   * @returns {Promise<{ status: number, body: any }>}
   */
  async function send(path, method, body) {
    const text = JSON.stringify(body);
    let res = await doFetch(path, request(method, { 'x-orca-web-token': await ensureToken() }, text));
    if (res.status === 401) {
      token = null;
      res = await doFetch(path, request(method, { 'x-orca-web-token': await fetchToken() }, text));
    }
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
  }

  return { send };
}
