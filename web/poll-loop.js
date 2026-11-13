// ポーリングの輪。読みに世代を持たせ、次の読みの予約は最新の世代の読みが終わったときだけ行う。
// restart() は前の予約を取り消し、新しい世代の読みを始める。読みの途中に選び直しても、予約はいつも1つだけ。

/**
 * @param {{
 *   load: (isCurrent: () => boolean) => Promise<void>,
 *   schedule: (fn: () => void, ms: number) => any,
 *   cancel: (timer: any) => void,
 *   delayMs: number,
 * }} options load は isCurrent() が偽なら結果で描かない。schedule と cancel は setTimeout と clearTimeout に当たる。
 * @returns {{ restart: () => void }}
 */
export function createPollLoop({ load, schedule, cancel, delayMs }) {
  let generation = 0;
  let timer = null;

  async function run(mine) {
    const isCurrent = () => mine === generation;
    try {
      await load(isCurrent);
    } catch {
      // 読みの失敗の扱いは load が持つ。輪は止めない。
    }
    if (isCurrent()) timer = schedule(() => void run(mine), delayMs);
  }

  return {
    restart() {
      cancel(timer);
      timer = null;
      generation += 1;
      void run(generation);
    },
  };
}
