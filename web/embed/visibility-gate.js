// 見えない間の停止の門（iss-00077 D-05）。hidden が hiddenMs 続いたら onPause を1回、その後に visible になったら onResume を1回。
// 止める前に visible に戻れば予約を取り消す。時計と予約と見え方は注入する（テストのため）。呼び手は visibilitychange で update を呼ぶ。

/** 見えない状態がこれだけ続いたら、会話の接続と状態の読みを止める（iss-00077 R-04）。 */
export const HIDDEN_PAUSE_MS = 30_000;

/**
 * @param {{
 *   hiddenMs: number,
 *   onPause: () => void,
 *   onResume: () => void,
 *   schedule: (fn: () => void, ms: number) => any,
 *   cancel: (timer: any) => void,
 *   isHidden: () => boolean,
 * }} options
 * @returns {{ update: () => void, paused: () => boolean }}
 */
export function createVisibilityGate({ hiddenMs, onPause, onResume, schedule, cancel, isHidden }) {
  let timer = null;
  let paused = false;
  const clear = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  return {
    update() {
      if (isHidden()) {
        if (paused || timer !== null) return;
        timer = schedule(() => {
          timer = null;
          if (paused || !isHidden()) return;
          paused = true;
          onPause();
        }, hiddenMs);
        return;
      }
      clear();
      if (!paused) return;
      paused = false;
      onResume();
    },
    paused: () => paused,
  };
}
