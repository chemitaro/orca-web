// 会話の正規化（`orca-web.transcript/v1`）。Orca の件（端末のエージェントの NativeChatMessage、構造化 Chat の AgentJournalRenderItem）を、
// 画面が描く小さな件に減らす。思考（reasoning）は印も付けずに落とす。未対応の部分だけを `unsupported` の印にする。
// 形は stablyai/orca v1.4.256 の src/shared/native-chat/native-chat-types.ts と src/shared/agent-session/journal/agent-session-journal-types.ts に合わせる。

import type { PagePosition, RawPage, TranscriptSource, TranscriptTarget } from '../orca/read-transcript.ts';

export const TRANSCRIPT_SCHEMA = 'orca-web.transcript/v1';

export const MAX_TEXT_CHARS = 100_000;
export const MAX_TOOL_INPUT_CHARS = 4_000;
export const MAX_TOOL_OUTPUT_CHARS = 8_000;
export const MAX_QUESTION_CHARS = 4_000;
export const MAX_QUESTION_LABEL_CHARS = 500;
export const MAX_QUESTION_DESCRIPTION_CHARS = 2_000;
export const MAX_QUESTION_OTHER_CHARS = 4_000;
/** Orca の答えは1〜4件、1つの答えの optionIds は64件まで。これを超える質問は部分にしない。 */
export const MAX_QUESTIONS = 4;
export const MAX_QUESTION_OPTIONS = 64;
export const MAX_APPROVAL_LABEL_CHARS = 500;
export const MAX_APPROVAL_DESCRIPTION_CHARS = 2_000;
export const MAX_APPROVAL_PATH_CHARS = 1_000;
export const MAX_APPROVAL_DETAIL_CHARS = 8_000;
export const MAX_APPROVAL_PLAN_CHARS = 16_000;
/** 承認の選択肢の上限。超える承認は部分にしない。 */
export const MAX_APPROVAL_OPTIONS = 16;

export type TranscriptRole = 'user' | 'assistant' | 'tool' | 'system';

export type TranscriptPart =
  | { type: 'text'; text: string; truncated?: true }
  | { type: 'tool-call'; name: string; input: string; callId: string | null; truncated?: true }
  | { type: 'tool-result'; output: string; isError: boolean; callId: string | null; truncated?: true }
  | QuestionPart
  | ApprovalPart
  | { type: 'unsupported'; what: UnsupportedWhat };

export interface QuestionOptionView {
  id: string;
  label: string;
  description: string | null;
}

export interface QuestionView {
  id: string;
  header: string | null;
  question: string;
  multiSelect: boolean;
  options: QuestionOptionView[];
  allowOther: boolean;
  otherAllowsEmpty: boolean;
  /** 端末の単一選択の問いで、選択肢のどれかに空白だけでない preview があるか（Orca の hasPreviews）。ほかは偽。 */
  preview: boolean;
}

export type QuestionState = 'pending' | 'answered' | 'cancelled';

export interface QuestionAnswerView {
  questionId: string;
  optionIds: string[];
  other: string | null;
}

/**
 * 答え方。rpc は構造化 Chat の journal の question（agentSession.respondToQuestion）、
 * keys は端末のエージェントの質問のツール（Orca と同じキーの列）、message は request_user_input_async（後の発言）。
 */
export type AnswerVia = 'rpc' | 'keys' | 'message';

/** 質問の部分。chat は構造化 Chat の件、terminal は端末のエージェントの件。 */
export interface QuestionPart {
  type: 'question';
  source: 'chat' | 'terminal';
  answerVia: AnswerVia;
  prompt: { itemId: string; revision: number } | null;
  callId: string | null;
  questions: QuestionView[];
  state: QuestionState;
  answers: QuestionAnswerView[] | null;
  truncated?: true;
}

export type ApprovalIntent = 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';

export interface ApprovalOptionView {
  id: string;
  label: string;
  description: string | null;
  intent: ApprovalIntent | null;
}

/** 答えられない理由。url は Orca の外で開くページ、newer_subject は知らない種類か選択肢のない承認、terminal は端末のエージェント。 */
export type ApprovalUnanswerableReason = 'url' | 'newer_subject' | 'terminal';

/** 承認（許可の確認）の部分。chat は構造化 Chat の journal の approval、terminal は端末のエージェントの待っている許可の確認。 */
export interface ApprovalPart {
  type: 'approval';
  source: 'chat' | 'terminal';
  prompt: { itemId: string; revision: number } | null;
  title: string | null;
  tool: string | null;
  description: string | null;
  reason: string | null;
  blockedPath: string | null;
  plan: { text: string; filePath: string | null } | null;
  detail: string | null;
  options: ApprovalOptionView[];
  answerable: boolean;
  unanswerableReason: ApprovalUnanswerableReason | null;
  state: QuestionState;
  /** answered のときの選んだ選択肢の id（今の選択肢にあるときだけ）。 */
  selectedOptionId: string | null;
  truncated?: true;
}

/** 「表示できない」の部分の名前。Orca の文字はそのまま入れない。 */
export type UnsupportedWhat =
  | 'image'
  | 'subagent'
  | 'background-task'
  | 'diff'
  | 'approval'
  | 'question'
  | 'status'
  | 'plan'
  | 'unknown';

const JOURNAL_UNSUPPORTED: ReadonlySet<string> = new Set(['diff', 'approval', 'question', 'status', 'plan']);

const QUESTION_UNSUPPORTED: TranscriptPart = { type: 'unsupported', what: 'question' };

export interface TranscriptMessage {
  id: string;
  role: TranscriptRole;
  /** ISO の時刻。Orca が持たなければ null。 */
  at: string | null;
  parts: TranscriptPart[];
  /** 端末の利用者の発言で、まだ届いていないもの（Orca の isDeliveredNativeChatUserMessage に当たらない）。後の発言の質問の答えに数えない。 */
  undelivered?: true;
  /** 端末の role user の件のうち、Orca の from.kind が agent のもの（ほかのエージェントからの発言）。利用者の答えに数えない。 */
  fromAgent?: true;
}

/** Orca の isDeliveredNativeChatUserMessage が届いていないとする印（送っていない、止めた、送り直し待ち、待ち行列、送信中、届け先の状態）。 */
const UNDELIVERED_FLAGS = [
  'unsent',
  'stoppedBeforeStart',
  'awaitsRetry',
  'sentWhileStopping',
  'queued',
  'pendingSend',
  'deliveryState',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function clipText(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

function toIso(ms: unknown): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function inputText(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input === undefined || input === null) return '';
  try {
    return JSON.stringify(input, null, 2) ?? '';
  } catch {
    return '';
  }
}

function withTruncated<T extends TranscriptPart>(part: T, truncated: boolean): T {
  return truncated ? { ...part, truncated: true } : part;
}

/**
 * NativeChatBlock を部品にする。知らない形は unsupported。terminal は端末の会話の件で、質問のツールの呼び出しを question にする。
 * request_user_input_async は端末でも構造化 Chat でも question（answerVia message）にする。
 */
function blockPart(block: unknown, shortened: boolean, terminal = false): TranscriptPart {
  if (!isRecord(block)) return { type: 'unsupported', what: 'unknown' };
  switch (block.type) {
    case 'text': {
      const text = str(block.text);
      if (text === null) return { type: 'unsupported', what: 'unknown' };
      const c = clipText(text, MAX_TEXT_CHARS);
      return withTruncated({ type: 'text', text: c.text }, c.truncated || shortened);
    }
    case 'tool-call': {
      const name = str(block.name) ?? '';
      if (terminal && block.state !== 'failed' && isAskUserQuestionTool(name)) {
        const question = terminalQuestionPart(block.input, str(block.callId), shortened);
        if (question) return question;
      }
      if (block.state !== 'failed' && isAsyncQuestionTool(name)) {
        const question = asyncQuestionPart(block.input, str(block.callId), shortened, terminal ? 'terminal' : 'chat');
        if (question) return question;
      }
      const c = clipText(inputText(block.input), MAX_TOOL_INPUT_CHARS);
      return withTruncated(
        { type: 'tool-call', name, input: c.text, callId: str(block.callId) },
        c.truncated || shortened,
      );
    }
    case 'tool-result': {
      const c = clipText(str(block.output) ?? '', MAX_TOOL_OUTPUT_CHARS);
      return withTruncated(
        { type: 'tool-result', output: c.text, isError: block.isError === true, callId: str(block.callId) },
        c.truncated || shortened,
      );
    }
    case 'image-ref':
      return { type: 'unsupported', what: 'image' };
    case 'subagent-group':
    case 'subagent':
      return { type: 'unsupported', what: 'subagent' };
    case 'background-task':
      return { type: 'unsupported', what: 'background-task' };
    default:
      return { type: 'unsupported', what: 'unknown' };
  }
}

const ROLES = new Set(['user', 'assistant', 'tool', 'system']);
const UNKNOWN: TranscriptPart = { type: 'unsupported', what: 'unknown' };

/**
 * 1つの件の役割と部品。知らない role は assistant にし、部品はすべて印にする（出所の分からない本文を発言として出さない）。
 * system の件（Orca の知らせ）は本文だけを残し、ほかの部分は印にする。
 */
function messageOf(
  roleValue: unknown,
  blocks: readonly unknown[],
  shortened: boolean,
  terminal = false,
): { role: TranscriptRole; parts: TranscriptPart[] } {
  const role = typeof roleValue === 'string' && ROLES.has(roleValue) ? (roleValue as TranscriptRole) : null;
  if (role === null) return { role: 'assistant', parts: blocks.map(() => UNKNOWN) };
  const parts = blocks.map((b) => blockPart(b, shortened, terminal));
  return { role, parts: role === 'system' ? parts.map((p) => (p.type === 'text' ? p : UNKNOWN)) : parts };
}

/** 端末のエージェントの件（nativeChat.readSession の messages）。並べ替えない。思考を落とす。 */
export function normalizeNativeMessages(messages: readonly unknown[]): TranscriptMessage[] | null {
  const out: TranscriptMessage[] = [];
  for (const m of messages) {
    if (!isRecord(m) || typeof m.id !== 'string' || !Array.isArray(m.blocks)) return null;
    if (m.role === 'reasoning') continue;
    const { role, parts } = messageOf(m.role, m.blocks, m.shortened === true, true);
    if (parts.length === 0) continue;
    const undelivered = role === 'user' && UNDELIVERED_FLAGS.some((flag) => Boolean(m[flag]));
    const fromAgent = role === 'user' && isRecord(m.from) && m.from.kind === 'agent';
    out.push({
      id: m.id,
      role,
      at: toIso(m.timestamp),
      parts,
      ...(undelivered ? { undelivered: true as const } : {}),
      ...(fromAgent ? { fromAgent: true as const } : {}),
    });
  }
  return out;
}

// ---- 質問（Orca v1.4.261 の agent-session-question-answer.ts、native-chat-ask.ts、agent-question-answered-intent.ts に合わせる） ----

/** 構造化 Chat の質問の答え。Orca の AgentSessionQuestionAnswer と同じ形（other は任意で、切らない）。 */
export interface JournalQuestionAnswer {
  questionId: string;
  optionIds: string[];
  other?: string;
}

/** journal の question の項目を読んだもの。answers は Orca の生の答え（表示用に切らない）。 */
export interface ParsedJournalQuestion {
  prompt: { itemId: string; revision: number };
  questions: QuestionView[];
  state: QuestionState;
  answers: JournalQuestionAnswer[] | null;
  /** 問いの文・ラベル・説明を上限で切ったか。 */
  truncated: boolean;
}

/** Orca の isAskUserQuestionTool と同じ判定（英数字だけを小文字にする）。request_user_input_async は含まない。 */
export function isAskUserQuestionTool(name: string): boolean {
  const normalized = name.replaceAll(/[^a-z0-9]/gi, '').toLowerCase();
  return normalized === 'askuserquestion' || normalized === 'requestuserinput';
}

/** 名前の英数字だけを小文字にしたものが requestuserinputasync（Orca の CODEX_ASYNC_QUESTION_TOOL）。 */
export function isAsyncQuestionTool(name: string): boolean {
  return name.replaceAll(/[^a-z0-9]/gi, '').toLowerCase() === 'requestuserinputasync';
}

class Clipper {
  truncated = false;
  clip(text: string, max: number): string {
    if (text.length <= max) return text;
    this.truncated = true;
    return text.slice(0, max);
  }
}

const SINGLE_QUESTION_ID = 'q1';
const GROUP_ANSWER_PREFIX = 'question-group:';
const RESOLUTION_STATES: Readonly<Record<string, QuestionState>> = {
  pending: 'pending',
  resolved: 'answered',
  cancelled: 'cancelled',
};

const optStr = (value: unknown): string | null | undefined =>
  value === undefined ? undefined : typeof value === 'string' ? value : null;

/** journal の選択肢。id と label は文字、description は任意の文字。違えば null。 */
function journalOptions(raw: unknown, c: Clipper): QuestionOptionView[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_QUESTION_OPTIONS) return null;
  const out: QuestionOptionView[] = [];
  for (const o of raw) {
    if (!isRecord(o) || typeof o.id !== 'string' || o.id.length === 0 || typeof o.label !== 'string') return null;
    const description = optStr(o.description);
    if (description === null) return null;
    out.push({
      id: o.id,
      label: c.clip(o.label, MAX_QUESTION_LABEL_CHARS),
      description: description === undefined ? null : c.clip(description, MAX_QUESTION_DESCRIPTION_CHARS),
    });
  }
  return out;
}

interface RawJournalQuestion {
  id: unknown;
  question: unknown;
  header?: unknown;
  multiSelect?: unknown;
  options: unknown;
  freeTextQuestionId?: unknown;
  freeTextInput?: unknown;
}

function journalQuestion(raw: RawJournalQuestion, c: Clipper): QuestionView | null {
  if (typeof raw.id !== 'string' || raw.id.length === 0 || typeof raw.question !== 'string') return null;
  const header = optStr(raw.header);
  const freeTextQuestionId = optStr(raw.freeTextQuestionId);
  if (header === null || freeTextQuestionId === null) return null;
  if (raw.multiSelect !== undefined && typeof raw.multiSelect !== 'boolean') return null;
  if (raw.freeTextInput !== undefined && !isRecord(raw.freeTextInput)) return null;
  const options = journalOptions(raw.options, c);
  if (options === null) return null;
  return {
    id: raw.id,
    header: header === undefined ? null : c.clip(header, MAX_QUESTION_LABEL_CHARS),
    question: c.clip(raw.question, MAX_QUESTION_CHARS),
    multiSelect: raw.multiSelect === true,
    options,
    allowOther: freeTextQuestionId !== undefined && freeTextQuestionId.length > 0,
    otherAllowsEmpty: isRecord(raw.freeTextInput) && raw.freeTextInput.allowEmpty === true,
    preview: false,
  };
}

/** Orca の agentSessionPromptQuestions と同じ規則：questions があればそれ、なければ項目そのものを1問にする。 */
function journalQuestions(body: Record<string, unknown>, c: Clipper): QuestionView[] | null {
  if (typeof body.question !== 'string' || !Array.isArray(body.options)) return null;
  if (body.questions !== undefined) {
    if (!Array.isArray(body.questions) || body.questions.length === 0 || body.questions.length > MAX_QUESTIONS)
      return null;
    const out: QuestionView[] = [];
    for (const q of body.questions) {
      if (!isRecord(q)) return null;
      const view = journalQuestion(q as unknown as RawJournalQuestion, c);
      if (view === null) return null;
      out.push(view);
    }
    // 外の項目の選択肢も形だけは確かめる（Orca の型では必ずある）。
    return journalOptions(body.options, new Clipper()) === null ? null : out;
  }
  const freeTextQuestionId = optStr(body.freeTextQuestionId);
  if (freeTextQuestionId === null) return null;
  const view = journalQuestion(
    {
      id: freeTextQuestionId ?? SINGLE_QUESTION_ID,
      question: body.question,
      multiSelect: false,
      options: body.options,
      freeTextQuestionId,
      freeTextInput: body.freeTextInput,
    },
    c,
  );
  return view === null ? null : [view];
}

/** 答えの形（questionId、optionIds、任意の other）。違えば null。 */
function answerOf(value: unknown): JournalQuestionAnswer | null {
  if (!isRecord(value) || typeof value.questionId !== 'string' || !Array.isArray(value.optionIds)) return null;
  if (!value.optionIds.every((id) => typeof id === 'string')) return null;
  if (value.other !== undefined && typeof value.other !== 'string') return null;
  return {
    questionId: value.questionId,
    optionIds: [...(value.optionIds as string[])],
    ...(typeof value.other === 'string' ? { other: value.other } : {}),
  };
}

function answersOf(value: unknown): JournalQuestionAnswer[] | null {
  if (!Array.isArray(value)) return null;
  const out: JournalQuestionAnswer[] = [];
  for (const v of value) {
    const a = answerOf(v);
    if (a === null) return null;
    out.push(a);
  }
  return out;
}

function decodeGroupedAnswers(encoded: string): JournalQuestionAnswer[] | null {
  if (!encoded.startsWith(GROUP_ANSWER_PREFIX)) return null;
  try {
    return answersOf(JSON.parse(decodeURIComponent(encoded.slice(GROUP_ANSWER_PREFIX.length))));
  } catch {
    return null;
  }
}

function decodeFreeText(optionId: string): { questionId: string; answer: string } | null {
  const separator = optionId.indexOf(':');
  if (separator <= 0) return null;
  try {
    return {
      questionId: decodeURIComponent(optionId.slice(0, separator)),
      answer: decodeURIComponent(optionId.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

/** Orca の legacyAgentSessionQuestionAnswers と同じ規則で、古い形の selectedOptionId を解く。解けなければ null。 */
function legacyAnswers(body: Record<string, unknown>, questions: QuestionView[], optionId: string) {
  const grouped = body.questions !== undefined ? decodeGroupedAnswers(optionId) : null;
  if (grouped) return grouped;
  const questionId = questions.length === 1 ? (questions[0] as QuestionView).id : null;
  if (questionId === null) return null;
  const options = Array.isArray(body.options) ? body.options : [];
  if (options.some((o) => isRecord(o) && o.id === optionId)) return [{ questionId, optionIds: [optionId] }];
  const freeText = decodeFreeText(optionId);
  const freeTextQuestionId = typeof body.freeTextQuestionId === 'string' ? body.freeTextQuestionId : '';
  const allowEmpty = isRecord(body.freeTextInput) && body.freeTextInput.allowEmpty === true;
  return freeTextQuestionId &&
    freeText?.questionId === freeTextQuestionId &&
    (freeText.answer.trim().length > 0 || allowEmpty)
    ? [{ questionId, optionIds: [], other: freeText.answer }]
    : null;
}

/**
 * journal の question の項目（agentSession.history の page.items の1件）を読む。知らない形なら null（F-03）。
 * 会話の正規化と、答えの送信の読み（`readQuestion`）が共有する。
 */
export function parseJournalQuestion(item: unknown): ParsedJournalQuestion | null {
  if (!isRecord(item) || typeof item.itemId !== 'string' || item.itemId.length === 0 || !isRecord(item.body))
    return null;
  const body = item.body;
  if (body.kind !== 'question') return null;
  const revision = item.revision;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision <= 0) return null;
  const resolution = body.resolution;
  if (!isRecord(resolution) || typeof resolution.state !== 'string') return null;
  const state = Object.hasOwn(RESOLUTION_STATES, resolution.state) ? RESOLUTION_STATES[resolution.state] : undefined;
  if (state === undefined) return null;
  const c = new Clipper();
  const questions = journalQuestions(body, c);
  if (questions === null) return null;
  let answers: JournalQuestionAnswer[] | null = null;
  if (resolution.answers !== undefined) {
    answers = answersOf(resolution.answers);
    if (answers === null) return null;
  } else if (typeof resolution.selectedOptionId === 'string') {
    answers = legacyAnswers(body, questions, resolution.selectedOptionId);
  }
  return {
    prompt: { itemId: item.itemId, revision },
    questions,
    state,
    answers: state === 'answered' ? answers : null,
    truncated: c.truncated,
  };
}

function journalQuestionPart(item: Record<string, unknown>): TranscriptPart {
  const parsed = parseJournalQuestion(item);
  if (parsed === null) return QUESTION_UNSUPPORTED;
  const c = new Clipper();
  const answers =
    parsed.answers?.map((a) => ({
      questionId: a.questionId,
      optionIds: a.optionIds,
      other: a.other === undefined ? null : c.clip(a.other, MAX_QUESTION_OTHER_CHARS),
    })) ?? null;
  return withTruncated<QuestionPart>(
    {
      type: 'question',
      source: 'chat',
      answerVia: 'rpc',
      prompt: parsed.prompt,
      callId: null,
      questions: parsed.questions,
      state: parsed.state,
      answers,
    },
    parsed.truncated || c.truncated || item.shortened === true,
  );
}

/** 物か JSON の文字の入力を物にする。読めなければ undefined。 */
function inputValue(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input);
  } catch {
    return undefined;
  }
}

/** Orca の askOptionPreview と同じ：空白だけでない preview の文字。 */
const hasPreview = (option: unknown): boolean =>
  isRecord(option) && typeof option.preview === 'string' && /\S/.test(option.preview);

/**
 * Orca の parseCanonicalQuestionsInput と同じ規則（question か title、header、multiSelect か multiple・multi、options はラベルの文字か {label, description}、
 * 単一選択で preview のある選択肢があれば preview）。preview のない問いはその他の文（Claude の Type something、Codex のメモ）を許す。
 */
function terminalQuestions(input: unknown, c: Clipper): QuestionView[] | null {
  const value = inputValue(input);
  if (!isRecord(value) || !Array.isArray(value.questions) || value.questions.length === 0) return null;
  const out: QuestionView[] = [];
  for (const raw of value.questions) {
    if (!isRecord(raw)) continue;
    const text = typeof raw.question === 'string' ? raw.question : typeof raw.title === 'string' ? raw.title : '';
    const multiSelect = 'multiSelect' in raw ? raw.multiSelect === true : raw.multiple === true || raw.multi === true;
    const options: QuestionOptionView[] = [];
    for (const o of Array.isArray(raw.options) ? raw.options : []) {
      const label = typeof o === 'string' ? o : isRecord(o) && typeof o.label === 'string' ? o.label : null;
      if (label === null) continue;
      const description = isRecord(o) && typeof o.description === 'string' ? o.description : null;
      options.push({
        id: String(options.length),
        label: c.clip(label, MAX_QUESTION_LABEL_CHARS),
        description: description === null ? null : c.clip(description, MAX_QUESTION_DESCRIPTION_CHARS),
      });
    }
    if (!text && options.length === 0) continue;
    if (options.length > MAX_QUESTION_OPTIONS) return null;
    const preview = !multiSelect && Array.isArray(raw.options) && raw.options.some(hasPreview);
    out.push({
      id: String(out.length),
      header: typeof raw.header === 'string' ? c.clip(raw.header, MAX_QUESTION_LABEL_CHARS) : null,
      question: c.clip(text, MAX_QUESTION_CHARS),
      multiSelect,
      options,
      allowOther: !preview,
      otherAllowsEmpty: false,
      preview,
    });
  }
  return out.length > 0 && out.length <= MAX_QUESTIONS ? out : null;
}

/** 端末の質問のツールの入力（会話の記録の呼び出し、またはタブの agentStatus の interactivePrompt）を問いにする。読めなければ null。 */
export function parseTerminalQuestions(input: unknown): { questions: QuestionView[]; truncated: boolean } | null {
  const c = new Clipper();
  const questions = terminalQuestions(input, c);
  return questions === null ? null : { questions, truncated: c.truncated };
}

/** 端末のエージェントの質問のツールの呼び出しを question の部分にする。読めなければ null（ツールの呼び出しのまま）。 */
function terminalQuestionPart(input: unknown, callId: string | null, shortened: boolean): QuestionPart | null {
  const parsed = parseTerminalQuestions(input);
  if (parsed === null) return null;
  return withTruncated<QuestionPart>(
    {
      type: 'question',
      source: 'terminal',
      answerVia: 'keys',
      prompt: null,
      callId,
      questions: parsed.questions,
      state: 'pending',
      answers: null,
    },
    parsed.truncated || shortened,
  );
}

/** Orca の parseCodexAsyncQuestionsInput と同じ規則（questions の各要素の title が文字なら問い、options の文字だけを選択肢）。 */
function asyncQuestions(input: unknown, c: Clipper): QuestionView[] | null {
  const value = inputValue(input);
  if (!isRecord(value) || !('questions' in value)) return null;
  const out: QuestionView[] = [];
  for (const raw of Array.isArray(value.questions) ? value.questions : []) {
    if (!isRecord(raw) || typeof raw.title !== 'string') continue;
    const labels = (Array.isArray(raw.options) ? raw.options : []).filter((o): o is string => typeof o === 'string');
    if (labels.length > MAX_QUESTION_OPTIONS) return null;
    out.push({
      id: String(out.length),
      header: null,
      question: c.clip(raw.title, MAX_QUESTION_CHARS),
      multiSelect: false,
      options: labels.map((label, i) => ({
        id: String(i),
        label: c.clip(label, MAX_QUESTION_LABEL_CHARS),
        description: null,
      })),
      allowOther: true,
      otherAllowsEmpty: false,
      preview: false,
    });
  }
  return out.length > 0 && out.length <= MAX_QUESTIONS ? out : null;
}

/** request_user_input_async の呼び出しを、後の発言で答える question の部分にする。読めなければ null。 */
function asyncQuestionPart(
  input: unknown,
  callId: string | null,
  shortened: boolean,
  source: QuestionPart['source'],
): QuestionPart | null {
  const c = new Clipper();
  const questions = asyncQuestions(input, c);
  if (questions === null) return null;
  return withTruncated<QuestionPart>(
    {
      type: 'question',
      source,
      answerVia: 'message',
      prompt: null,
      callId,
      questions,
      state: 'pending',
      answers: null,
    },
    c.truncated || shortened,
  );
}

// ---- 承認（Orca v1.4.261 の agent-session-journal-types.ts、agent-session-approval-subject.ts、
// agent-session-approval-blocked-path.ts、agent-session-approval-detail-preview.ts に合わせる） ----

const APPROVAL_UNSUPPORTED: TranscriptPart = { type: 'unsupported', what: 'approval' };
const APPROVAL_INTENTS: ReadonlySet<string> = new Set(['allow_once', 'allow_always', 'reject_once', 'reject_always']);

/** Orca の approvalDetailPreview と同じ下見（先頭 512 字・4 行）。 */
export function approvalDetailPreview(detail: string): string {
  const prefix = detail.slice(0, 512).split('\n', 4).join('\n');
  if (prefix.length === detail.length || prefix.trimEnd() === detail.trimEnd()) return detail;
  return `${prefix.replace(/[\uD800-\uDBFF]$/, '').trimEnd()}…`;
}

const PATH_END = /[\s'"`/\\]/;

/** Orca の containsWholePath と同じ判定（長い名前の一部は数えない）。 */
function containsWholePath(text: string, path: string): boolean {
  for (let at = text.indexOf(path); at !== -1; at = text.indexOf(path, at + 1)) {
    const next = text[at + path.length];
    if (next === undefined || PATH_END.test(next)) return true;
  }
  return false;
}

/** Orca の approvalBlockedPathToShow と同じく、カードのほかの文に同じパスが出ていれば null。 */
function blockedPathToShow(
  path: string | undefined,
  texts: {
    description: string | undefined;
    reason: string | undefined;
    plan: { text: string; filePath?: string } | null;
    detail: string | null;
  },
): string | null {
  if (!path) return null;
  const forms = [path, JSON.stringify(path).slice(1, -1)];
  const drawn = texts.plan
    ? [texts.plan.text, texts.plan.filePath]
    : [texts.detail === null ? undefined : approvalDetailPreview(texts.detail)];
  const shown = [texts.description, texts.reason, ...drawn].some(
    (t) => t !== undefined && forms.some((form) => containsWholePath(t, form)),
  );
  return shown ? null : path;
}

function approvalOptions(raw: unknown, c: Clipper): ApprovalOptionView[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_APPROVAL_OPTIONS) return null;
  const out: ApprovalOptionView[] = [];
  for (const o of raw) {
    if (!isRecord(o) || typeof o.id !== 'string' || o.id.length === 0) return null;
    if (typeof o.label !== 'string' || o.label.length === 0) return null;
    const description = optStr(o.description);
    if (description === null) return null;
    out.push({
      id: o.id,
      label: c.clip(o.label, MAX_APPROVAL_LABEL_CHARS),
      description: description === undefined ? null : c.clip(description, MAX_APPROVAL_DESCRIPTION_CHARS),
      intent: typeof o.intent === 'string' && APPROVAL_INTENTS.has(o.intent) ? (o.intent as ApprovalIntent) : null,
    });
  }
  return out;
}

/**
 * journal の approval の項目（agentSession.history の page.items の1件）を部分にする。知らない形なら null（F-03）。
 * 会話の正規化と、承認の答えの送信の読み（`readApproval`）が共有する。
 */
export function parseJournalApproval(item: unknown): ApprovalPart | null {
  if (!isRecord(item) || typeof item.itemId !== 'string' || item.itemId.length === 0 || !isRecord(item.body))
    return null;
  const body = item.body;
  if (body.kind !== 'approval' || typeof body.title !== 'string') return null;
  const revision = item.revision;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision <= 0) return null;
  const resolution = body.resolution;
  if (!isRecord(resolution) || typeof resolution.state !== 'string') return null;
  const state = Object.hasOwn(RESOLUTION_STATES, resolution.state) ? RESOLUTION_STATES[resolution.state] : undefined;
  if (state === undefined) return null;
  if (body.detail !== null && typeof body.detail !== 'string') return null;
  const displayName = optStr(body.displayName);
  const description = optStr(body.description);
  const reason = optStr(body.decisionReason);
  const blockedPath = optStr(body.blockedPath);
  if (displayName === null || description === null || reason === null || blockedPath === null) return null;
  const c = new Clipper();
  const options = approvalOptions(body.options, c);
  if (options === null) return null;
  const subject = body.subject;
  let plan: { text: string; filePath?: string } | null = null;
  let unanswerableReason: ApprovalUnanswerableReason | null = null;
  if (subject !== undefined) {
    if (isRecord(subject) && subject.kind === 'plan' && typeof subject.text === 'string') {
      const filePath = optStr(subject.filePath);
      if (filePath === null) unanswerableReason = 'newer_subject';
      else plan = { text: subject.text, ...(filePath === undefined ? {} : { filePath }) };
    } else {
      unanswerableReason = isRecord(subject) && subject.kind === 'url' ? 'url' : 'newer_subject';
    }
  }
  if (unanswerableReason === null && options.length === 0) unanswerableReason = 'newer_subject';
  const detail = body.detail as string | null;
  const path = blockedPathToShow(blockedPath, { description, reason, plan, detail });
  const selected =
    state === 'answered' && typeof resolution.selectedOptionId === 'string' ? resolution.selectedOptionId : null;
  return withTruncated<ApprovalPart>(
    {
      type: 'approval',
      source: 'chat',
      prompt: { itemId: item.itemId, revision },
      title: c.clip(body.title, MAX_APPROVAL_LABEL_CHARS),
      tool: displayName === undefined ? null : c.clip(displayName, MAX_APPROVAL_LABEL_CHARS),
      description: description === undefined ? null : c.clip(description, MAX_APPROVAL_DESCRIPTION_CHARS),
      reason: reason === undefined ? null : c.clip(reason, MAX_APPROVAL_DESCRIPTION_CHARS),
      blockedPath: path === null ? null : c.clip(path, MAX_APPROVAL_PATH_CHARS),
      plan: plan
        ? {
            text: c.clip(plan.text, MAX_APPROVAL_PLAN_CHARS),
            filePath: plan.filePath === undefined ? null : c.clip(plan.filePath, MAX_APPROVAL_PATH_CHARS),
          }
        : null,
      detail: detail === null ? null : c.clip(detail, MAX_APPROVAL_DETAIL_CHARS),
      options,
      answerable: unanswerableReason === null,
      unanswerableReason,
      state,
      selectedOptionId: selected !== null && options.some((o) => o.id === selected) ? selected : null,
    },
    c.truncated || item.shortened === true,
  );
}

const WAITING_STATES: ReadonlySet<unknown> = new Set(['blocked', 'waiting']);

/** 端末のエージェントの待っている許可の確認（タブの agentStatus の3つの項目）を、会話の最後の件にする。読めなければ null（F-05）。 */
function terminalApprovalMessage(prompt: RawPage['terminalPrompt']): TranscriptMessage | null {
  if (!isRecord(prompt) || !WAITING_STATES.has(prompt.state) || typeof prompt.interactivePrompt !== 'string')
    return null;
  let value: unknown;
  try {
    value = JSON.parse(prompt.interactivePrompt);
  } catch {
    return null;
  }
  if (!isRecord(value) || !isRecord(value.approval)) return null;
  const { tool, summary } = value.approval;
  if (typeof tool !== 'string' || tool.length === 0) return null;
  const c = new Clipper();
  const part = withTruncated<ApprovalPart>(
    {
      type: 'approval',
      source: 'terminal',
      prompt: null,
      title: null,
      tool: c.clip(tool, MAX_APPROVAL_LABEL_CHARS),
      description: typeof summary === 'string' ? c.clip(summary, MAX_APPROVAL_DESCRIPTION_CHARS) : null,
      reason: null,
      blockedPath: null,
      plan: null,
      detail: null,
      options: [],
      answerable: false,
      unanswerableReason: 'terminal',
      state: 'pending',
      selectedOptionId: null,
    },
    c.truncated,
  );
  return { id: 'pending-approval', role: 'assistant', at: toIso(prompt.stateStartedAt), parts: [part] };
}

/** 出さない journal の kind（会話の本文ではない）。 */
const HIDDEN_KINDS = new Set(['turn', 'agent-start', 'agent-handoff']);

const position = (item: Record<string, unknown>): [number, number] => [
  typeof item.sequence === 'number' ? item.sequence : 0,
  typeof item.sequenceIndex === 'number' ? item.sequenceIndex : 0,
];

/** 構造化 Chat の件（agentSession.history の page.items）。journal の位置の順に並べる。 */
export function normalizeJournalItems(items: readonly unknown[]): TranscriptMessage[] | null {
  const records: Record<string, unknown>[] = [];
  for (const item of items) {
    if (!isRecord(item) || typeof item.itemId !== 'string' || !isRecord(item.body)) return null;
    records.push(item);
  }
  records.sort((a, b) => {
    const [as, ai] = position(a);
    const [bs, bi] = position(b);
    return as - bs || ai - bi;
  });
  const out: TranscriptMessage[] = [];
  for (const item of records) {
    const body = item.body as Record<string, unknown>;
    const kind = body.kind;
    if (typeof kind === 'string' && HIDDEN_KINDS.has(kind)) continue;
    const id = item.itemId as string;
    const at = toIso(item.observedAt);
    const shortened = item.shortened === true;
    if (kind === 'message') {
      if (body.role === 'reasoning') continue;
      const { role, parts } = messageOf(body.role, Array.isArray(body.blocks) ? body.blocks : [], shortened);
      if (parts.length) out.push({ id, role, at, parts });
      continue;
    }
    if (kind === 'tool-call') {
      const call = blockPart(
        { type: 'tool-call', name: body.name, input: body.input, callId: body.callId, state: body.state },
        shortened,
      );
      const parts: TranscriptPart[] = [call];
      if (isRecord(body.output)) {
        const c = clipText(str(body.output.head) ?? '', MAX_TOOL_OUTPUT_CHARS);
        parts.push(
          withTruncated(
            { type: 'tool-result', output: c.text, isError: body.state === 'failed', callId: str(body.callId) },
            c.truncated || shortened || body.output.truncated === true,
          ),
        );
      }
      out.push({ id, role: 'tool', at, parts });
      continue;
    }
    if (kind === 'question') {
      out.push({ id, role: 'assistant', at, parts: [journalQuestionPart(item)] });
      continue;
    }
    if (kind === 'approval') {
      out.push({ id, role: 'assistant', at, parts: [parseJournalApproval(item) ?? APPROVAL_UNSUPPORTED] });
      continue;
    }
    const what = typeof kind === 'string' && JOURNAL_UNSUPPORTED.has(kind) ? (kind as UnsupportedWhat) : 'unknown';
    out.push({ id, role: 'assistant', at, parts: [{ type: 'unsupported', what }] });
  }
  return out;
}

export interface TranscriptDocument {
  schema: typeof TRANSCRIPT_SCHEMA;
  ok: true;
  agent: { id: string; agentType: string };
  session: { key: string; short: string; source: TranscriptSource };
  messages: TranscriptMessage[];
  hasMore: boolean;
  /** より古いページを読む不透明な位置（セッションの鍵を含む）。なければ null。 */
  before: string | null;
  readAt: string;
}

/** ページを正規化する。端末の最新のページに待っている許可の確認が添えてあれば、会話の最後に端末の承認の件を足す。 */
export function normalizePage(page: RawPage): TranscriptMessage[] | null {
  if (page.source !== 'nativeChat') return normalizeJournalItems(page.rows);
  const messages = normalizeNativeMessages(page.rows);
  const approval = messages === null ? null : terminalApprovalMessage(page.terminalPrompt);
  return approval && messages ? [...messages, approval] : messages;
}

export function encodeBefore(key: string, position: PagePosition): string {
  return Buffer.from(JSON.stringify({ k: key, p: position }), 'utf8').toString('base64url');
}

const MAX_BEFORE_CHARS = 1024;

/** 位置を解く。形が違えば null。 */
export function decodeBefore(token: string): { key: string; position: PagePosition } | null {
  if (token.length === 0 || token.length > MAX_BEFORE_CHARS || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.k !== 'string' || !/^[0-9a-f]{16}$/.test(value.k) || !isRecord(value.p))
    return null;
  const p = value.p;
  if (Number.isInteger(p.offset) && (p.offset as number) >= 0 && Object.keys(p).length === 1) {
    return { key: value.k, position: { offset: p.offset as number } };
  }
  const c = p.cursor;
  if (
    Object.keys(p).length === 1 &&
    isRecord(c) &&
    typeof c.epoch === 'string' &&
    c.epoch.length > 0 &&
    c.epoch.length <= 256 &&
    Number.isInteger(c.sequence) &&
    (c.sequence as number) >= 0
  ) {
    return { key: value.k, position: { cursor: { epoch: c.epoch, sequence: c.sequence as number } } };
  }
  return null;
}

export function buildDocument(
  target: TranscriptTarget,
  page: RawPage,
  messages: TranscriptMessage[],
  readAt: Date,
): TranscriptDocument {
  return {
    schema: TRANSCRIPT_SCHEMA,
    ok: true,
    agent: { id: target.agentId, agentType: target.agentType },
    session: { key: target.key, short: target.sessionId.slice(0, 8), source: target.source },
    messages,
    hasMore: page.hasMore,
    before: page.before ? encodeBefore(target.key, page.before) : null,
    readAt: readAt.toISOString(),
  };
}
