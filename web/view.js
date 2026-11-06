// 状態の画面の表の組み立て（純粋な関数）。DOM に触らない。値は文字にして返し、HTML として解かない（描く側は textContent を使う）。

const MEANING_LABELS = {
  'current-selection': '現在の選択',
  'last-observed': '最後の観測',
  'launch-resolved': '起動時の解決',
  'launch-requested': '起動の要求',
};

export const MISSING_LABELS = {
  'not-provided': 'Orca が値を報告しない',
  'no-source': 'この種類には取得元がない',
  'not-linked': '結ぶ鍵がない',
  'not-fetched': '読まない（終わった担当など）',
  'source-failed': '取得元を読めていない',
  'source-unavailable': 'Orca の機能が使えない',
  'invalid-value': '知らない形の値',
  'no-data': '値がない',
};

const ENTITY_TABLES = [
  { entity: 'worktree', title: 'worktree', list: 'worktrees' },
  { entity: 'agent', title: 'エージェント', list: 'agents' },
  { entity: 'worker', title: 'オーケストレーションの担当', list: 'workers' },
  { entity: 'task', title: 'Task', list: 'tasks' },
  { entity: 'run', title: 'Run', list: 'runs' },
  { entity: 'repo', title: 'repo', list: 'repos' },
];

const defaultFormatTime = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('ja-JP', { hour12: false });
};

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** 1つの項目（Fact）を、表のセル（文字と注記）にする。 */
export function formatValue(fact, options = {}) {
  const formatTime = options.formatTime ?? defaultFormatTime;
  if (fact === undefined || fact === null || typeof fact !== 'object') return { text: '—', note: 'no-data' };
  const value = fact.value;
  if (value === null || value === undefined) return { text: '—', note: fact.missing ?? 'no-data' };
  if (fact.meaning) {
    const label = MEANING_LABELS[fact.meaning] ?? fact.meaning;
    return { text: `${value}（${label}）`, note: `${fact.source}: ${fact.field}` };
  }
  if (typeof value === 'boolean') return { text: value ? 'はい' : 'いいえ', note: null };
  if (Array.isArray(value)) return { text: value.length ? value.join(', ') : '（なし）', note: null };
  if (typeof value === 'object') {
    if ('total' in value && 'passed' in value) {
      return { text: `${value.status ?? '?'} ${value.passed}/${value.total}`, note: null };
    }
    if ('number' in value && 'url' in value) {
      return { text: [`#${value.number ?? '?'}`, value.state, value.title].filter(Boolean).join(' '), note: null };
    }
    return { text: JSON.stringify(value), note: null };
  }
  if (typeof value === 'string' && ISO_TIME.test(value)) return { text: formatTime(value), note: null };
  return { text: String(value), note: null };
}

function rowsFor(entity, state) {
  switch (entity) {
    case 'worktree': {
      const withAgents = new Set(state.agents.map((a) => a.worktreeId));
      const live = state.worktrees.filter((w) => w.isArchived.value !== true);
      return [...live.filter((w) => withAgents.has(w.id)), ...live.filter((w) => !withAgents.has(w.id))];
    }
    case 'agent':
      return state.agents;
    case 'worker':
      return state.workers;
    case 'task':
      return state.tasks;
    case 'run':
      return state.runs;
    default:
      return state.repos;
  }
}

/** 担当へのつながり（agent.worker）は Fact ではなく素の識別子なので、別に文字にする。 */
function cell(row, key, options) {
  if (key === 'worker' && !('value' in (row.worker ?? {}))) {
    return row.worker ? { text: row.worker.dispatchId, note: row.worker.taskId } : { text: '—', note: 'not-provided' };
  }
  return formatValue(row[key], options);
}

function rowKey(entity, row) {
  return entity === 'worker' ? row.dispatchId : row.id;
}

function rowLabel(entity, row, worktreeNames) {
  switch (entity) {
    case 'worktree':
      return worktreeNames.get(row.id) ?? row.id;
    case 'agent':
    case 'worker': {
      const id = entity === 'agent' ? row.worktreeId : row.worktreeId.value;
      return worktreeNames.get(id) ?? id ?? '—';
    }
    default:
      return row.title?.value ?? row.displayName?.value ?? row.id;
  }
}

function latest(values) {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

/**
 * 状態と項目の一覧と選んだ項目から、表を作る。列は選んだ項目だけ（項目の一覧の順）。選んだ項目のない対象の表は出さない。
 * 返す形：{ status: { connection, reason, stale, lastSuccessAt }, tables: [{ entity, title, columns, rows: [{ key, label, cells }] }] }
 */
export function buildView(state, fields, selected, options = {}) {
  const chosen = new Set(selected);
  const worktreeNames = new Map(
    state.worktrees.map((w) => [w.id, w.branch.value ?? w.displayName.value ?? w.path.value ?? w.id]),
  );
  const tables = [];
  for (const table of ENTITY_TABLES) {
    const columns = fields
      .filter((f) => f.entity === table.entity && chosen.has(f.id))
      .map((f) => ({ id: f.id, label: f.label, description: f.description }));
    if (columns.length === 0) continue;
    const rows = rowsFor(table.entity, state).map((row) => ({
      key: rowKey(table.entity, row),
      label: rowLabel(table.entity, row, worktreeNames),
      cells: columns.map((c) => cell(row, c.id.slice(c.id.indexOf('.') + 1), options)),
    }));
    tables.push({ entity: table.entity, title: table.title, columns, rows });
  }
  return {
    status: {
      connection: state.connection.state,
      reason: state.connection.reason,
      stale: state.stale,
      lastSuccessAt: latest(Object.values(state.sources).map((s) => s.lastSuccessAt)),
    },
    tables,
  };
}
