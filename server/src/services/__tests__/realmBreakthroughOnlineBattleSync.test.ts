/**
 * 突破后在线战斗快照同步回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定突破链路在境界落库后必须安排在线战斗角色快照刷新，避免秘境/战斗继续读取旧境界与旧派生属性。
 * 2. 做什么：验证“先清计算缓存、再登记快照刷新”的顺序，保证提交后重建的是最新 computed 结果。
 * 3. 不做什么：不连接真实数据库，也不执行真实突破事务。
 *
 * 输入/输出：
 * - 输入：境界服务源码文本。
 * - 输出：源码级顺序断言结果。
 *
 * 数据流/状态流：
 * 读取源码 -> 定位 breakthroughToNextRealm -> 断言出现缓存失效与快照刷新调度
 * -> 断言刷新调度位于缓存失效之后。
 *
 * 关键边界条件与坑点：
 * 1. 这里只锁定关键同步动作，不约束返回文案，避免把无关文案改动误判成回归。
 * 2. 刷新必须是“调度提交后执行”的入口，不能回退成事务内直接写 Redis。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath: string): string => {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
};

test('突破链路应在清理计算缓存后安排在线战斗快照刷新', () => {
  const source = readSource('../realmService.ts');

  assert.match(source, /invalidateCharacterComputedCache\(characterId\)/u);
  assert.match(source, /scheduleOnlineBattleCharacterSnapshotRefreshByCharacterId\(characterId\)/u);
  assert.match(
    source,
    /async breakthroughToNextRealm[\s\S]*?invalidateCharacterComputedCache\(characterId\)[\s\S]*?scheduleOnlineBattleCharacterSnapshotRefreshByCharacterId\(characterId\)/u,
  );
});
