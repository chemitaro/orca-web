// 指揮の画面で、対応が必要なメンバーの節に付ける印（iss-00097 D-01）の決め方（純粋な関数）。
// 頂点の文書（orca-web.apexes/v1）の questions と waitingMembers から、dispatchId と agentId で引く印の表を作る。
// 稼働中の内訳の木（apexes-live-view.js）とチームの帯（apexes-team-view.js）が使う。DOM、時計、fetch に触らない。

/** 印の言葉。urgent の印（対応が必要）と、控えめの印（作業を続けながらの問い・返事済みの質問・解決済みの判断）。 */
export const ATTENTION_LABELS = {
  question: '対応が必要：質問',
  decision: '対応が必要：判断',
  blocked: '対応が必要：許可待ち',
  waiting: '対応が必要：入力待ち',
  question_working: '質問あり（作業は継続中）',
  question_answered: '質問の印あり（返事済み）',
  decision_resolved: '判断の印あり（門は解決済み）',
};

/** 対応が必要の印の並び。控えめの印はこの後ろ。 */
const URGENT_ORDER = ['question', 'decision', 'waiting'];
const QUIET_ORDER = ['question_working', 'question_answered', 'decision_resolved'];
/** answered 真（iss-00098）の控えめの印。ask は返事済み、gate は門が解決済み。 */
const SETTLED_OF_KIND = { ask: 'question_answered', gate: 'decision_resolved' };
const URGENT_OF_KIND = { ask: 'question', gate: 'decision' };

const list = (value) => (Array.isArray(value) ? value : []);
const str = (value) => (typeof value === 'string' && value !== '' ? value : null);

function add(map, key, mark) {
  const marks = map.get(key) ?? [];
  marks.push(mark);
  map.set(key, marks);
}

/**
 * 頂点の項目から印の表を作る。questions の answered（iss-00098）はなければ null として扱う。
 * @param {any} item /api/apexes の頂点の行
 * @returns {{ byDispatch: Map<string, any[]>, byAgent: Map<string, any[]> }}
 */
export function memberAttention(item) {
  const byDispatch = new Map();
  const byAgent = new Map();
  for (const question of list(item?.questions)) {
    const dispatchId = str(question?.dispatchId);
    const urgentKind = URGENT_OF_KIND[question?.kind];
    if (!dispatchId || !urgentKind) continue;
    // 控えめの印は、同じ種類の対応が必要の印と重なれば落とすため、元の種類（of）を持つ。
    if (question.answered === true)
      add(byDispatch, dispatchId, { kind: SETTLED_OF_KIND[question.kind], of: urgentKind });
    else if (question.working === true) add(byDispatch, dispatchId, { kind: 'question_working', of: urgentKind });
    else add(byDispatch, dispatchId, { kind: urgentKind, of: urgentKind });
  }
  for (const member of list(item?.waitingMembers)) {
    const id = str(member?.id);
    const mark = member?.mark;
    if (!id || (mark !== 'blocked' && mark !== 'waiting')) continue;
    add(byAgent, id, { kind: 'waiting', of: 'waiting', label: ATTENTION_LABELS[mark] });
  }
  return { byDispatch, byAgent };
}

/**
 * 節の印。agent の節は agentId と dispatchId の両方で、Dispatch の節は dispatchId で引く。
 * 対応が必要の印を控えめより先に、種類の違う対応が必要の印はすべて並べる。同じ種類で対応が必要と控えめが重なれば対応が必要だけ。
 * @param {any} node 頂点の team の節
 * @param {{ byDispatch: Map<string, any[]>, byAgent: Map<string, any[]> }} table memberAttention の結果
 * @returns {Array<{ kind: string, label: string, urgent: boolean }>}
 */
export function attentionFor(node, table) {
  if (!node || !table) return [];
  const found = [];
  const dispatchId = str(node.dispatchId);
  if (dispatchId) found.push(...(table.byDispatch.get(dispatchId) ?? []));
  const agentId = node.kind === 'agent' ? str(node.agentId) : null;
  if (agentId) found.push(...(table.byAgent.get(agentId) ?? []));
  const urgent = new Map();
  for (const mark of found) {
    if (URGENT_ORDER.includes(mark.kind) && !urgent.has(mark.kind)) urgent.set(mark.kind, mark);
  }
  const quiet = new Map();
  for (const mark of found) {
    if (!QUIET_ORDER.includes(mark.kind) || urgent.has(mark.of) || quiet.has(mark.kind)) continue;
    quiet.set(mark.kind, mark);
  }
  const out = (mark, isUrgent) => ({
    kind: mark.kind,
    label: mark.label ?? ATTENTION_LABELS[mark.kind],
    urgent: isUrgent,
  });
  return [
    ...URGENT_ORDER.filter((kind) => urgent.has(kind)).map((kind) => out(urgent.get(kind), true)),
    ...QUIET_ORDER.filter((kind) => quiet.has(kind)).map((kind) => out(quiet.get(kind), false)),
  ];
}
