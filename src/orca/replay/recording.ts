// 録画の形（version 1）。CLI と RPC の境界で起きたことを、そのまま再生できる形で持つ。
// 書き出す前に sanitize.ts の sanitizeRecording と assertRecordingSafe を通す。

export interface CliEntry {
  /** 実行ファイルを含まない引数の配列。 */
  argv: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  delayMs: number;
  timedOut?: boolean;
  spawnError?: string;
  outputOverflow?: boolean;
}

export interface CliRecording {
  version: 1;
  kind: 'cli';
  entries: CliEntry[];
}

export interface RpcExchangeRecord {
  method: string;
  /** 書けば、要求の params がこれと等しいときだけ使う。 */
  params?: unknown;
  /** 届いた順の生の文字列。`$ID` は要求の id に置き換える。分割、keepalive、不正な JSON を表せる。 */
  chunks: string[];
  /** close は送り終えたら閉じる（応答がなければ接続断）。hold は開いたまま（応答がなければ時間切れ）。 */
  end: 'close' | 'hold';
}

export interface RpcRecording {
  version: 1;
  kind: 'rpc';
  exchanges: RpcExchangeRecord[];
}

export type Recording = CliRecording | RpcRecording;
