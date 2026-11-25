// 指揮の画面（/apexes）の対応のカードと、メンバーの枠の組み立て（iss-00080 D-01・D-02・D-04）。純粋な関数だけ。
// カードは頂点の文書の reasons・waitingMembers・questions から作る。並びは頂点、メンバーの許可待ち、質問・判断。
// 答えは既存の /embed/agent のカードと送る欄だけを通る（F-01）。ここは押した後の行き先と下書きの文を決めるだけ。
// 下書きは決めた型の文と識別子だけ（質問の本文は orca-web が拾わない）。

const MEMBER_LABELS = { blocked: '許可待ち', waiting: '入力待ち' };
const QUESTION_LABELS = { ask: '質問（ask）', gate: '判断（gate）' };
const QUESTION_ASKS = { ask: 'に答えてください。', gate: 'を決めてください。' };
const UNTITLED = '題名なし';

export const APEX_CARD_NOTE = '会話のカードで答えてください';
export const ANSWER_LABEL = '見て答える';
export const TELL_LABEL = '頂点に伝える';
export const BACK_TO_APEX_LABEL = '頂点に戻る';

/** 下書きの結果の言葉（reason ごと）。ok は案内、ほかは入れなかった理由。 */
export const DRAFT_RESULT_TEXTS = {
  ok: '頂点の入力欄に下書きを入れました。確かめてから送ってください',
  timeout: '下書きを入れられませんでした',
  not_empty: '下書きを入れられませんでした：頂点の入力欄に書きかけの文があります',
  busy: '下書きを入れられませんでした：頂点の送る欄が送信の途中か結果不明です',
  disabled: '下書きを入れられませんでした：頂点に送れない状態です',
  compose_off: '下書きを入れられませんでした：送る欄のない枠です',
  too_long: '下書きを入れられませんでした：文が長すぎます',
};

const list = (value) => (Array.isArray(value) ? value : []);
const str = (value) => (typeof value === 'string' && value !== '' ? value : null);

/**
 * 頂点の対応のカード。なければ空の配列（欄を出さない）。
 * @param {any} item /api/apexes の頂点の行（なければ null）
 * @returns {Array<
 *   | { kind: 'apex', key: string, text: string, note: string }
 *   | { kind: 'member', key: string, text: string, memberId: string, memberTitle: string, action: { type: 'answer', label: string } }
 *   | { kind: 'question', key: string, text: string, dispatchId: string, taskTitle: string, questionKind: 'ask' | 'gate', action: { type: 'tell', label: string } }
 * >}
 */
export function buildApexCards(item) {
  if (!item || typeof item !== 'object') return [];
  const cards = [];
  const reasons = list(item.reasons);
  const apexMark = reasons.includes('apex_blocked') ? 'blocked' : reasons.includes('apex_waiting') ? 'waiting' : null;
  if (apexMark) {
    cards.push({ kind: 'apex', key: 'apex', text: `頂点が${MEMBER_LABELS[apexMark]}`, note: APEX_CARD_NOTE });
  }
  for (const member of list(item.waitingMembers)) {
    const id = str(member?.id);
    const label = MEMBER_LABELS[member?.mark];
    if (!id || !label) continue;
    const title = str(member.title) ?? UNTITLED;
    cards.push({
      kind: 'member',
      key: `member:${id}`,
      text: `${title}が${label}`,
      memberId: id,
      memberTitle: title,
      action: { type: 'answer', label: ANSWER_LABEL },
    });
  }
  for (const question of list(item.questions)) {
    const dispatchId = str(question?.dispatchId);
    const label = QUESTION_LABELS[question?.kind];
    if (!dispatchId || !label) continue;
    const taskTitle = str(question.taskTitle) ?? UNTITLED;
    cards.push({
      kind: 'question',
      key: `question:${question.kind}:${dispatchId}`,
      text: `${taskTitle}の${label}`,
      dispatchId,
      taskTitle,
      questionKind: question.kind,
      action: { type: 'tell', label: TELL_LABEL },
    });
  }
  return cards;
}

/**
 * 頂点の入力欄に入れる決めた型の文。
 * 「メンバー「〈task の題名〉」の質問（ask）に答えてください。」か「…の判断（gate）を決めてください。」に、改行と Dispatch の id。
 * @param {{ taskTitle: string, questionKind: 'ask' | 'gate', dispatchId: string }} card
 */
export function buildDraftText(card) {
  const kind = card.questionKind === 'gate' ? 'gate' : 'ask';
  return `メンバー「${card.taskTitle}」の${QUESTION_LABELS[kind]}${QUESTION_ASKS[kind]}\n（Dispatch ${card.dispatchId}）`;
}

/** 下書きの結果の帯。ok は info、ほかは bad。 */
export function draftNotice(result) {
  if (result?.ok === true) return { kind: 'info', text: DRAFT_RESULT_TEXTS.ok };
  const reason = typeof result?.reason === 'string' ? result.reason : 'timeout';
  return {
    kind: 'bad',
    text: Object.hasOwn(DRAFT_RESULT_TEXTS, reason) ? DRAFT_RESULT_TEXTS[reason] : DRAFT_RESULT_TEXTS.timeout,
  };
}

/**
 * 右のペインの枠に出すもの。member があればそのメンバーの答えるだけの枠、なければ頂点の枠。
 * @param {string} apexId
 * @param {{ id: string, title: string } | null} member
 * @returns {{ id: string, compose: boolean, band: { text: string, back: string } | null }}
 */
export function paneFrameTarget(apexId, member) {
  if (!member) return { id: apexId, compose: true, band: null };
  return {
    id: member.id,
    compose: false,
    band: { text: `メンバー「${member.title}」（答えるだけ）`, back: BACK_TO_APEX_LABEL },
  };
}
