// ホストの Orca を前面に出す。`/usr/bin/open -b com.stablyai.orca` を、シェルを通さず引数の配列で呼ぶ。投げない。
import { type CommandRunner, nodeCommandRunner } from './open-device.ts';

export const OPEN_EXECUTABLE = '/usr/bin/open';
export const ORCA_BUNDLE_ID = 'com.stablyai.orca';
const RAISE_TIMEOUT_MS = 5_000;

/** 終了コード 0 なら true、ほか（時間切れ、起動の失敗を含む）は false。 */
export async function raiseOrca(runner: CommandRunner = nodeCommandRunner): Promise<boolean> {
  try {
    const result = await runner(OPEN_EXECUTABLE, ['-b', ORCA_BUNDLE_ID], { timeoutMs: RAISE_TIMEOUT_MS });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
