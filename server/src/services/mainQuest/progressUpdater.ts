/**
 * 主线任务目标进度统一更新器
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：统一处理主线目标事件匹配、批量推进、单次行锁读取与最终写回。
 * - 不做什么：不负责章节推进、对话流转、奖励发放，也不做事务开启。
 *
 * 输入/输出：
 * - 输入：`characterId` 与一个或多个 `MainQuestProgressEvent`。
 * - 输出：`{ success, message, updated, completed }`，表示本次是否推进以及是否进入可交付状态。
 *
 * 数据流/状态流：
 * - 先对 `character_main_quest_progress` 执行一次 `FOR UPDATE`，拿到当前任务节与目标进度；
 * - 再把所有事件按顺序应用到同一份进度快照；
 * - 最后统一写回一次，避免“同一事务内同一角色进度行被重复锁/重复更新”。
 *
 * 关键边界条件与坑点：
 * 1) 只在 `section_status='objectives'` 时推进，其他状态直接短路，避免误改对话/提交阶段。
 * 2) 批量事件会共享同一份内存进度快照，顺序敏感但不会突破各目标 `target` 上限。
 */
import { query } from '../../config/database.js';
import { getRealmOrderIndex } from '../shared/realmRules.js';
import { getMainQuestSectionById, getTechniqueDefinitions } from '../staticConfigLoader.js';
import { asArray, asNumber, asObject, asString } from '../shared/typeCoercion.js';
import type { MainQuestProgressEvent } from './types.js';

type ProgressUpdateResult = {
  success: boolean;
  message: string;
  updated: boolean;
  completed: boolean;
};

type ObjectiveRecord = {
  id?: unknown;
  type?: unknown;
  target?: unknown;
  params?: unknown;
};

type LockedProgressSnapshot = {
  currentProgress: Record<string, number>;
  objectives: ObjectiveRecord[];
};

type MainQuestProgressBatchInput = {
  characterId: number;
  events: MainQuestProgressEvent[];
};

type MainQuestProgressMutationRow = {
  characterId: number;
  currentProgress: Record<string, number>;
  nextSectionStatus: 'turnin' | null;
};

const resolveTechniqueQuality = (techniqueId: string): string => {
  const techniqueDef = getTechniqueDefinitions().find(
    (entry) => entry.id === techniqueId && entry.enabled !== false,
  );
  return asString(techniqueDef?.quality).trim();
};

const getIncrementByEvent = (
  objective: ObjectiveRecord,
  event: MainQuestProgressEvent,
): number => {
  const objectiveType = asString(objective.type).trim();
  const params = asObject(objective.params);

  if (objectiveType === 'talk_npc' && event.type === 'talk_npc') {
    const requiredNpcId = asString(params.npc_id).trim();
    return !requiredNpcId || requiredNpcId === event.npcId ? 1 : 0;
  }

  if (objectiveType === 'kill_monster' && event.type === 'kill_monster') {
    const requiredMonsterId = asString(params.monster_id).trim();
    return !requiredMonsterId || requiredMonsterId === event.monsterId
      ? Math.max(1, Math.floor(event.count))
      : 0;
  }

  if (objectiveType === 'gather_resource' && event.type === 'gather_resource') {
    const requiredResourceId = asString(params.resource_id).trim();
    return !requiredResourceId || requiredResourceId === event.resourceId
      ? Math.max(1, Math.floor(event.count))
      : 0;
  }

  if (objectiveType === 'collect' && event.type === 'collect') {
    const requiredItemId = asString(params.item_id).trim();
    return !requiredItemId || requiredItemId === event.itemId
      ? Math.max(1, Math.floor(event.count))
      : 0;
  }

  if (objectiveType === 'dungeon_clear' && event.type === 'dungeon_clear') {
    const requiredDungeonId = asString(params.dungeon_id).trim();
    const requiredDifficultyId = asString(params.difficulty_id).trim();
    const dungeonMatch = !requiredDungeonId || requiredDungeonId === event.dungeonId;
    const difficultyMatch = !requiredDifficultyId || requiredDifficultyId === (event.difficultyId ?? '');
    return dungeonMatch && difficultyMatch ? Math.max(1, Math.floor(event.count)) : 0;
  }

  if (objectiveType === 'craft_item' && event.type === 'craft_item') {
    const requiredRecipeId = asString(params.recipe_id).trim();
    const requiredRecipeType = asString(params.recipe_type).trim();
    const requiredCraftKind = asString(params.craft_kind).trim();
    const requiredItemId = asString(params.item_id).trim();

    const recipeIdMatch = !requiredRecipeId || requiredRecipeId === (event.recipeId ?? '');
    const recipeTypeMatch = !requiredRecipeType || requiredRecipeType === (event.recipeType ?? '');
    const craftKindMatch = !requiredCraftKind || requiredCraftKind === (event.craftKind ?? '');
    const itemIdMatch = !requiredItemId || requiredItemId === (event.itemId ?? '');

    return recipeIdMatch && recipeTypeMatch && craftKindMatch && itemIdMatch
      ? Math.max(1, Math.floor(event.count))
      : 0;
  }

  if (objectiveType === 'reach' && event.type === 'reach') {
    const requiredRoomId = asString(params.room_id).trim();
    return !requiredRoomId || requiredRoomId === event.roomId ? 1 : 0;
  }

  if (objectiveType === 'upgrade_technique' && event.type === 'upgrade_technique') {
    const requiredTechniqueId = asString(params.technique_id).trim();
    const requiredQuality = asString(params.quality).trim();
    const requiredLayer = asNumber(params.layer, 0);
    const layerMatch = requiredLayer <= 0 || event.layer >= requiredLayer;
    if (!layerMatch) return 0;
    if (requiredTechniqueId) {
      return requiredTechniqueId === event.techniqueId ? 1 : 0;
    }
    if (requiredQuality) {
      return resolveTechniqueQuality(event.techniqueId) === requiredQuality ? 1 : 0;
    }
    return 1;
  }

  if (objectiveType === 'upgrade_realm' && event.type === 'upgrade_realm') {
    const requiredRealm = asString(params.realm).trim();
    if (!requiredRealm) return 1;
    const requiredIndex = getRealmOrderIndex(requiredRealm);
    const eventIndex = getRealmOrderIndex(event.realm);
    return requiredIndex >= 0 && eventIndex >= requiredIndex ? 1 : 0;
  }

  return 0;
};

const loadLockedProgressSnapshot = async (
  characterId: number,
): Promise<LockedProgressSnapshot | null> => {
  const progressRes = await query(
    `SELECT current_section_id, section_status, objectives_progress
     FROM character_main_quest_progress
     WHERE character_id = $1 FOR UPDATE`,
    [characterId],
  );
  if (!progressRes.rows?.[0]) {
    return null;
  }

  const progress = progressRes.rows[0] as {
    current_section_id?: unknown;
    section_status?: unknown;
    objectives_progress?: unknown;
  };
  if (asString(progress.section_status) !== 'objectives') {
    return { currentProgress: {}, objectives: [] };
  }

  const sectionId = asString(progress.current_section_id).trim();
  if (!sectionId) {
    throw new Error('当前任务节不存在');
  }

  const sectionDef = getMainQuestSectionById(sectionId);
  if (!sectionDef) {
    throw new Error('任务节配置不存在');
  }

  return {
    currentProgress: asObject(progress.objectives_progress) as Record<string, number>,
    objectives: asArray<ObjectiveRecord>(sectionDef.objectives),
  };
};

const normalizeMainQuestProgressBatchInputs = (
  inputs: MainQuestProgressBatchInput[],
): MainQuestProgressBatchInput[] => {
  const eventsByCharacterId = new Map<number, MainQuestProgressEvent[]>();

  for (const input of inputs) {
    const characterId = Math.floor(Number(input.characterId));
    if (!Number.isFinite(characterId) || characterId <= 0) continue;
    if (input.events.length <= 0) continue;

    const existingEvents = eventsByCharacterId.get(characterId);
    if (existingEvents) {
      existingEvents.push(...input.events);
      continue;
    }
    eventsByCharacterId.set(characterId, [...input.events]);
  }

  return [...eventsByCharacterId.entries()].map(([characterId, events]) => ({
    characterId,
    events,
  }));
};

const loadLockedProgressSnapshotsBatch = async (
  characterIds: readonly number[],
): Promise<Map<number, LockedProgressSnapshot | null>> => {
  const normalizedCharacterIds = [...new Set(
    characterIds
      .map((characterId) => Math.floor(Number(characterId)))
      .filter((characterId) => Number.isFinite(characterId) && characterId > 0),
  )];
  if (normalizedCharacterIds.length <= 0) {
    return new Map<number, LockedProgressSnapshot | null>();
  }

  const progressRes = await query(
    `SELECT character_id, current_section_id, section_status, objectives_progress
     FROM character_main_quest_progress
     WHERE character_id = ANY($1::int[])
     FOR UPDATE`,
    [normalizedCharacterIds],
  );

  const snapshotByCharacterId = new Map<number, LockedProgressSnapshot | null>();
  for (const characterId of normalizedCharacterIds) {
    snapshotByCharacterId.set(characterId, null);
  }

  for (const row of progressRes.rows as Array<Record<string, unknown>>) {
    const characterId = Math.floor(asNumber(row.character_id, 0));
    if (!Number.isFinite(characterId) || characterId <= 0) continue;

    if (asString(row.section_status) !== 'objectives') {
      snapshotByCharacterId.set(characterId, { currentProgress: {}, objectives: [] });
      continue;
    }

    const sectionId = asString(row.current_section_id).trim();
    if (!sectionId) {
      throw new Error('当前任务节不存在');
    }

    const sectionDef = getMainQuestSectionById(sectionId);
    if (!sectionDef) {
      throw new Error('任务节配置不存在');
    }

    snapshotByCharacterId.set(characterId, {
      currentProgress: asObject(row.objectives_progress) as Record<string, number>,
      objectives: asArray<ObjectiveRecord>(sectionDef.objectives),
    });
  }

  return snapshotByCharacterId;
};

/**
 * 主线任务目标批量更新器。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把多角色主线目标推进收敛成“一次批量行锁读取 + 一次批量写回”，避免多人掉落/击杀链路为每个角色重复锁表。
 * 2. 做什么：保持单角色入口完全复用同一份事件匹配语义，避免 collect/kill 等热点入口和主线推进规则漂移。
 * 3. 不做什么：不负责章节切换与奖励发放，也不负责开启事务。
 *
 * 输入/输出：
 * - 输入：多角色事件数组，每个角色可以带一批主线事件。
 * - 输出：`Map<characterId, ProgressUpdateResult>`，供上层按角色判断是否真的命中主线目标。
 *
 * 数据流/状态流：
 * 多角色事件 -> 一次性锁定 `character_main_quest_progress`
 * -> 内存态匹配并累计 objectives_progress
 * -> 一次批量 UPDATE 写回 `objectives_progress/section_status`。
 *
 * 复用设计说明：
 * 1. 单角色 `updateSectionProgressByEvents` 直接委托给这里，确保单人和多人热点入口永远共用同一份批量协议。
 * 2. 收集事件与击杀事件都能复用该入口，避免在 taskService 里继续维护两套“主线推进循环”。
 *
 * 关键边界条件与坑点：
 * 1. 只有 `section_status='objectives'` 的角色会参与推进；其他状态必须保留原样，不能误写为 `turnin`。
 * 2. 同一角色一批事件共享同一份内存快照，必须在单次写回前把目标上限截断，避免重复事件把进度写穿。
 */
export const updateSectionProgressByEventsBatch = async (
  inputs: MainQuestProgressBatchInput[],
): Promise<Map<number, ProgressUpdateResult>> => {
  const normalizedInputs = normalizeMainQuestProgressBatchInputs(inputs);
  const resultByCharacterId = new Map<number, ProgressUpdateResult>();
  if (normalizedInputs.length <= 0) {
    return resultByCharacterId;
  }

  const snapshotByCharacterId = await loadLockedProgressSnapshotsBatch(
    normalizedInputs.map((input) => input.characterId),
  );
  const mutationRows: MainQuestProgressMutationRow[] = [];

  for (const input of normalizedInputs) {
    const snapshot = snapshotByCharacterId.get(input.characterId) ?? null;
    if (!snapshot) {
      resultByCharacterId.set(input.characterId, {
        success: false,
        message: '主线进度不存在',
        updated: false,
        completed: false,
      });
      continue;
    }
    if (snapshot.objectives.length <= 0) {
      resultByCharacterId.set(input.characterId, {
        success: true,
        message: '当前不在目标阶段',
        updated: false,
        completed: false,
      });
      continue;
    }

    const currentProgress = { ...snapshot.currentProgress };
    let updated = false;

    for (const event of input.events) {
      for (const objective of snapshot.objectives) {
        const objectiveId = asString(objective.id).trim();
        const target = Math.max(1, Math.floor(asNumber(objective.target, 1)));
        if (!objectiveId) continue;

        const current = asNumber(currentProgress[objectiveId], 0);
        if (current >= target) continue;

        const increment = getIncrementByEvent(objective, event);
        if (increment <= 0) continue;

        currentProgress[objectiveId] = Math.min(target, current + increment);
        updated = true;
      }
    }

    if (!updated) {
      resultByCharacterId.set(input.characterId, {
        success: true,
        message: '无匹配目标',
        updated: false,
        completed: false,
      });
      continue;
    }

    const completed = snapshot.objectives.every((objective) => {
      const objectiveId = asString(objective.id).trim();
      const target = Math.max(1, Math.floor(asNumber(objective.target, 1)));
      return objectiveId.length === 0 || asNumber(currentProgress[objectiveId], 0) >= target;
    });

    mutationRows.push({
      characterId: input.characterId,
      currentProgress,
      nextSectionStatus: completed ? 'turnin' : null,
    });
    resultByCharacterId.set(input.characterId, {
      success: true,
      message: completed ? '目标已全部完成' : '进度已更新',
      updated: true,
      completed,
    });
  }

  if (mutationRows.length > 0) {
    await query(
      `
        WITH next_rows AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb)
            AS x(character_id int, objectives_progress jsonb, next_section_status varchar(16))
        )
        UPDATE character_main_quest_progress AS progress_row
        SET objectives_progress = next_rows.objectives_progress,
            section_status = COALESCE(next_rows.next_section_status, progress_row.section_status),
            updated_at = NOW()
        FROM next_rows
        WHERE progress_row.character_id = next_rows.character_id
      `,
      [JSON.stringify(mutationRows.map((row) => ({
        character_id: row.characterId,
        objectives_progress: row.currentProgress,
        next_section_status: row.nextSectionStatus,
      })))],
    );
  }

  return resultByCharacterId;
};

export const updateSectionProgressByEvents = async (
  characterId: number,
  events: MainQuestProgressEvent[],
): Promise<ProgressUpdateResult> => {
  const resultByCharacterId = await updateSectionProgressByEventsBatch([{ characterId, events }]);
  return resultByCharacterId.get(Number(characterId)) ?? {
    success: false,
    message: '主线进度不存在',
    updated: false,
    completed: false,
  };
};

export const updateSectionProgressByEvent = async (
  characterId: number,
  event: MainQuestProgressEvent,
): Promise<ProgressUpdateResult> => {
  return updateSectionProgressByEvents(characterId, [event]);
};
