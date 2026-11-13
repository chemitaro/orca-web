// 共有の見張り。エージェントの id ごとに1つの見張りが、末尾を短い間隔で読み直し、前の窓との差を購読者に配る。
// Orca の Unix ソケットは購読の口（streaming の method）を拒むので、読み直しで追記と置き換えを作る。
// 見る人がいなくなったら見張りを止める。窓はセッションの鍵ごとに持ち、鍵が変われば置き換えにする（別の会話を混ぜない）。
import type { TranscriptErrorCode, TranscriptReader, TranscriptTarget } from '../orca/read-transcript.ts';
import { diffWindow } from './diff.ts';
import { buildDocument, normalizePage, type TranscriptDocument, type TranscriptMessage } from './normalize.ts';

export type HubErrorCode = TranscriptErrorCode | 'busy';

export type TranscriptEvent =
  | { type: 'snapshot'; document: TranscriptDocument }
  | { type: 'replacement'; reason: 'session-changed' | 'recovered' | 'rewritten'; document: TranscriptDocument }
  | { type: 'appended'; session: { key: string }; items: TranscriptMessage[]; updated: TranscriptMessage[] }
  | { type: 'unavailable'; error: HubErrorCode };

export type Listener = (event: TranscriptEvent) => void;

export interface HubOptions {
  reader: TranscriptReader;
  now?: () => number;
  /** 末尾を読む間隔。既定 1.5秒。0 なら時計を使わない（テストは tick() を呼ぶ）。 */
  tailIntervalMs?: number;
  resolveIntervalMs?: number;
  limit?: number;
  maxWatches?: number;
  maxSubscribers?: number;
}

interface Watch {
  agentId: string;
  listeners: Set<Listener>;
  target: TranscriptTarget | null;
  resolvedAt: number;
  window: TranscriptMessage[] | null;
  document: TranscriptDocument | null;
  error: HubErrorCode | null;
  sent: boolean;
  polling: Promise<void> | null;
}

export type Subscription = { ok: true; unsubscribe: () => void } | { ok: false; error: 'busy' };

export class TranscriptHub {
  readonly #reader: TranscriptReader;
  readonly #now: () => number;
  readonly #tailMs: number;
  readonly #resolveMs: number;
  readonly #limit: number;
  readonly #maxWatches: number;
  readonly #maxSubscribers: number;
  readonly #watches = new Map<string, Watch>();
  #subscribers = 0;
  #timer: NodeJS.Timeout | null = null;
  #closed = false;

  constructor(options: HubOptions) {
    this.#reader = options.reader;
    this.#now = options.now ?? Date.now;
    this.#tailMs = options.tailIntervalMs ?? 1_500;
    this.#resolveMs = options.resolveIntervalMs ?? 5_000;
    this.#limit = options.limit ?? 40;
    this.#maxWatches = options.maxWatches ?? 8;
    this.#maxSubscribers = options.maxSubscribers ?? 32;
  }

  get watchCount(): number {
    return this.#watches.size;
  }

  get subscriberCount(): number {
    return this.#subscribers;
  }

  subscribe(agentId: string, listener: Listener): Subscription {
    if (this.#closed || this.#subscribers >= this.#maxSubscribers) return { ok: false, error: 'busy' };
    let watch = this.#watches.get(agentId);
    if (!watch) {
      if (this.#watches.size >= this.#maxWatches) return { ok: false, error: 'busy' };
      watch = {
        agentId,
        listeners: new Set(),
        target: null,
        resolvedAt: 0,
        window: null,
        document: null,
        error: null,
        sent: false,
        polling: null,
      };
      this.#watches.set(agentId, watch);
    }
    watch.listeners.add(listener);
    this.#subscribers++;
    if (watch.document) listener({ type: 'snapshot', document: watch.document });
    else if (watch.error) listener({ type: 'unavailable', error: watch.error });
    else void this.#poll(watch);
    this.#arm();
    const w = watch;
    let active = true;
    return {
      ok: true,
      unsubscribe: () => {
        if (!active) return;
        active = false;
        if (this.#closed) return;
        w.listeners.delete(listener);
        this.#subscribers--;
        if (w.listeners.size === 0) this.#watches.delete(w.agentId);
        this.#arm();
      },
    };
  }

  /** すべての見張りを1回読む（時計の代わり）。 */
  async tick(): Promise<void> {
    await Promise.all([...this.#watches.values()].map((w) => this.#poll(w)));
  }

  close(): void {
    this.#closed = true;
    for (const w of this.#watches.values()) w.listeners.clear();
    this.#watches.clear();
    this.#subscribers = 0;
    this.#arm();
  }

  #arm(): void {
    const want = this.#watches.size > 0 && this.#tailMs > 0 && !this.#closed;
    if (want && !this.#timer) {
      this.#timer = setInterval(() => void this.tick(), this.#tailMs);
      this.#timer.unref();
    } else if (!want && this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  #emit(watch: Watch, event: TranscriptEvent): void {
    watch.sent = true;
    for (const l of [...watch.listeners]) l(event);
  }

  #fail(watch: Watch, error: HubErrorCode): void {
    watch.window = null;
    watch.document = null;
    if (watch.error === error) return;
    watch.error = error;
    this.#emit(watch, { type: 'unavailable', error });
  }

  #poll(watch: Watch): Promise<void> {
    if (!watch.polling) {
      watch.polling = this.#read(watch).finally(() => {
        watch.polling = null;
      });
    }
    return watch.polling;
  }

  async #read(watch: Watch): Promise<void> {
    let sessionChanged = false;
    if (!watch.target || this.#now() - watch.resolvedAt >= this.#resolveMs) {
      const resolved = await this.#reader.resolve(watch.agentId);
      if (this.#watches.get(watch.agentId) !== watch) return;
      watch.resolvedAt = this.#now();
      if (!resolved.ok) {
        watch.target = null;
        this.#fail(watch, resolved.error);
        return;
      }
      sessionChanged = watch.target !== null && watch.target.key !== resolved.target.key;
      watch.target = resolved.target;
    }
    const target = watch.target;
    const read = await this.#reader.read(target, { limit: this.#limit });
    if (this.#watches.get(watch.agentId) !== watch) return;
    if (!read.ok) {
      this.#fail(watch, read.error);
      return;
    }
    const messages = normalizePage(read.page);
    if (!messages) {
      this.#fail(watch, 'unknown_shape');
      return;
    }
    const document = buildDocument(target, read.page, messages, new Date(this.#now()));
    const prev = watch.window;
    const prevKey = watch.document?.session.key ?? null;
    const recovered = watch.error !== null;
    watch.window = messages;
    watch.document = document;
    watch.error = null;
    if (!watch.sent) {
      this.#emit(watch, { type: 'snapshot', document });
      return;
    }
    if (prev === null) {
      this.#emit(watch, { type: 'replacement', reason: recovered ? 'recovered' : 'rewritten', document });
      return;
    }
    if (sessionChanged || prevKey !== target.key) {
      this.#emit(watch, { type: 'replacement', reason: 'session-changed', document });
      return;
    }
    const diff = diffWindow(prev, messages, { full: read.page.hasMore });
    if (diff.type === 'appended') {
      this.#emit(watch, { type: 'appended', session: { key: target.key }, items: diff.items, updated: diff.updated });
    } else if (diff.type === 'replacement') {
      this.#emit(watch, { type: 'replacement', reason: 'rewritten', document });
    }
  }
}
