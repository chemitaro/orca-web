// 試しの画面の組み立て（純粋な関数）。GET /api/worktrees/summary（orca-web.worktree-summary/v1）の文書から、
// worktree の節の並び、節ごとの数、エージェントの丸、上の帯の文を作る。DOM、時計、fetch に触らない。
// 要約の項目は信頼しないデータ。決めた項目だけを拾い、題名や本文は返さない。

/** mark の並びと、色に頼らない文字の札。 */
export const MARKS = ['working', 'blocked', 'waiting', 'done', 'sleeping', 'unknown'];

export const MARK_LABELS = {
  working: '作業中',
  blocked: '許可待ち',
  waiting: '入力待ち',
  done: '完了',
  sleeping: 'スリープ',
  unknown: '不明',
};

export const AGENT_TYPE_LABELS = { claude: 'Claude', codex: 'Codex' };

const SCHEMA = 'orca-web.worktree-summary/v1';
const DETAIL_PREFIX = '/embed/agent?id=';

const str = (value) => (typeof value === 'string' && value !== '' ? value : null);

/** パスの末尾（後ろの / は無視する）。 */
function basename(path) {
  const trimmed = path.replace(/\/+$/, '');
  const last = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  return last === '' ? path : last;
}

function formatElapsed(since, now) {
  if (typeof since !== 'string' || typeof now !== 'number') return null;
  const at = Date.parse(since);
  if (Number.isNaN(at)) return null;
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return '1分未満';
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間`;
  return `${Math.floor(hours / 24)}日`;
}

function bannerFor(doc) {
  const state = doc.connection?.state;
  if (state === 'unreachable') return 'Orca に届きません。表示は最後に読めた時のものです。';
  if (state === 'starting') return 'Orca への接続を確かめています。';
  if (state !== 'connected') return 'Orca との接続の状態が分かりません。';
  if (doc.stale === true) return 'Orca の読みが古くなっています。表示は最後に読めた時のものです。';
  return null;
}

function agentView(agent, now) {
  const mark = MARKS.includes(agent?.mark) ? agent.mark : 'unknown';
  const agentType = str(agent?.agentType);
  const detail = str(agent?.detail);
  return {
    id: str(agent?.id),
    mark,
    markLabel: MARK_LABELS[mark],
    agentType,
    typeLabel: agentType ? (AGENT_TYPE_LABELS[agentType] ?? agentType) : 'エージェント',
    since: str(agent?.since),
    elapsed: formatElapsed(agent?.since, now),
    detail: detail?.startsWith(DETAIL_PREFIX) ? detail : null,
  };
}

function sectionView(worktree, highlight, now) {
  const id = str(worktree?.id);
  const path = str(worktree?.path);
  const name = path ? basename(path) : (id ?? '—');
  const counts = MARKS.map((mark) => ({
    mark,
    label: MARK_LABELS[mark],
    count: Number.isInteger(worktree?.counts?.[mark]) ? worktree.counts[mark] : 0,
  })).filter((c) => c.count > 0);
  const agents = Array.isArray(worktree?.agents) ? worktree.agents.map((a) => agentView(a, now)) : [];
  return {
    key: id ?? path ?? name,
    name,
    branch: str(worktree?.branch),
    project: str(worktree?.project?.name),
    highlight: typeof highlight === 'string' && highlight !== '' && name === highlight,
    openTarget: id ?? path,
    total: Number.isInteger(worktree?.counts?.total) ? worktree.counts.total : agents.length,
    counts,
    agents,
  };
}

/**
 * @param {unknown} summary GET /api/worktrees/summary の文書
 * @param {{ highlight?: string, now?: number }} options highlight はパスの末尾が一致する節を先頭に置く。now は経過の起点（ミリ秒）
 * @returns {{ banner: string | null, sections: any[] }}
 */
export function buildTrialView(summary, { highlight, now } = {}) {
  if (!summary || typeof summary !== 'object' || summary.schema !== SCHEMA || !Array.isArray(summary.worktrees)) {
    return { banner: '要約の文書の形が違います。', sections: [] };
  }
  const sections = summary.worktrees.map((w) => sectionView(w, highlight, now));
  return {
    banner: bannerFor(summary),
    sections: [...sections.filter((s) => s.highlight), ...sections.filter((s) => !s.highlight)],
  };
}

/** orca-web の基の URL。画面を開いた名前（127.0.0.1 か tailnet の IP）と orcaPort から作る。 */
export function orcaBase(hostname, orcaPort) {
  return `http://${hostname}:${orcaPort}`;
}

/** 詳細とチャットの iframe の URL。theme は light か dark のときだけ付ける。 */
export function detailUrl(base, detail, theme) {
  const suffix = theme === 'light' || theme === 'dark' ? `&theme=${theme}` : '';
  return `${base}${detail}${suffix}`;
}
