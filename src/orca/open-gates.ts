// 開く口の門。読む CLI と RPC に加えて、既存のタブを選ぶ3つの操作だけを通す。
// タブやファイルを作る操作（terminal create、file open、session.tabs.create、worktree.create など）は一覧になく、送らずに拒む。
import { type CliOutcome, type OrcaCli, READ_COMMANDS } from './orca-cli.ts';
import { READ_METHODS, type RpcCallOptions, type RpcOutcome, type RpcTransport } from './rpc.ts';

/** 開く口が呼べる CLI のコマンド（読むコマンドと `terminal switch`）。 */
export const OPEN_COMMANDS: readonly (readonly string[])[] = [
  ...READ_COMMANDS.filter((cmd) => cmd[0] !== 'orchestration' || !['check', 'gate-list'].includes(cmd[1] ?? '')),
  ['terminal', 'switch'],
];

/** 開く口が送れる書き込みの RPC。どちらも `navigation: "host"` のときだけ送る。 */
export const OPEN_WRITE_METHODS: readonly string[] = ['session.tabs.activate', 'worktree.activate'];

/** 接続先を変えるフラグ。 */
const FORBIDDEN_FLAGS = ['--pairing-code', '--environment'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function refuseCommand(args: readonly string[]): Error | null {
  const known = OPEN_COMMANDS.some(
    (cmd) => cmd.every((word, i) => args[i] === word) && !args[cmd.length]?.match(/^[a-z]/),
  );
  if (!known) return new Error(`orca ${args.slice(0, 2).join(' ')} is not allowed for opening`);
  if (args.some((a) => FORBIDDEN_FLAGS.some((f) => a === f || a.startsWith(`${f}=`)))) {
    return new Error('connection-changing flags are not allowed');
  }
  return null;
}

/** 読むコマンドと `terminal switch` だけを呼べる OrcaCli。 */
export class OpenOrcaCli {
  readonly #cli: OrcaCli;

  constructor(cli: OrcaCli) {
    this.#cli = cli;
  }

  json<T = unknown>(args: readonly string[]): Promise<CliOutcome<T>> {
    const refused = refuseCommand(args);
    return refused ? Promise.reject(refused) : this.#cli.json<T>(args);
  }
}

/** 読む RPC と、`navigation: "host"` の activate だけを送れる口。 */
export class OpenRpc implements RpcTransport {
  readonly #transport: RpcTransport;

  constructor(transport: RpcTransport) {
    this.#transport = transport;
  }

  call<T = unknown>(method: string, params: unknown, options?: RpcCallOptions): Promise<RpcOutcome<T>> {
    if (OPEN_WRITE_METHODS.includes(method)) {
      if (!isRecord(params) || params.navigation !== 'host') {
        return Promise.reject(new Error(`${method} must navigate the host only`));
      }
    } else if (!READ_METHODS.includes(method)) {
      return Promise.reject(new Error(`${method} is not allowed for opening`));
    }
    return this.#transport.call<T>(method, params, options);
  }
}
