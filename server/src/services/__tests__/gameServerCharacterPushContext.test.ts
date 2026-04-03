/**
 * GameServer 角色推送上下文回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定 `pushCharacterUpdate -> flushCharacterPush` 必须显式切到允许 DB 的后台上下文，避免战斗禁 DB 链路把角色推送退化成战斗快照。
 * 2. 做什么：覆盖当前线上症状对应的关键规则，即角色推送要读取权威角色数据，而不是沿用开战时的在线快照货币值。
 * 3. 不做什么：不实例化真实 SocketServer，不连接数据库，也不验证具体推送内容；这里只锁上下文切换协议。
 *
 * 输入 / 输出：
 * - 输入：`gameServer.ts` 源码文本。
 * - 输出：断言 `flushCharacterPush` 内部包含 `runWithDatabaseAccessAllowed` 包装。
 *
 * 数据流 / 状态流：
 * 读取源码
 * -> 定位 `flushCharacterPush`
 * -> 断言角色推送在后台异步分支中显式清除禁 DB 上下文。
 *
 * 复用设计说明：
 * 1. 这条规则属于所有战斗入口共享的角色推送协议，单测放在服务层回归目录后，`battle/action`、`battle-session/advance`、战斗结算都共同受保护。
 * 2. 用源码断言而不是搭建完整 Socket + DB 场景，可以最低成本锁住这条跨模块约束，避免后续重构时再次遗漏。
 *
 * 关键边界条件与坑点：
 * 1. 这里只锁“必须切允许 DB 上下文”，不锁具体实现细节；后续若改成抽函数也必须继续满足这条协议。
 * 2. 断言目标是 `flushCharacterPush` 而不是 `pushCharacterUpdate`，因为真正访问数据库的是刷新执行阶段，不是调度入口。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('flushCharacterPush 应在允许 DB 上下文中加载权威角色数据', () => {
  const gameServerSource = readFileSync(
    new URL('../../game/gameServer.ts', import.meta.url),
    'utf8',
  );

  assert.match(
    gameServerSource,
    /private async flushCharacterPush\(userId: number\): Promise<void> \{[\s\S]*?runWithDatabaseAccessAllowed\(async \(\) => \{/u,
  );
});
