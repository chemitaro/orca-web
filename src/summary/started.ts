import type { StateDocument } from '../state/model.ts';

/**
 * orca-web がエージェントの id を要約の道で初めて見たときの、状態の始まりの時刻の記憶。
 * 状態が変わっても動かさず、id が状態の文書から消えたら忘れる。時計に触れない。
 */
export class FirstSeenStartTimes {
  readonly #times = new Map<string, string>();

  /** 状態の文書を見て記憶を更新し、覚えている表（id → ISO 8601）を返す。 */
  observe(state: StateDocument): ReadonlyMap<string, string> {
    const present = new Set<string>();
    for (const agent of state.agents) {
      present.add(agent.id);
      const started = agent.stateStartedAt.value;
      if (!this.#times.has(agent.id) && started !== null) this.#times.set(agent.id, started);
    }
    for (const id of this.#times.keys()) if (!present.has(id)) this.#times.delete(id);
    return this.#times;
  }
}
