// 受け箱の画面の組み立て（純粋な関数）。/api/inbox の文書（orca-web.inbox/v1）から、段の見出し、件数、
// 項目の行、理由と経過の文、鮮度と読めない部分の文を作る。DOM、時計、fetch に触らない。

/** 画面の段の順。 */
export const STAGE_ORDER = ['needs_action', 'stalled', 'running', 'unknown', 'finished'];

export const STAGE_LABELS = {
  needs_action: '要対応',
  stalled: '止まっている',
  running: '動いている',
  unknown: '不明',
  finished: '終わった',
};

export const REASON_LABELS = {
  blocked: '許可待ち',
  waiting: '入力待ち',
  question: '統括あての質問',
  decision_gate: '判断の連絡',
  gate: '判断の門',
  no_output: '出力が止まっている',
  terminal_ended: '端末が終わった',
  working: '動いている',
  done: '終わった',
  sleeping: 'スリープ',
  ci_failed: 'CI の失敗',
  merge_pending: 'マージ待ち',
};

export const MISSING_LABELS = {
  state_missing: '状態が取れない',
  state_unknown: '知らない状態の値',
  pr_state_missing: 'PR の状態が分からない',
};

const KIND_LABELS = { agent: null, question: '質問', gate: '判断の門', pr: 'PR' };

/** Orca の画面でしか答えられない理由。許可の承認や返事の操作は置かず、Orca で開くよう案内する。 */
const ANSWER_IN_ORCA = new Set(['blocked', 'waiting', 'question', 'decision_gate', 'gate']);

const DETAIL_PREFIX = '/embed/agent?id=';

const defaultTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('ja-JP', { hour12: false });
};

/** https の URL だけを返す（ほかの scheme や相対の URL はリンクにしない）。 */
export function httpsHref(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** 詳細とチャットの画面の決めた形（/embed/agent?id=…）だけを返す。 */
function detailHref(value) {
  return typeof value === 'string' && value.startsWith(DETAIL_PREFIX) ? value : null;
}

/** 経過の文（「12分」「3時間」「2日」）。読めない時刻は null。 */
export function formatElapsed(since, now) {
  if (typeof since !== 'string') return null;
  const at = Date.parse(since);
  if (Number.isNaN(at)) return null;
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return '1分未満';
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間`;
  return `${Math.floor(hours / 24)}日`;
}

function itemRow(item, now) {
  const reasons = Array.isArray(item.reasons) ? item.reasons : [];
  const missing = Array.isArray(item.missing) ? item.missing : [];
  const open = item.links?.open;
  return {
    key: String(item.id),
    kindLabel: KIND_LABELS[item.kind] ?? null,
    project: item.project?.name ?? null,
    issue: item.issue ?? null,
    agentType: item.agentType ?? null,
    elapsed: formatElapsed(item.since, now),
    lastWords: item.lastWords ?? null,
    reason: reasons.map((r) => REASON_LABELS[r] ?? String(r)).join('・'),
    missing: missing.map((m) => MISSING_LABELS[m] ?? String(m)).join('・'),
    hint: reasons.some((r) => ANSWER_IN_ORCA.has(r)) ? 'Orca で開いて答える' : null,
    detailHref: detailHref(item.links?.detail),
    prHref: httpsHref(item.links?.pr),
    open:
      open && typeof open.worktreeId === 'string' && typeof open.agentId === 'string'
        ? { worktreeId: open.worktreeId, agentId: open.agentId }
        : null,
  };
}

/** 文字列の時刻のうち、いちばん新しいもの。 */
function latest(times) {
  let best = null;
  for (const t of times) {
    if (typeof t !== 'string' || Number.isNaN(Date.parse(t))) continue;
    if (best === null || Date.parse(t) > Date.parse(best)) best = t;
  }
  return best;
}

function freshnessLines(doc, formatTime, error) {
  const lines = [];
  const connection = doc.connection ?? {};
  if (connection.state === 'connected') lines.push({ text: 'Orca に接続', kind: 'ok' });
  else if (connection.state === 'starting') lines.push({ text: '確かめ中', kind: 'info' });
  else
    lines.push({
      text: `Orca に接続できない${connection.reason ? `（${connection.reason}）` : ''}`,
      kind: 'bad',
    });

  const stateSources = doc.sources?.state?.sources ?? {};
  const last = latest(Object.values(stateSources).map((s) => s?.lastSuccessAt));
  lines.push(
    last ? { text: `最後に読めた時刻 ${formatTime(last)}`, kind: 'info' } : { text: 'まだ読めていない', kind: 'warn' },
  );
  if (doc.stale) lines.push({ text: '古い値を含む', kind: 'warn' });

  const broken = Object.entries(stateSources)
    .filter(([, s]) => s?.error)
    .map(([name, s]) => `${name}（${s.error.kind}）`);
  if (broken.length > 0) lines.push({ text: `状態の読めない部分：${broken.join('、')}`, kind: 'warn' });

  const mail = doc.sources?.mail ?? {};
  if (!mail.lastSuccessAt) {
    const why = mail.error?.kind ? `（${mail.error.kind}）` : '';
    lines.push({ text: `連絡：読めない${why}。統括あての質問と門は示せません`, kind: 'warn' });
  } else if (mail.error) {
    lines.push({ text: `連絡：読めない（${mail.error.kind}）。前に読めた内容を示しています`, kind: 'warn' });
  } else if (mail.runsFailed > 0) {
    lines.push({ text: `連絡：${mail.runsFailed} 件の Run を読めない`, kind: 'warn' });
  }

  if (error) lines.push({ text: `更新できない（${error}）。前の内容を示しています`, kind: 'bad' });
  return lines;
}

function projectOptions(doc, project) {
  const options = [{ value: '', label: 'すべてのプロジェクト', selected: !project }];
  let found = false;
  for (const p of doc.projects ?? []) {
    const selected = p.id === project;
    found ||= selected;
    options.push({ value: String(p.id), label: `${p.name}（${p.count}）`, selected });
  }
  if (project && !found) options.push({ value: project, label: `${project}（0）`, selected: true });
  return options;
}

/**
 * 受け箱の文書から画面の内容を作る。
 * @param {any} doc /api/inbox の文書
 * @param {{ now: number, formatTime?: (iso: string) => string, project?: string | null, error?: string | null }} options
 */
export function buildInboxView(doc, options) {
  const formatTime = options.formatTime ?? defaultTime;
  const mailUnread = !doc.sources?.mail?.lastSuccessAt;
  const byStage = new Map((doc.stages ?? []).map((s) => [s.stage, s]));
  const stages = STAGE_ORDER.map((stage) => {
    const items = (byStage.get(stage)?.items ?? []).map((item) => itemRow(item, options.now));
    return {
      stage,
      title: STAGE_LABELS[stage],
      count: items.length,
      collapsed: stage === 'finished',
      note: stage === 'needs_action' && mailUnread ? '統括あての質問と門は読めていません（空ではありません）' : null,
      items,
    };
  });
  return {
    freshness: freshnessLines(doc, formatTime, options.error ?? null),
    mailUnread,
    projects: projectOptions(doc, options.project ?? null),
    stages,
    total: stages.reduce((n, s) => n + s.count, 0),
  };
}

/** URL の検索の文字列から、選んだプロジェクト（なければ null）を読む。 */
export function projectFromSearch(search) {
  const value = new URLSearchParams(search).get('project');
  return value ? value : null;
}

/** 検索の文字列の project を差し替え（空なら消し）、ほかの引数を保つ。 */
export function searchForProject(search, project) {
  const params = new URLSearchParams(search);
  if (project) params.set('project', project);
  else params.delete('project');
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** 受け箱の API の道。 */
export function inboxApiPath(project) {
  return project ? `/api/inbox?project=${encodeURIComponent(project)}` : '/api/inbox';
}
