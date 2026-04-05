/**
 * 云游故事伙伴/其他玩家带入规则测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定云游故事对“活跃其他玩家”的 10% 概率判定、快照归一化与候选选择规则，避免带入条件散落到 service。
 * 2. 做什么：验证活跃玩家选择会显式排除当前角色，并把故事级快照裁成 AI 可直接消费的最小字段。
 * 3. 不做什么：不连接真实数据库，不验证云游 service 落库，也不校验 AI 文案生成结果。
 *
 * 输入/输出：
 * - 输入：`storySeed`、当前角色 ID，以及 mock 的近期活跃角色列表。
 * - 输出：是否带入其他玩家的稳定布尔值，以及归一化后的故事级其他玩家快照。
 *
 * 数据流/状态流：
 * 测试种子 / mock 活跃角色列表 -> `partner` 共享模块 -> 返回稳定判定或故事级快照。
 *
 * 关键边界条件与坑点：
 * 1. 其他玩家候选必须排除当前角色，否则云游会出现“自己带入自己”的脏剧情。
 * 2. 快照一旦写入故事就会跨多幕复用，因此这里必须先把空字符串与非法 ID 清理掉，避免脏数据进入 prompt。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as recentActiveCharacterSelector from '../shared/recentActiveCharacterSelector.js';
import {
  loadActiveWanderStoryOtherPlayerSnapshot,
  normalizeWanderStoryOtherPlayerSnapshot,
  shouldIncludeWanderStoryOtherPlayer,
} from '../wander/partner.js';

test('shouldIncludeWanderStoryOtherPlayer: 同一 storySeed 应返回稳定的 10% 判定结果', () => {
  assert.equal(shouldIncludeWanderStoryOtherPlayer(789), true);
  assert.equal(shouldIncludeWanderStoryOtherPlayer(789), true);
  assert.equal(shouldIncludeWanderStoryOtherPlayer(1), false);
});

test('normalizeWanderStoryOtherPlayerSnapshot: 缺少关键字段时应返回 null', () => {
  assert.equal(
    normalizeWanderStoryOtherPlayerSnapshot({
      characterId: 0,
      nickname: '路人甲',
      title: '散修',
      realm: '炼气期',
      subRealm: '初期',
    }),
    null,
  );
});

test('loadActiveWanderStoryOtherPlayerSnapshot: 应排除当前角色并返回归一化后的活跃玩家快照', async (t) => {
  const selectorCalls: Array<Parameters<typeof recentActiveCharacterSelector.loadRecentActiveCharacters>> = [];

  t.mock.method(
    recentActiveCharacterSelector,
    'loadRecentActiveCharacters',
    async (...args: Parameters<typeof recentActiveCharacterSelector.loadRecentActiveCharacters>) => {
      selectorCalls.push(args);
      return [
        {
          userId: 2002,
          characterId: 3002,
          characterNickname: '沈星桥',
          characterTitle: '执伞客',
          characterRealm: '筑基期',
          characterSubRealm: '中期',
          userLastLoginAt: '2026-04-05T01:00:00.000Z',
          characterUpdatedAt: '2026-04-05T02:00:00.000Z',
          characterLastOfflineAt: '2026-04-05T03:00:00.000Z',
          lastActiveAt: '2026-04-05T03:00:00.000Z',
        },
      ];
    },
  );

  const snapshot = await loadActiveWanderStoryOtherPlayerSnapshot(1001, 789);

  assert.deepEqual(selectorCalls, [[7, { excludeCharacterId: 1001, limit: 16 }]]);
  assert.deepEqual(snapshot, {
    characterId: 3002,
    nickname: '沈星桥',
    title: '执伞客',
    realm: '筑基期',
    subRealm: '中期',
  });
});

test('loadActiveWanderStoryOtherPlayerSnapshot: 无候选活跃玩家时应返回 null', async (t) => {
  t.mock.method(recentActiveCharacterSelector, 'loadRecentActiveCharacters', async () => []);

  const snapshot = await loadActiveWanderStoryOtherPlayerSnapshot(1001, 789);

  assert.equal(snapshot, null);
});
