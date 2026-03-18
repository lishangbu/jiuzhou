/**
 * 战斗服务公共类型
 *
 * 作用：定义 battle 子模块间共享的类型，避免循环依赖。
 *
 * 边界条件：
 * 1) BattleResult 是所有战斗接口的统一返回类型
 * 2) 战斗开启是否处于冷却中，统一由服务端 runtime/state 判定，禁止调用方透传“跳过冷却”开关
 */

export interface BattleResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export type BattleStartCooldownValidation = {
  message: string;
  retryAfterMs: number;
  cooldownMs: number;
  nextBattleAvailableAt: number;
};
