/**
 * 日常/周常任务境界解锁规则
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护“日常/周常任务是否受境界门槛控制”的判断，并返回统一解锁态，供任务列表、自动接取、事件推进与直连接口复用。
 * 2. 做什么：把“角色当前境界 + 任务要求境界 -> 是否可见/可处理”收敛成纯函数，避免 `taskService` 多个入口各自手写比较。
 * 3. 不做什么：不查询数据库，不决定主线/支线可接条件，也不处理前置任务完成状态。
 *
 * 输入/输出：
 * - 输入：任务分类 `category`、任务要求境界 `taskRealm`、角色主境界 `realm`、角色小境界 `subRealm`。
 * - 输出：统一的 `TaskRecurringUnlockState`，包含是否受门槛控制、要求境界与是否已解锁。
 *
 * 数据流/状态流：
 * `task_def.realm` + `task_def.category` + `characters.realm/sub_realm`
 * -> `buildTaskRecurringUnlockState`
 * -> `taskService` 的列表过滤 / 自动接取 / 事件推进 / 直连接口校验。
 *
 * 关键边界条件与坑点：
 * 1. 只有 `daily` / `event` 会被本规则拦截；主线/支线仍沿用原有前置任务口径，避免把本次需求意外扩大到其他任务线。
 * 2. 未识别境界会按 `realmRules` 的保守口径回退到最低档，确保不会因为脏数据把高阶日常/周常提前放出来。
 */
import { getRealmRankZeroBased } from './realmRules.js';

export type TaskRecurringUnlockState = {
  gatedByRealm: boolean;
  requiredRealm: string | null;
  unlocked: boolean;
};

export const isRealmGatedRecurringTaskCategory = (category: string): boolean => {
  return category === 'daily' || category === 'event';
};

export const buildTaskRecurringUnlockState = (
  category: string,
  taskRealm: string,
  realm: string,
  subRealm: string | null,
): TaskRecurringUnlockState => {
  if (!isRealmGatedRecurringTaskCategory(category)) {
    return {
      gatedByRealm: false,
      requiredRealm: null,
      unlocked: true,
    };
  }

  const requiredRealm = taskRealm.trim();
  if (!requiredRealm) {
    return {
      gatedByRealm: true,
      requiredRealm: null,
      unlocked: true,
    };
  }

  return {
    gatedByRealm: true,
    requiredRealm,
    unlocked:
      getRealmRankZeroBased(realm, subRealm ?? undefined)
      >= getRealmRankZeroBased(requiredRealm),
  };
};
