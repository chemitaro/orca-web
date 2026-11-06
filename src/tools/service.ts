// orca-web の LaunchAgent を入れる・外す・起動し直す・状態を見る命令の入口（npm run service:*）。
// 本物の口（execFile、fetch）と、この node の絶対パス（process.execPath）、利用者の uid と HOME、リポジトリのディレクトリを渡す。
// 終了コード：成功 0、設定と命令の誤り 2、そのほか 1。
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { type ExecResult, type HealthReply, parseServiceArgs, ServiceManager, UsageError } from '../service/launchd.ts';

const EXEC_TIMEOUT_MS = 10_000;
const HEALTH_TIMEOUT_MS = 2_000;

function exec(file: string, args: readonly string[], options: { timeoutMs?: number } = {}): Promise<ExecResult> {
  const timeout = options.timeoutMs ?? EXEC_TIMEOUT_MS;
  return new Promise((resolve) => {
    execFile(file, [...args], { timeout, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ code: 0, stdout, stderr });
        return;
      }
      const code = typeof error.code === 'number' ? error.code : null;
      resolve({ code, stdout: stdout ?? '', stderr: stderr || error.message });
    });
  });
}

async function health(port: number): Promise<HealthReply | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (res.status !== 200) return null;
    const body = (await res.json()) as Partial<HealthReply>;
    return typeof body.pid === 'number' && Array.isArray(body.listeners)
      ? { pid: body.pid, listeners: body.listeners }
      : null;
  } catch {
    return null;
  }
}

let args: ReturnType<typeof parseServiceArgs>;
try {
  args = parseServiceArgs(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  console.error(error.message);
  process.exit(2);
}

if (process.platform !== 'darwin' || typeof process.getuid !== 'function') {
  console.error('orca-web service: launchd is only available on macOS');
  process.exit(2);
}

const manager = new ServiceManager({
  home: homedir(),
  uid: process.getuid(),
  repoDir: path.resolve(import.meta.dirname, '..', '..'),
  nodePath: process.execPath,
  nodeVersion: process.version,
  io: {
    exec,
    health,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  },
});
process.exitCode = await manager.run(args);
