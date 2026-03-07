/**
 * battleCooldownFallback — 战斗冷却本地兜底调度器
 *
 * 作用：
 *   在客户端已知 `nextBattleAvailableAt` 的前提下，提供一个“本地兜底 ready 信号”，
 *   防止 socket 的 `battle:cooldown-ready` 在断线重连、后台挂起或瞬时抖动时丢失，
 *   导致自动续战永久卡住。
 *   不做什么：不直接发起战斗、不依赖 React 状态，只负责调度与取消。
 *
 * 输入/输出：
 *   - 输入：当前时间源、setTimer/clearTimer、以及冷却结束时的 onReady 回调
 *   - 输出：BattleCooldownFallbackController（schedule / clear）
 *
 * 数据流：
 *   battle_finished / battle:cooldown-sync 提供 nextBattleAvailableAt
 *   → 本模块计算剩余 delay
 *   → 到时触发 onReady
 *   → 上层决定是否继续自动开战
 *
 * 关键边界条件与坑点：
 *   1. 若冷却结束时间已过去，delay 必须归零，保证“重连已晚于冷却结束”时能立即恢复。
 *   2. 新一轮 schedule 会覆盖旧定时器，避免重复触发多次 onReady。
 *   3. clear 必须幂等，供 battle_started / escape / unmount 多入口复用，不产生重复 clear。
 *   4. 本模块不持久化状态；页面刷新后的恢复仍由上层状态同步负责。
 */

export interface BattleCooldownFallbackController {
  schedule: (nextBattleAvailableAt: number) => void;
  clear: () => void;
}

export interface BattleCooldownFallbackControllerDeps {
  now: () => number;
  setTimer: (fn: () => void, delayMs: number) => number;
  clearTimer: (timerId: number) => void;
  onReady: () => void;
}

/**
 * 本地兜底仅用于“避免永久停住”，不追求与服务端冷却边界零误差对齐。
 * 加一小段缓冲，规避时钟漂移/事件循环延迟导致的“前端先发，后端还差 0.x 秒”抖动请求。
 */
export const BATTLE_COOLDOWN_FALLBACK_GRACE_MS = 300;

export function resolveBattleCooldownFallbackDelay(
  nextBattleAvailableAt: number,
  now: number = Date.now(),
): number {
  const remainingMs = Math.max(0, Math.floor(nextBattleAvailableAt - now));
  if (remainingMs === 0) {
    return 0;
  }
  return remainingMs + BATTLE_COOLDOWN_FALLBACK_GRACE_MS;
}

export function createBattleCooldownFallbackController(
  deps: BattleCooldownFallbackControllerDeps,
): BattleCooldownFallbackController {
  let timerId: number | null = null;

  const clear = (): void => {
    if (timerId == null) {
      return;
    }
    deps.clearTimer(timerId);
    timerId = null;
  };

  const schedule = (nextBattleAvailableAt: number): void => {
    clear();

    const delayMs = resolveBattleCooldownFallbackDelay(
      nextBattleAvailableAt,
      deps.now(),
    );

    timerId = deps.setTimer(() => {
      timerId = null;
      deps.onReady();
    }, delayMs);
  };

  return {
    schedule,
    clear,
  };
}
