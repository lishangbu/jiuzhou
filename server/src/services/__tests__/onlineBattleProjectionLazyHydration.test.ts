/**
 * 在线战斗角色快照懒加载测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“启动阶段只预热活跃角色，其余角色在首次读取时由投影服务统一懒加载补齐”的回归风险。
 * 2. 做什么：验证角色 ID 映射缺失时，会先走单一入口补 userId -> characterId，再批量装配角色快照并回写投影。
 * 3. 不做什么：不连接真实 Redis/数据库，也不覆盖竞技场/秘境/千层塔投影本身的预热正确性。
 *
 * 输入/输出：
 * - 输入：空的启动预热查询结果、一个按需访问的 userId，以及模拟的角色属性/战斗装配数据。
 * - 输出：首次读取返回懒加载后的在线战斗角色快照，后续同角色读取直接命中内存快照。
 *
 * 数据流/状态流：
 * - warmupOnlineBattleProjectionService 只预热空活跃集；
 * - getOnlineBattleCharacterSnapshotByUserId 命中缺失 -> 补 userId 映射 -> 懒加载角色快照；
 * - getOnlineBattleCharacterSnapshotByCharacterId 再次读取时复用同一份内存快照。
 *
 * 关键边界条件与坑点：
 * 1. Redis 中残留旧 key 时，当前进程必须以 index 集合为准；本测试用空 index 锁定“不读旧 key”的行为。
 * 2. 懒加载必须走投影服务单一入口，不能把 DB fallback 分散到 battle/arena/dungeon 调用方。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import * as database from '../../config/database.js';
import { redis } from '../../config/redis.js';
import type { CharacterComputedRow } from '../characterComputedService.js';
import * as computedService from '../characterComputedService.js';
import type { CharacterBattleLoadout } from '../battle/shared/profileCache.js';
import * as profileCache from '../battle/shared/profileCache.js';
import * as partnerBattleMemberService from '../shared/partnerBattleMember.js';
import {
  getOnlineBattleCharacterSnapshotByCharacterId,
  getOnlineBattleCharacterSnapshotByUserId,
  warmupOnlineBattleProjectionService,
} from '../onlineBattleProjectionService.js';

type RedisPipelineMock = {
  sismember: (indexKey: string, member: string) => RedisPipelineMock;
  exec: () => Promise<Array<[null, number]>>;
};

type RedisMultiMock = {
  sadd: (key: string, ...members: string[]) => RedisMultiMock;
  set: (key: string, value: string) => RedisMultiMock;
  del: (key: string) => RedisMultiMock;
  exec: () => Promise<[]>;
};

const createPipelineMock = (): RedisPipelineMock => {
  const queuedChecks: number[] = [];
  const pipelineMock: RedisPipelineMock = {
    sismember: () => {
      queuedChecks.push(0);
      return pipelineMock;
    },
    exec: async () => queuedChecks.map(() => [null, 0] as [null, number]),
  };
  return pipelineMock;
};

const createMultiMock = (): RedisMultiMock => {
  const multiMock: RedisMultiMock = {
    sadd: () => multiMock,
    set: () => multiMock,
    del: () => multiMock,
    exec: async () => [],
  };
  return multiMock;
};

test('在线战斗投影应对非活跃角色按需懒加载角色快照', async (t) => {
  const computedRow: CharacterComputedRow = {
    id: 3001,
    user_id: 88,
    nickname: '懒加载道友',
    title: '散修',
    gender: 'male',
    avatar: null,
    auto_cast_skills: true,
    auto_disassemble_enabled: false,
    auto_disassemble_rules: [],
    dungeon_no_stamina_cost: false,
    spirit_stones: 0,
    silver: 0,
    stamina: 88,
    realm: '炼气',
    sub_realm: null,
    exp: 0,
    attribute_points: 0,
    jing: 0,
    qi: 0,
    shen: 0,
    attribute_type: 'physical',
    attribute_element: 'none',
    current_map_id: 'map-qingyun-village',
    current_room_id: 'room-village-center',
    max_qixue: 120,
    max_lingqi: 60,
    wugong: 10,
    fagong: 12,
    wufang: 8,
    fafang: 7,
    mingzhong: 0.9,
    shanbi: 0.05,
    zhaojia: 0.02,
    baoji: 0.1,
    baoshang: 1.5,
    jianbaoshang: 0,
    jianfantan: 0,
    kangbao: 0,
    zengshang: 0,
    zhiliao: 0,
    jianliao: 0,
    xixue: 0,
    lengque: 0,
    kongzhi_kangxing: 0,
    jin_kangxing: 0,
    mu_kangxing: 0,
    shui_kangxing: 0,
    huo_kangxing: 0,
    tu_kangxing: 0,
    qixue_huifu: 0,
    lingqi_huifu: 0,
    sudu: 20,
    fuyuan: 1,
    stamina_max: 100,
    qixue: 120,
    lingqi: 30,
  };
  const loadout: CharacterBattleLoadout = {
    setBonusEffects: [],
    skills: [],
  };

  t.mock.method(redis, 'del', async () => 1);
  t.mock.method(redis, 'get', async () => null);
  t.mock.method(redis, 'mget', async (...keys: string[]) => keys.map(() => null));
  t.mock.method(redis, 'pipeline', () => createPipelineMock());
  t.mock.method(redis, 'multi', () => createMultiMock());

  const querySqls: string[] = [];
  t.mock.method(database, 'query', async (sql: string, params?: readonly unknown[]) => {
    querySqls.push(sql);

    if (sql.includes('WITH recent_characters AS')) {
      assert.deepEqual(params, [7]);
      return { rows: [] };
    }
    if (sql.includes('FROM team_members tm')) {
      return { rows: [] };
    }
    if (sql.includes('FROM dungeon_entry_count')) {
      return { rows: [] };
    }
    if (sql.includes('FROM arena_rating')) {
      return { rows: [] };
    }
    if (sql.includes('GROUP BY challenger_character_id')) {
      return { rows: [] };
    }
    if (sql.includes('FROM arena_battle ab')) {
      return { rows: [] };
    }
    if (sql.includes('SELECT\n        di.id,') || sql.includes('SELECT\r\n        di.id,')) {
      return { rows: [] };
    }
    if (sql.includes('FROM character_tower_progress')) {
      return { rows: [] };
    }
    if (sql.includes('SELECT id, user_id') && sql.includes('WHERE user_id = ANY')) {
      assert.deepEqual(params, [[88]]);
      return { rows: [{ id: 3001, user_id: 88 }] };
    }

    throw new Error(`未覆盖的 SQL: ${sql}`);
  });

  const computedBatchCalls: number[][] = [];
  t.mock.method(
    computedService,
    'getCharacterComputedBatchByCharacterIds',
    async (characterIds: number[]) => {
      computedBatchCalls.push([...characterIds]);
      return characterIds.includes(3001)
        ? new Map([[3001, computedRow]])
        : new Map<number, CharacterComputedRow>();
    },
  );
  t.mock.method(
    profileCache,
    'loadCharacterBattleLoadoutsByCharacterIds',
    async (characterIds: number[]) => {
      return characterIds.includes(3001)
        ? new Map([[3001, loadout]])
        : new Map<number, CharacterBattleLoadout>();
    },
  );
  t.mock.method(
    partnerBattleMemberService,
    'loadActivePartnerBattleMemberMap',
    async () => new Map(),
  );

  const warmupSummary = await warmupOnlineBattleProjectionService();
  assert.equal(warmupSummary.characterCount, 0);

  const firstSnapshot = await getOnlineBattleCharacterSnapshotByUserId(88);
  assert.equal(firstSnapshot?.characterId, 3001);
  assert.equal(firstSnapshot?.userId, 88);
  assert.equal(firstSnapshot?.computed.nickname, '懒加载道友');

  const secondSnapshot = await getOnlineBattleCharacterSnapshotByCharacterId(3001);
  assert.equal(secondSnapshot?.characterId, 3001);
  assert.equal(computedBatchCalls.length, 1);
  assert.deepEqual(computedBatchCalls[0], [3001]);
  assert.ok(querySqls.some((sql) => sql.includes('WHERE user_id = ANY')));
});

test('在线战斗投影应在读取旧 Redis 快照时把货币字段归一化为 number', async (t) => {
  const snapshotJson = JSON.stringify({
    characterId: '3002',
    userId: '89',
    computed: {
      id: '3002',
      user_id: '89',
      nickname: '旧缓存道友',
      title: '散修',
      gender: 'male',
      avatar: null,
      auto_cast_skills: true,
      auto_disassemble_enabled: false,
      auto_disassemble_rules: [],
      dungeon_no_stamina_cost: false,
      spirit_stones: '123456',
      silver: '7890',
      stamina: '66',
      realm: '炼气',
      sub_realm: null,
      exp: '321',
      attribute_points: '4',
      jing: '5',
      qi: '6',
      shen: '7',
      attribute_type: 'physical',
      attribute_element: 'none',
      current_map_id: 'map-qingyun-village',
      current_room_id: 'room-village-center',
      max_qixue: '120',
      max_lingqi: '60',
      wugong: 10,
      fagong: 12,
      wufang: 8,
      fafang: 7,
      mingzhong: 0.9,
      shanbi: 0.05,
      zhaojia: 0.02,
      baoji: 0.1,
      baoshang: 1.5,
      jianbaoshang: 0,
      jianfantan: 0,
      kangbao: 0,
      zengshang: 0,
      zhiliao: 0,
      jianliao: 0,
      xixue: 0,
      lengque: 0,
      kongzhi_kangxing: 0,
      jin_kangxing: 0,
      mu_kangxing: 0,
      shui_kangxing: 0,
      huo_kangxing: 0,
      tu_kangxing: 0,
      qixue_huifu: 0,
      lingqi_huifu: 0,
      sudu: 20,
      fuyuan: 1,
      stamina_max: '100',
      qixue: '120',
      lingqi: '30',
    },
    loadout: {
      setBonusEffects: [],
      skills: [],
    },
    activePartner: null,
    teamId: null,
    isTeamLeader: false,
  });

  t.mock.method(redis, 'del', async () => 1);
  t.mock.method(redis, 'mget', async (...keys: string[]) => keys.map(() => null));
  t.mock.method(redis, 'multi', () => createMultiMock());
  t.mock.method(redis, 'pipeline', () => {
    const checks: string[] = [];
    const pipelineMock: RedisPipelineMock = {
      sismember: (_indexKey: string, member: string) => {
        checks.push(member);
        return pipelineMock;
      },
      exec: async () => checks.map((member) => [null, member === '3002' ? 1 : 0] as [null, number]),
    };
    return pipelineMock;
  });
  t.mock.method(redis, 'get', async (key: string) => {
    if (key.endsWith(':3002')) {
      return snapshotJson;
    }
    return null;
  });

  t.mock.method(database, 'query', async (sql: string) => {
    if (sql.includes('WITH recent_characters AS')) return { rows: [] };
    if (sql.includes('FROM team_members tm')) return { rows: [] };
    if (sql.includes('FROM dungeon_entry_count')) return { rows: [] };
    if (sql.includes('FROM arena_rating')) return { rows: [] };
    if (sql.includes('GROUP BY challenger_character_id')) return { rows: [] };
    if (sql.includes('FROM arena_battle ab')) return { rows: [] };
    if (sql.includes('FROM dungeon_instance di')) return { rows: [] };
    if (sql.includes('FROM character_tower_progress')) return { rows: [] };
    throw new Error(`未覆盖的 SQL: ${sql}`);
  });

  const warmupSummary = await warmupOnlineBattleProjectionService();
  assert.equal(warmupSummary.characterCount, 0);

  const snapshot = await getOnlineBattleCharacterSnapshotByCharacterId(3002);
  assert.equal(snapshot?.characterId, 3002);
  assert.equal(typeof snapshot?.computed.spirit_stones, 'number');
  assert.equal(typeof snapshot?.computed.silver, 'number');
  assert.equal(typeof snapshot?.computed.exp, 'number');
  assert.equal(snapshot?.computed.spirit_stones, 123456);
  assert.equal(snapshot?.computed.silver, 7890);
  assert.equal(snapshot?.computed.exp, 321);
});
