// 表示できる項目の一覧（固定の表）。id の後ろの部分は、状態の文書の項目の名前と同じ（agent.model は agents[].model）。
export type FieldEntity = 'repo' | 'worktree' | 'agent' | 'worker' | 'task' | 'run';

export interface FieldDef {
  id: string;
  entity: FieldEntity;
  label: string;
  description: string;
  defaultSelected: boolean;
}

const def = (id: string, label: string, description: string, defaultSelected = false): FieldDef => ({
  id,
  entity: id.split('.')[0] as FieldEntity,
  label,
  description,
  defaultSelected,
});

export const FIELDS: readonly FieldDef[] = [
  def('worktree.displayName', '表示名', 'Orca の worktree の表示名'),
  def('worktree.branch', 'ブランチ', 'ブランチの名前（refs/heads/ を外す）', true),
  def('worktree.path', 'パス', 'worktree のパス'),
  def('worktree.status', '状態', 'worktree ps の状態（working、active、inactive など）', true),
  def('worktree.lastActivityAt', '最後に動いた時刻', 'Orca の worktree の最後の活動の時刻', true),
  def('worktree.lastOutputAt', '最後の出力の時刻', 'worktree の端末の最後の出力の時刻'),
  def('worktree.pr', 'PR', 'つながった PR の番号、状態、題名', true),
  def('worktree.ci', 'CI', 'PR のチェックの状態と件数', true),
  def('worktree.parentWorktreeId', '親の worktree', 'Orca の親の worktree'),
  def('worktree.childWorktreeIds', '子の worktree', 'Orca の子の worktree'),
  def('worktree.isMainWorktree', 'main か', 'リポジトリの main の worktree か'),
  def('worktree.isArchived', 'アーカイブか', 'アーカイブした worktree か'),
  def('agent.agentType', '種類', 'エージェントの種類（claude、codex など）', true),
  def('agent.state', '状態', 'エージェントの状態（working、waiting、done など）', true),
  def('agent.stateStartedAt', '状態の開始時刻', '今の状態になった時刻', true),
  def('agent.lastOutputAt', '最後の出力の時刻', '端末の最後の出力の時刻（端末の handle で結ぶ）'),
  def('agent.title', '題名', '作業の題名（担当の Task の題名、エージェントの題名、タブの題名の順）', true),
  def('agent.parentPaneKey', '親のエージェント', '親のエージェントの paneKey'),
  def('agent.terminal', '端末', '端末につながっている（attached）か、復元待ち（awaiting-restore）か', true),
  def('agent.worker', '担当', 'オーケストレーションの担当なら Dispatch・Task・Run'),
  def('agent.model', 'モデル', 'モデルと値の意味（起動の要求、起動時の解決、現在の選択、最後の観測）', true),
  def('agent.effort', '推論', '推論レベルと値の意味', true),
  def('worker.state', '状態', '担当の状態', true),
  def('worker.dispatchStatus', 'Dispatch の状態', 'Dispatch の状態'),
  def('worker.liveness', '生きているか', '担当の端末が生きているか（live、exited など）', true),
  def('worker.worktreeId', 'worktree', '担当の worktree'),
  def('worker.model', 'モデル', '担当の起動時のモデルと値の意味', true),
  def('worker.effort', '推論', '担当の起動時の推論レベルと値の意味', true),
  def('task.title', '題名', 'Task の題名'),
  def('task.status', '状態', 'Task の状態'),
  def('task.parentId', '親', '親の Task'),
  def('task.deps', '依存', '先に済ませる Task'),
  def('task.createdAt', '作った時刻', 'Task を作った時刻'),
  def('task.completedAt', '終えた時刻', 'Task を終えた時刻'),
  def('run.title', '題名', 'Run の目的'),
  def('repo.displayName', '表示名', 'リポジトリの表示名'),
  def('repo.path', 'パス', 'リポジトリのパス'),
  def('repo.kind', '種類', 'リポジトリの種類'),
  def('repo.remoteKey', 'remote の鍵', 'github.com/<owner>/<name> の形の remote の鍵'),
];

export const FIELD_IDS: ReadonlySet<string> = new Set(FIELDS.map((f) => f.id));
export const DEFAULT_SELECTED: readonly string[] = FIELDS.filter((f) => f.defaultSelected).map((f) => f.id);

export type SelectionCheck = { ok: true; selected: string[] } | { ok: false; message: string };

/** 選んだ項目の一覧を確かめる。配列でない、文字列でない、知らない識別子、重複は拒む。 */
export function checkSelection(input: unknown): SelectionCheck {
  if (!Array.isArray(input)) return { ok: false, message: 'selected must be an array of field ids' };
  const seen = new Set<string>();
  for (const id of input) {
    if (typeof id !== 'string') return { ok: false, message: 'selected must contain only strings' };
    if (!FIELD_IDS.has(id)) return { ok: false, message: `unknown field id: ${id.slice(0, 80)}` };
    if (seen.has(id)) return { ok: false, message: `duplicate field id: ${id}` };
    seen.add(id);
  }
  return { ok: true, selected: [...seen] };
}
