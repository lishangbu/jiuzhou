/**
 * 在线战斗角色快照刷新策略测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定整份角色快照刷新必须走“重建快照 + 提交后调度”的策略，避免未来回退成只改局部字段。
 * 2. 做什么：验证刷新入口会复用统一快照构建逻辑，而不是手写另一套境界同步分支。
 * 3. 不做什么：不触发 Redis 写入，也不执行真实 after-commit 回调。
 *
 * 输入/输出：
 * - 输入：在线战斗投影服务源码文本。
 * - 输出：源码级策略断言结果。
 *
 * 数据流/状态流：
 * 读取源码 -> 检查刷新函数是否调用统一快照构建逻辑
 * -> 检查调度函数是否通过 afterTransactionCommit 延后执行刷新。
 *
 * 关键边界条件与坑点：
 * 1. 必须锁定 `buildCharacterSnapshotsByCharacterIds`，否则后续很容易回退成只覆盖 `computed.realm/sub_realm` 的慢性脏数据问题。
 * 2. 必须锁定 `afterTransactionCommit`，否则事务回滚时可能把 Redis 快照提前写脏。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath: string): string => {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
};

test('在线战斗角色快照刷新应重建整份快照并在提交后执行', () => {
  const source = readSource('../onlineBattleProjectionService.ts');

  assert.match(
    source,
    /export const refreshOnlineBattleCharacterSnapshotByCharacterId[\s\S]*?buildCharacterSnapshotsByCharacterIds\(\[normalizedCharacterId\]\)[\s\S]*?persistCharacterSnapshot\(nextSnapshot\)/u,
  );
  assert.match(
    source,
    /export const scheduleOnlineBattleCharacterSnapshotRefreshByCharacterId[\s\S]*?afterTransactionCommit\(async \(\) => \{[\s\S]*?refreshOnlineBattleCharacterSnapshotByCharacterId\(normalizedCharacterId\)/u,
  );
});
