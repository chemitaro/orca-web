// 試しの画面の組み立て（純粋な関数）。GET /api/worktrees/summary（orca-web.worktree-summary/v1）の1つの文書から、
// 構造の図の箱の見本、Issue の一覧の行の見本、worktree の節の並びと数の札、上の帯の文を作る。DOM、時計、fetch に触らない。
// 印（種類のアイコン、状態の色、経過）は試しの orca-web の部品（/embed/agent-marks.js）が描くので、ここでは組み立てない。
// 要約の項目は信頼しないデータ。決めた項目だけを拾い、題名や本文は返さない。

/** 数の札の並び（色の点と数だけを出す）。 */
const COUNT_ORDER = ['working', 'blocked', 'waiting', 'done', 'sleeping', 'unknown'];

const SCHEMA = 'orca-web.worktree-summary/v1';

const str = (value) => (typeof value === 'string' && value !== '' ? value : null);

/** パスの末尾（後ろの / は無視する）。 */
function basename(path) {
  const trimmed = path.replace(/\/+$/, '');
  const last = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  return last === '' ? path : last;
}

function bannerFor(doc) {
  const state = doc.connection?.state;
  if (state === 'unreachable') return 'Orca に届きません。表示は最後に読めた時のものです。';
  if (state === 'starting') return 'Orca への接続を確かめています。';
  if (state !== 'connected') return 'Orca との接続の状態が分かりません。';
  if (doc.stale === true) return 'Orca の読みが古くなっています。表示は最後に読めた時のものです。';
  return null;
}

function sectionView(worktree, highlight) {
  const id = str(worktree?.id);
  const path = str(worktree?.path);
  const name = path ? basename(path) : (id ?? '—');
  const agentCount = Array.isArray(worktree?.agents) ? worktree.agents.length : 0;
  const counts = COUNT_ORDER.map((mark) => ({
    mark,
    count: Number.isInteger(worktree?.counts?.[mark]) ? worktree.counts[mark] : 0,
  })).filter((c) => c.count > 0);
  return {
    key: id ?? path ?? name,
    name,
    branch: str(worktree?.branch),
    project: str(worktree?.project?.name),
    issue: str(worktree?.issue),
    highlight: typeof highlight === 'string' && highlight !== '' && name === highlight,
    openTarget: id ?? path,
    where: { id, path },
    agentCount,
    total: Number.isInteger(worktree?.counts?.total) ? worktree.counts.total : agentCount,
    counts,
  };
}

/**
 * @param {unknown} summary GET /api/worktrees/summary の文書
 * @param {{ highlight?: string, now?: number }} options highlight はパスの末尾が一致する節を先頭に置く
 * @returns {{ banner: string | null, sections: any[], boxes: any[], rows: any[] }}
 */
export function buildTrialView(summary, { highlight } = {}) {
  if (!summary || typeof summary !== 'object' || summary.schema !== SCHEMA || !Array.isArray(summary.worktrees)) {
    return { banner: '要約の文書の形が違います。', sections: [], boxes: [], rows: [] };
  }
  const all = summary.worktrees.map((w) => sectionView(w, highlight)).filter((s) => s.agentCount > 0);
  const ordered = [...all.filter((s) => s.highlight), ...all.filter((s) => !s.highlight)];
  const sections = ordered.map(({ agentCount, issue, ...section }) => section);
  return {
    banner: bannerFor(summary),
    sections,
    boxes: ordered.map((s) => ({ key: s.key, name: s.name, branch: s.branch, where: s.where })),
    rows: ordered.map((s) => ({ key: s.key, label: s.issue ?? s.name, where: s.where })),
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

/**
 * 「状態の見本」の worktree。手で作った working・monitoring・done の3つで、実機の値と混ぜない。
 * 詳細とパスを持たない（見本から詳細や「Orca で開く」に進まない）。
 * @param {number} now
 */
export function stateSamples(now) {
  // 見本の古さ（分）を時刻にする。経過の短い形への変換は部品（elapsed.js）がする。
  const at = (minutes) => new Date(now - minutes * 60 * 1000).toISOString();
  const sample = (key, mark, workingMode, agentType, minutes) => ({
    id: `sample:${key}`,
    mark,
    workingMode,
    agentType,
    since: at(minutes),
    elapsedFrom: at(minutes),
    elapsedBasis: 'state',
    detail: null,
  });
  return {
    id: 'sample:states',
    path: null,
    agents: [
      sample('working', 'working', null, 'claude', 12),
      sample('monitoring', 'working', 'monitoring', 'claude', 5),
      sample('done', 'done', null, 'codex', 180),
    ],
  };
}
