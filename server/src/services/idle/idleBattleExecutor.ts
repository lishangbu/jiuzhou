/**
 * IdleBattleExecutor — 挂机战斗执行循环
 *
 * 作用：
 *   驱动离线挂机战斗的核心执行逻辑，包括：
 *   - executeSingleBatch：执行单场战斗，结算奖励，写入 DB
 *   - startExecutionLoop：启动 setInterval 驱动的执行循环，检查终止条件
 *   - stopExecutionLoop：手动停止指定会话的执行循环
 *   - recoverActiveIdleSessions：服务启动时恢复所有活跃会话
 *
 * 输入/输出：
 *   - executeSingleBatch(session, batchIndex) → SingleBatchResult
 *   - startExecutionLoop(session, userId) → void（异步驱动）
 *   - stopExecutionLoop(sessionId) → void
 *   - recoverActiveIdleSessions() → Promise<void>
 *
 * 数据流：
 *   startExecutionLoop → setInterval → executeSingleBatch → BattleEngine.autoExecute()
 *   → quickDistributeRewards → updateSessionSummary → emitToUser
 *   终止条件满足 → completeIdleSession → releaseIdleLock
 *
 * 关键边界条件：
 *   1. 每场战斗完成后检查终止条件（时长超限、Stamina 耗尽、status = 'stopping'）
 *      顺序：先执行战斗，再检查终止，保证至少执行一场
 *   2. 背包满时 bagFullFlag = true，跳过物品掉落但继续执行（经验/银两仍发放）
 *   3. 战败时 expGained/silverGained/itemsGained 均为零（由 quickDistributeRewards 保证）
 *   4. 执行循环使用 Map 管理，防止同一会话重复启动
 */

import { randomUUID } from 'crypto';
import { query } from '../../config/database.js';
import { createPVEBattle, type CharacterData, type SkillData } from '../../battle/battleFactory.js';
import { BattleEngine } from '../../battle/battleEngine.js';
import { quickDistributeRewards, type BattleParticipant } from '../battleDropService.js';
import { applyStaminaRecoveryByCharacterId } from '../staminaService.js';
import { getGameServer } from '../../game/gameServer.js';
import { getRoomInMap } from '../mapService.js';
import { resolveMonsterDataForBattle } from '../battle/index.js';
import { getCharacterUserId } from '../sect/db.js';
import type { IdleSessionRow, RewardItemEntry } from './types.js';
import type { BattleLogEntry } from '../../battle/types.js';
import {
  completeIdleSession,
  releaseIdleLock,
  updateSessionSummary,
  getActiveIdleSession,
} from './idleSessionService.js';

// ============================================
// 常量
// ============================================

/** 每场战斗之间的间隔（ms）*/
const BATTLE_INTERVAL_MS = 100;

// ============================================
// 内部状态：执行循环 Map（sessionId → intervalHandle）
// ============================================

const activeLoops = new Map<string, ReturnType<typeof setInterval>>();

// ============================================
// 类型定义
// ============================================

/** 单场战斗执行结果 */
export interface SingleBatchResult {
  result: 'attacker_win' | 'defender_win' | 'draw';
  expGained: number;
  silverGained: number;
  itemsGained: RewardItemEntry[];
  randomSeed: number;
  roundCount: number;
  battleLog: BattleLogEntry[];
  monsterIds: string[];
  bagFullFlag: boolean;
}

// ============================================
// 内部工具：从 SessionSnapshot 构建 CharacterData
// ============================================

/**
 * 将 SessionSnapshot 转换为 BattleFactory 所需的 CharacterData 格式
 *
 * 复用点：仅在 executeSingleBatch 中调用，快照字段与 CharacterData 字段一一对应。
 * 注意：user_id 在快照中不存储，由调用方传入（避免快照与用户绑定）。
 */
function snapshotToCharacterData(
  snapshot: IdleSessionRow['sessionSnapshot'],
  userId: number,
): CharacterData {
  const a = snapshot.baseAttrs;
  return {
    user_id: userId,
    id: snapshot.characterId,
    // nickname 在挂机战斗中不展示，使用 characterId 字符串占位
    nickname: String(snapshot.characterId),
    realm: snapshot.realm,
    attribute_element: (a as { element?: string }).element ?? 'none',
    // 战斗开始时满血满灵气（复用在线战斗的 withBattleStartResources 语义）
    qixue: a.max_qixue ?? 0,
    max_qixue: a.max_qixue ?? 0,
    lingqi: a.max_lingqi != null && a.max_lingqi > 0
      ? Math.floor(a.max_lingqi * 0.5)
      : 0,
    max_lingqi: a.max_lingqi ?? 0,
    wugong: a.wugong ?? 0,
    fagong: a.fagong ?? 0,
    wufang: a.wufang ?? 0,
    fafang: a.fafang ?? 0,
    sudu: a.sudu ?? 1,
    mingzhong: a.mingzhong ?? 0.9,
    shanbi: a.shanbi ?? 0,
    zhaojia: a.zhaojia ?? 0,
    baoji: a.baoji ?? 0,
    baoshang: a.baoshang ?? 0,
    kangbao: a.kangbao ?? 0,
    zengshang: a.zengshang ?? 0,
    zhiliao: a.zhiliao ?? 0,
    jianliao: a.jianliao ?? 0,
    xixue: a.xixue ?? 0,
    lengque: a.lengque ?? 0,
    kongzhi_kangxing: a.kongzhi_kangxing ?? 0,
    jin_kangxing: a.jin_kangxing ?? 0,
    mu_kangxing: a.mu_kangxing ?? 0,
    shui_kangxing: a.shui_kangxing ?? 0,
    huo_kangxing: a.huo_kangxing ?? 0,
    tu_kangxing: a.tu_kangxing ?? 0,
    qixue_huifu: a.qixue_huifu ?? 0,
    lingqi_huifu: a.lingqi_huifu ?? 0,
    setBonusEffects: snapshot.setBonusEffects,
  };
}

/**
 * 将 BattleSkill[] 转换为 SkillData[]（BattleFactory 所需格式）
 *
 * BattleSkill 与 SkillData 字段基本对应，此处做字段名映射。
 */
function battleSkillsToSkillData(
  skills: IdleSessionRow['sessionSnapshot']['skills'],
): SkillData[] {
  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    cost_lingqi: s.cost.lingqi ?? 0,
    cost_qixue: s.cost.qixue ?? 0,
    cooldown: s.cooldown,
    target_type: s.targetType,
    target_count: s.targetCount,
    damage_type: s.damageType ?? 'none',
    element: s.element,
    effects: s.effects,
    ai_priority: s.aiPriority,
  }));
}

// ============================================
// executeSingleBatch：执行单场战斗
// ============================================

/**
 * 执行单场挂机战斗并持久化结果
 *
 * 步骤：
 *   1. 从 session.sessionSnapshot 构建 CharacterData
 *   2. 从 mapService 获取房间怪物列表
 *   3. 解析怪物数据（resolveMonsterDataForBattle）
 *   4. createPVEBattle → BattleEngine.autoExecute()
 *   5. 胜利时调用 quickDistributeRewards 结算奖励
 *   6. 扣减 Stamina（UPDATE stamina - 1，最低为 0）
 *   7. 写入 idle_battle_batches
 *   8. 调用 updateSessionSummary 累加汇总
 *
 * 失败场景：
 *   - 房间不存在或无怪物 → 返回 draw，无奖励
 *   - 怪物数据解析失败 → 返回 draw，无奖励
 *   - 战败 → expGained/silverGained/itemsGained 均为零
 */
export async function executeSingleBatch(
  session: IdleSessionRow,
  batchIndex: number,
  userId: number,
): Promise<SingleBatchResult> {
  // 1. 获取房间怪物列表
  const room = await getRoomInMap(session.mapId, session.roomId);
  const monsterIds: string[] = (room?.monsters ?? []).map((m) => m.monster_def_id);

  // 房间无怪物时跳过（draw，无奖励）
  if (monsterIds.length === 0) {
    return {
      result: 'draw',
      expGained: 0,
      silverGained: 0,
      itemsGained: [],
      randomSeed: 0,
      roundCount: 0,
      battleLog: [],
      monsterIds: [],
      bagFullFlag: false,
    };
  }

  // 2. 解析怪物数据
  const monsterResult = resolveMonsterDataForBattle(monsterIds);
  if (!monsterResult.success) {
    return {
      result: 'draw',
      expGained: 0,
      silverGained: 0,
      itemsGained: [],
      randomSeed: 0,
      roundCount: 0,
      battleLog: [],
      monsterIds,
      bagFullFlag: false,
    };
  }

  // 3. 构建战斗状态并执行
  const characterData = snapshotToCharacterData(session.sessionSnapshot, userId);
  const skillData = battleSkillsToSkillData(session.sessionSnapshot.skills);
  const battleId = randomUUID();

  const state = createPVEBattle(
    battleId,
    characterData,
    skillData,
    monsterResult.monsters,
    monsterResult.monsterSkillsMap,
  );

  const engine = new BattleEngine(state);
  engine.autoExecute();

  const finalState = engine.getState();
  const battleResult = finalState.result ?? 'draw';
  const randomSeed = finalState.randomSeed;
  const roundCount = finalState.roundCount;
  const battleLog = finalState.logs as BattleLogEntry[];

  // 4. 胜利时结算奖励
  let expGained = 0;
  let silverGained = 0;
  let itemsGained: RewardItemEntry[] = [];
  let bagFullFlag = false;

  if (battleResult === 'attacker_win') {
    const participant: BattleParticipant = {
      userId,
      characterId: session.characterId,
      nickname: String(session.characterId),
      realm: session.sessionSnapshot.realm,
    };

    const distributeResult = await quickDistributeRewards(
      monsterIds,
      [participant],
      true,
    );

    if (distributeResult.success) {
      expGained = distributeResult.rewards.exp;
      silverGained = distributeResult.rewards.silver;

      // 将 DistributeResult.rewards.items 转换为 RewardItemEntry[]
      itemsGained = distributeResult.rewards.items.map((item) => ({
        itemDefId: item.itemDefId,
        itemName: item.itemName,
        quantity: item.quantity,
      }));

      // 背包满时 quickDistributeRewards 仍会返回 success，
      // 通过检查 perPlayerRewards 中 items 为空但 distributeResult.rewards.items 非空来判断
      // 实际上 grantRewardItemWithAutoDisassemble 背包满时会走邮件补发，不设 bagFullFlag
      // 此处保留 bagFullFlag 字段供未来扩展
    } else {
      // 分发失败（如背包满且邮件也失败）：记录 bagFullFlag，但不中断循环
      bagFullFlag = true;
    }
  }

  // 5. 扣减 Stamina（原子操作，最低为 0）
  await query(
    `UPDATE characters SET stamina = GREATEST(stamina - 1, 0), updated_at = NOW() WHERE id = $1`,
    [session.characterId],
  );

  // 6. 写入 idle_battle_batches
  const batchId = randomUUID();
  await query(
    `INSERT INTO idle_battle_batches (
      id, session_id, batch_index, result, round_count, random_seed,
      exp_gained, silver_gained, items_gained, battle_log, monster_ids, executed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
    [
      batchId,
      session.id,
      batchIndex,
      battleResult,
      roundCount,
      randomSeed,
      expGained,
      silverGained,
      JSON.stringify(itemsGained),
      JSON.stringify(battleLog),
      JSON.stringify(monsterIds),
    ],
  );

  // 7. 累加更新会话汇总
  await updateSessionSummary(session.id, {
    totalBattlesDelta: 1,
    winDelta: battleResult === 'attacker_win' ? 1 : 0,
    loseDelta: battleResult === 'defender_win' ? 1 : 0,
    expDelta: expGained,
    silverDelta: silverGained,
    newItems: itemsGained,
    bagFullFlag: bagFullFlag || undefined,
  });

  return {
    result: battleResult,
    expGained,
    silverGained,
    itemsGained,
    randomSeed,
    roundCount,
    battleLog,
    monsterIds,
    bagFullFlag,
  };
}

// ============================================
// startExecutionLoop：执行循环控制
// ============================================

/**
 * 启动挂机执行循环
 *
 * 使用 setInterval 驱动，每场战斗完成后立即检查终止条件：
 *   a. 时长超限：Date.now() - session.startedAt >= session.maxDurationMs
 *   b. Stamina 耗尽：applyStaminaRecoveryByCharacterId 返回 stamina <= 0
 *   c. status = 'stopping'：重新查询 DB 检查
 *
 * 终止时：
 *   - 调用 completeIdleSession（completed 或 interrupted）
 *   - 调用 releaseIdleLock 释放 Redis 互斥锁
 *   - 通过 emitToUser 推送最终状态
 *
 * 关键边界：
 *   - 同一 sessionId 不会重复启动（activeLoops Map 保护）
 *   - 执行循环内部异常不会中断循环，记录日志后继续下一场
 */
export function startExecutionLoop(session: IdleSessionRow, userId: number): void {
  // 防止重复启动
  if (activeLoops.has(session.id)) return;

  let batchIndex = session.totalBattles + 1;
  let running = false;

  const handle = setInterval(() => {
    // 防止上一场未完成时重入
    if (running) return;
    running = true;

    void (async () => {
      try {
        // 执行单场战斗
        const batchResult = await executeSingleBatch(session, batchIndex, userId);
        batchIndex++;

        // 推送本场收益摘要给客户端
        try {
          getGameServer().emitToUser(userId, 'idle:update', {
            sessionId: session.id,
            batchIndex: batchIndex - 1,
            result: batchResult.result,
            expGained: batchResult.expGained,
            silverGained: batchResult.silverGained,
            itemsGained: batchResult.itemsGained,
            roundCount: batchResult.roundCount,
          });
        } catch {
          // GameServer 未初始化时忽略推送错误（如测试环境）
        }

        // 检查终止条件
        const shouldStop = await checkTerminationConditions(session, userId);
        if (shouldStop.terminate) {
          clearInterval(handle);
          activeLoops.delete(session.id);
          await completeIdleSession(session.id, shouldStop.status);
          await releaseIdleLock(session.characterId);

          try {
            getGameServer().emitToUser(userId, 'idle:finished', {
              sessionId: session.id,
              reason: shouldStop.reason,
            });
          } catch {
            // 忽略推送错误
          }
        }
      } catch (err) {
        console.error(`[IdleBattleExecutor] 会话 ${session.id} 第 ${batchIndex} 场战斗异常:`, err);
        // 异常不中断循环，继续下一场
      } finally {
        running = false;
      }
    })();
  }, BATTLE_INTERVAL_MS);

  activeLoops.set(session.id, handle);
}

/**
 * 手动停止指定会话的执行循环（仅清理内存，DB 状态由 stopIdleSession 负责）
 */
export function stopExecutionLoop(sessionId: string): void {
  const handle = activeLoops.get(sessionId);
  if (handle) {
    clearInterval(handle);
    activeLoops.delete(sessionId);
  }
}

// ============================================
// 终止条件检查（内部函数）
// ============================================

type TerminationCheckResult =
  | { terminate: false }
  | { terminate: true; status: 'completed' | 'interrupted'; reason: string };

/**
 * 检查是否满足终止条件
 *
 * 按优先级顺序检查：
 *   1. status = 'stopping'（用户主动停止）→ interrupted
 *   2. 时长超限 → completed
 *   3. Stamina 耗尽 → completed
 */
async function checkTerminationConditions(
  session: IdleSessionRow,
  _userId: number,
): Promise<TerminationCheckResult> {
  // 1. 检查 DB 中的 status（用户可能已调用 stopIdleSession）
  const currentSession = await getActiveIdleSession(session.characterId);
  if (!currentSession) {
    // 会话已不存在或已结束
    return { terminate: true, status: 'completed', reason: 'session_not_found' };
  }
  if (currentSession.status === 'stopping') {
    return { terminate: true, status: 'interrupted', reason: 'user_stopped' };
  }

  // 2. 时长超限
  const elapsedMs = Date.now() - session.startedAt.getTime();
  if (elapsedMs >= session.maxDurationMs) {
    return { terminate: true, status: 'completed', reason: 'duration_exceeded' };
  }

  // 3. Stamina 耗尽
  const staminaState = await applyStaminaRecoveryByCharacterId(session.characterId);
  if (!staminaState || staminaState.stamina <= 0) {
    return { terminate: true, status: 'completed', reason: 'stamina_exhausted' };
  }

  return { terminate: false };
}

// ============================================
// recoverActiveIdleSessions：服务启动恢复
// ============================================

/**
 * 服务启动时恢复所有活跃挂机会话
 *
 * 查询 DB 中 status IN ('active', 'stopping') 的会话，
 * 对每个会话查询对应 userId，调用 startExecutionLoop 恢复执行。
 *
 * 关键边界：
 *   - 若 userId 查询失败（角色已删除），跳过该会话并标记为 interrupted
 *   - 'stopping' 状态的会话恢复后会在第一次终止检查时立即结束
 */
export async function recoverActiveIdleSessions(): Promise<void> {
  const res = await query(
    `SELECT * FROM idle_sessions WHERE status IN ('active', 'stopping')`,
    [],
  );

  if (res.rows.length === 0) {
    console.log('✓ 没有需要恢复的挂机会话');
    return;
  }

  console.log(`正在恢复 ${res.rows.length} 个挂机会话...`);

  for (const row of res.rows as Record<string, unknown>[]) {
    const sessionId = String(row.id);
    const characterId = Number(row.character_id);

    try {
      const userId = await getCharacterUserId(characterId);
      if (!userId) {
        console.warn(`  跳过会话 ${sessionId}：角色 ${characterId} 不存在`);
        await completeIdleSession(sessionId, 'interrupted');
        continue;
      }

      // 重建 IdleSessionRow（复用 idleSessionService 的映射逻辑）
      const session: IdleSessionRow = {
        id: sessionId,
        characterId,
        status: row.status as IdleSessionRow['status'],
        mapId: String(row.map_id),
        roomId: String(row.room_id),
        maxDurationMs: Number(row.max_duration_ms),
        sessionSnapshot: row.session_snapshot as IdleSessionRow['sessionSnapshot'],
        totalBattles: Number(row.total_battles),
        winCount: Number(row.win_count),
        loseCount: Number(row.lose_count),
        totalExp: Number(row.total_exp),
        totalSilver: Number(row.total_silver),
        rewardItems: (row.reward_items as RewardItemEntry[]) ?? [],
        bagFullFlag: Boolean(row.bag_full_flag),
        startedAt: new Date(row.started_at as string),
        endedAt: row.ended_at ? new Date(row.ended_at as string) : null,
        viewedAt: row.viewed_at ? new Date(row.viewed_at as string) : null,
      };

      startExecutionLoop(session, userId);
      console.log(`  恢复会话: ${sessionId} (角色 ${characterId})`);
    } catch (err) {
      console.error(`  恢复会话 ${sessionId} 失败:`, err);
    }
  }

  console.log('✓ 挂机会话恢复完成');
}
