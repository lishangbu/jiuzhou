import { getMonsterDefinitions } from '../staticConfigLoader.js';
import type { IdleSessionRow } from './types.js';

/**
 * 挂机会话视图映射模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把 `IdleSessionRow` 统一序列化为客户端可直接消费的会话 DTO。
 * 2. 做什么：集中补充 `targetMonsterDefId/targetMonsterName`，避免路由和聚合服务各自重复拼装。
 * 3. 不做什么：不查询数据库，不处理 HTTP 响应，也不参与挂机状态计算。
 *
 * 输入/输出：
 * - 输入：`IdleSessionRow`。
 * - 输出：客户端会话 DTO。
 *
 * 数据流/状态流：
 * idleSessionService 读出会话行 -> 本模块映射展示字段 -> idleRoutes / 首页概览复用。
 *
 * 关键边界条件与坑点：
 * 1. `sessionSnapshot` 含角色战斗快照，不应直接暴露给客户端，这里必须统一剥离。
 * 2. 目标怪物名依赖静态配置解析，若静态表缺项则回退为怪物定义 ID，保证前端仍有稳定展示值。
 */

export const toIdleSessionView = (session: IdleSessionRow): Record<string, unknown> => {
  const targetMonsterDefId = session.sessionSnapshot?.targetMonsterDefId ?? null;
  let targetMonsterName: string | null = null;
  if (targetMonsterDefId) {
    const monsterDefs = getMonsterDefinitions();
    const def = monsterDefs.find((monster) => monster.id === targetMonsterDefId);
    targetMonsterName = def?.name ?? targetMonsterDefId;
  }

  const { sessionSnapshot: _sessionSnapshot, ...rest } = session;
  return {
    ...rest,
    targetMonsterDefId,
    targetMonsterName,
  };
};
