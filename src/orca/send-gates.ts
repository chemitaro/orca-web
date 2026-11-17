// 確認つきの送信と、質問（構造化 Chat の答えと、端末のキーの組）と承認への答えだけを通す RPC の門。読む門の許可一覧は広げない。
import { READ_METHODS, type RpcCallOptions, type RpcOutcome, type RpcTransport } from './rpc.ts';

export const SEND_READ_METHODS: readonly string[] = [
  'terminal.agentStatus',
  'terminal.inspectProcess',
  'orchestration.requestShow',
  'agentSession.sendRecorded',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isOperationId = (value: unknown): boolean => typeof value === 'string' && /^\d{13}-[0-9a-f]{32}$/.test(value);

function terminalSend(params: unknown, options?: RpcCallOptions): boolean {
  return (
    hasKeys(params, ['terminal', 'text', 'enter', 'agentPrompt', 'client', 'waitSubmitMs']) &&
    isText(params.terminal) &&
    params.terminal.startsWith('term_') &&
    isText(params.text) &&
    params.enter === true &&
    params.agentPrompt === true &&
    hasKeys(params.client, ['id', 'type']) &&
    params.client.id === 'orca-web' &&
    params.client.type === 'desktop' &&
    Number.isInteger(params.waitSubmitMs) &&
    (params.waitSubmitMs as number) >= 0 &&
    (params.waitSubmitMs as number) <= 60000 &&
    isOperationId(options?.envelope?.orchestrationRequestId)
  );
}

const ESC = '\u001b';
/**
 * 質問への答えのキー（Orca の buildAskAnswerKeys・buildCodexAskAnswerKeys が使う raw の組）と、
 * 端末の承認の答えのキー（allowSend の '1' と denySend の ESC だけ。parseNativeChatApprovalEnvelope）。
 */
const ANSWER_KEYS: ReadonlySet<string> = new Set([
  ...'123456789',
  '\r',
  `${ESC}[C`,
  `${ESC}[A`,
  `${ESC}[B`,
  '\t',
  'n',
  '\x7f',
  ESC,
]);
const PASTE_START = `${ESC}[200~`;
const PASTE_END = `${ESC}[201~`;
const MAX_PLAIN_KEY_TEXT_BYTES = 512;
const MAX_PASTE_KEY_TEXT_BYTES = 70_000;

/** C0（Tab・CR・LF を含む）、DEL、C1 のない文。 */
function isPlainText(text: string): boolean {
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code < 32 || (code >= 127 && code <= 159)) return false;
  }
  return true;
}

/** キーの組の text：決めたキー、1〜512 バイトの制御文字のない文、または括弧付きの貼り付けで包んだ制御文字のない文（全体で 70,000 バイトまで）。 */
function isKeyText(text: unknown): boolean {
  if (typeof text !== 'string' || text.length === 0) return false;
  if (ANSWER_KEYS.has(text)) return true;
  const bytes = Buffer.byteLength(text, 'utf8');
  if (text.startsWith(PASTE_START) && text.endsWith(PASTE_END)) {
    const inner = text.slice(PASTE_START.length, text.length - PASTE_END.length);
    return inner.length > 0 && bytes <= MAX_PASTE_KEY_TEXT_BYTES && isPlainText(inner);
  }
  return bytes <= MAX_PLAIN_KEY_TEXT_BYTES && isPlainText(text);
}

/** 質問への答えのキーの組。enter は偽、書き込みの受け取りを求め、封筒・agentPrompt・requireAgentStatus を付けない。 */
function terminalKeyGroup(params: unknown, options?: RpcCallOptions): boolean {
  return (
    hasKeys(params, ['terminal', 'text', 'enter', 'requireWriteSettlement', 'client']) &&
    isText(params.terminal) &&
    params.terminal.startsWith('term_') &&
    isKeyText(params.text) &&
    params.enter === false &&
    params.requireWriteSettlement === true &&
    hasKeys(params.client, ['id', 'type']) &&
    params.client.id === 'orca-web' &&
    params.client.type === 'desktop' &&
    options?.envelope === undefined
  );
}

function isEnvelope(envelope: unknown): boolean {
  return (
    hasKeys(envelope, ['sessionId', 'clientOperationId', 'expectedRuntimeFence', 'payloadFingerprint']) &&
    isText(envelope.sessionId) &&
    isOperationId(envelope.clientOperationId) &&
    Number.isInteger(envelope.expectedRuntimeFence) &&
    (envelope.expectedRuntimeFence as number) > 0 &&
    typeof envelope.payloadFingerprint === 'string' &&
    /^[0-9a-f]{64}$/.test(envelope.payloadFingerprint)
  );
}

function chatSend(params: unknown): boolean {
  if (!hasKeys(params, ['envelope', 'body'])) return false;
  const { envelope, body } = params;
  if (!isEnvelope(envelope)) return false;
  if (
    !hasKeys(body, ['kind', 'role', 'blocks']) ||
    body.kind !== 'message' ||
    body.role !== 'user' ||
    !Array.isArray(body.blocks) ||
    body.blocks.length !== 1
  )
    return false;
  const block = body.blocks[0];
  return hasKeys(block, ['type', 'text']) && block.type === 'text' && isText(block.text);
}

/** Orca の RespondToQuestionParams の上限（answers は1〜4件、optionIds は64件、id は1024字、other は64KiB）。 */
const MAX_ANSWERS = 4;
const MAX_ANSWER_OPTIONS = 64;
const MAX_ANSWER_ID_CHARS = 1024;
const MAX_ANSWER_OTHER_BYTES = 64 * 1024;

const isAnswerId = (value: unknown): value is string => isText(value) && value.length <= MAX_ANSWER_ID_CHARS;

function isAnswer(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.hasOwn(value, 'other') ? ['questionId', 'optionIds', 'other'] : ['questionId', 'optionIds'];
  return (
    hasKeys(value, keys) &&
    isAnswerId(value.questionId) &&
    Array.isArray(value.optionIds) &&
    value.optionIds.length <= MAX_ANSWER_OPTIONS &&
    value.optionIds.every(isAnswerId) &&
    (!Object.hasOwn(value, 'other') ||
      (typeof value.other === 'string' && Buffer.byteLength(value.other, 'utf8') <= MAX_ANSWER_OTHER_BYTES))
  );
}

/** 質問への答え。古い詰めた形の optionId は通さない。 */
function chatAnswer(params: unknown): boolean {
  return (
    hasKeys(params, ['envelope', 'itemId', 'expectedRevision', 'answers']) &&
    isEnvelope(params.envelope) &&
    isText(params.itemId) &&
    Number.isSafeInteger(params.expectedRevision) &&
    (params.expectedRevision as number) > 0 &&
    Array.isArray(params.answers) &&
    params.answers.length >= 1 &&
    params.answers.length <= MAX_ANSWERS &&
    params.answers.every(isAnswer)
  );
}

/** 承認への答え。Orca の RespondToApprovalParams と同じ形（optionId は1〜1024字）。 */
function chatApproval(params: unknown): boolean {
  return (
    hasKeys(params, ['envelope', 'itemId', 'expectedRevision', 'optionId']) &&
    isEnvelope(params.envelope) &&
    isText(params.itemId) &&
    Number.isSafeInteger(params.expectedRevision) &&
    (params.expectedRevision as number) > 0 &&
    isAnswerId(params.optionId)
  );
}

export class SendRpc implements RpcTransport {
  readonly #transport: RpcTransport;

  constructor(transport: RpcTransport) {
    this.#transport = transport;
  }

  call<T = unknown>(method: string, params: unknown, options?: RpcCallOptions): Promise<RpcOutcome<T>> {
    if (
      !(method === 'terminal.send'
        ? terminalSend(params, options) || terminalKeyGroup(params, options)
        : method === 'agentSession.send'
          ? chatSend(params)
          : method === 'agentSession.respondToQuestion'
            ? chatAnswer(params)
            : method === 'agentSession.respondToApproval'
              ? chatApproval(params)
              : READ_METHODS.includes(method) || SEND_READ_METHODS.includes(method))
    ) {
      return Promise.reject(new Error(`${method} is not allowed for sending`));
    }
    return this.#transport.call<T>(method, params, options);
  }
}
