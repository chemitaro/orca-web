// 確認つきの送信だけを通す RPC の門。読む門の許可一覧は広げない。
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

function chatSend(params: unknown): boolean {
  if (!hasKeys(params, ['envelope', 'body'])) return false;
  const { envelope, body } = params;
  if (
    !hasKeys(envelope, ['sessionId', 'clientOperationId', 'expectedRuntimeFence', 'payloadFingerprint']) ||
    !isText(envelope.sessionId) ||
    !isOperationId(envelope.clientOperationId) ||
    !Number.isInteger(envelope.expectedRuntimeFence) ||
    (envelope.expectedRuntimeFence as number) <= 0 ||
    typeof envelope.payloadFingerprint !== 'string' ||
    !/^[0-9a-f]{64}$/.test(envelope.payloadFingerprint)
  )
    return false;
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

export class SendRpc implements RpcTransport {
  readonly #transport: RpcTransport;

  constructor(transport: RpcTransport) {
    this.#transport = transport;
  }

  call<T = unknown>(method: string, params: unknown, options?: RpcCallOptions): Promise<RpcOutcome<T>> {
    if (
      !(method === 'terminal.send'
        ? terminalSend(params, options)
        : method === 'agentSession.send'
          ? chatSend(params)
          : READ_METHODS.includes(method) || SEND_READ_METHODS.includes(method))
    ) {
      return Promise.reject(new Error(`${method} is not allowed for sending`));
    }
    return this.#transport.call<T>(method, params, options);
  }
}
