// 許さないオリジンの画面。試しの orca-web に対して、要約の読み、詳細とチャットの iframe、開くボタン、
// トークンと送る意図の書き込み、印の部品の動的な import を試し、拒まれたかを textContent で示す。宛先はどれも実在しない仮の値にする。
import { orcaBase } from './trial-view.js';

const PROBE_ID = 'forbidden-probe';

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

function show(id, refused, text) {
  const node = $(id);
  node.className = `result ${refused ? 'ok' : 'ng'}`;
  node.textContent = `${refused ? '拒まれた（期待どおり）' : '読めた（許しの不備）'}：${text}`;
}

/** fetch を試す。ブラウザーが応答を渡さない（CORS で拒む）か、許さない状態なら拒まれたとする。 */
async function probe(id, url, init) {
  try {
    const res = await fetch(url, { cache: 'no-store', ...init });
    show(id, !res.ok, `HTTP ${res.status}`);
  } catch {
    show(id, true, 'ブラウザーが応答を渡さない（CORS で拒まれたか、届かない）');
  }
}

/** 印の部品の動的な import を試す。CORS で拒まれると import が失敗する。 */
async function probeImport(id, url) {
  try {
    await import(url);
    show(id, false, 'import できた');
  } catch {
    show(id, true, 'import が失敗した（CORS で拒まれたか、届かない）');
  }
}

function json(body) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function start() {
  let base;
  try {
    const res = await fetch('./config.json', { cache: 'no-store' });
    const config = await res.json();
    if (!Number.isInteger(config?.orcaPort)) throw new Error('orcaPort');
    base = orcaBase(location.hostname, config.orcaPort);
  } catch {
    const banner = $('banner');
    banner.hidden = false;
    banner.textContent = '試しの設定（config.json）を読めません。';
    return;
  }

  const frame = document.createElement('iframe');
  frame.className = 'probe-frame';
  frame.title = '詳細とチャット（拒まれるはず）';
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.src = `${base}/embed/agent?id=${encodeURIComponent(PROBE_ID)}`;
  $('agent-slot').append(frame);

  const script = document.createElement('script');
  script.src = `${base}/embed/open-button.js`;
  script.dataset.worktree = PROBE_ID;
  script.dataset.size = 'sm';
  $('button-slot').append(script);

  await Promise.all([
    probe('r-summary', `${base}/api/worktrees/summary`),
    probe('r-token', `${base}/api/token`, json({})),
    probe('r-intent', `${base}/api/send/intent`, json({})),
    probeImport('r-marks', `${base}/embed/agent-marks.js`),
  ]);
}

void start();
