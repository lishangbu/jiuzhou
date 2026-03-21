/**
 * mainQuestDialogueFlow 回归测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：锁定主线对话“中途关闭后应从断点恢复”与“进入终点提示节点后应立即完成对话阶段”两条规则。
 * - 不做什么：不验证完整主线奖励发放，也不触达真实数据库。
 *
 * 输入/输出：
 * - 输入：主线进度快照、对话节点定义，以及数据库/配置查询的 mock 响应。
 * - 输出：`startDialogueLegacy` / `advanceDialogueLegacy` 返回的对话状态与持久化写入参数。
 *
 * 数据流/状态流：
 * - 未完成对话快照 -> `startDialogueLegacy` -> 直接返回已保存的对话状态。
 * - 对话起始节点推进到终点提示节点 -> `advanceDialogueLegacy` -> 同步写入 `section_status=objectives`。
 *
 * 关键边界条件与坑点：
 * 1) 终点节点只在“无 next 且无 pending effects”时自动完成，避免误吞带效果节点。
 * 2) 测试只校验主线对话状态机，不复用真实 SQL 执行结果，避免把数据库实现细节耦进断言。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as database from '../../config/database.js';
import * as dialogueService from '../dialogueService.js';
import { advanceDialogueLegacy, startDialogueLegacy } from '../mainQuest/dialogue.js';
import * as objectiveProgress from '../mainQuest/objectiveProgress.js';
import * as questConfig from '../mainQuest/shared/questConfig.js';
import * as mainQuestService from '../mainQuest/service.js';

test('startDialogueLegacy: 未完成主线对话应从已保存节点恢复，不重新回到开头', async (t) => {
  t.mock.method(mainQuestService, 'ensureMainQuestProgressForNewChapters', async () => {});
  t.mock.method(database, 'query', async (sql: string) => {
    assert.match(sql, /SELECT current_section_id, section_status, dialogue_state/);
    return {
      rows: [{
        current_section_id: 'main-test-section',
        section_status: 'dialogue',
        dialogue_state: {
          dialogueId: 'dlg-main-test',
          currentNodeId: 'end',
          currentNode: {
            id: 'end',
            type: 'system',
            text: '目标更新：通关测试秘境。',
          },
          selectedChoices: [],
          isComplete: false,
          pendingEffects: [],
        },
      }],
    };
  });

  const result = await startDialogueLegacy(1001);
  assert.equal(result.success, true);
  if (!result.success || !result.data) {
    assert.fail('应返回已保存的主线对话状态');
  }
  assert.equal(result.data.dialogueState.currentNodeId, 'end');
  assert.equal(result.data.dialogueState.isComplete, false);
});

test('advanceDialogueLegacy: 进入终点提示节点后应立即切到 objectives，避免再额外点一次继续', async (t) => {
  const updateCalls: Array<{ sql: string; params: unknown[] | undefined }> = [];

  t.mock.method(database, 'query', async (sql: string, params?: unknown[]) => {
    if (sql.includes('SELECT dialogue_state, current_section_id, section_status')) {
      return {
        rows: [{
          dialogue_state: {
            dialogueId: 'dlg-main-test',
            currentNodeId: 'start',
            currentNode: {
              id: 'start',
              type: 'npc',
              text: '去测试秘境看一看。',
              next: 'end',
            },
            selectedChoices: [],
            isComplete: false,
            pendingEffects: [],
          },
          current_section_id: 'main-test-section',
          section_status: 'dialogue',
        }],
      };
    }

    if (sql.includes('UPDATE character_main_quest_progress')) {
      updateCalls.push({ sql, params });
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`unexpected sql: ${sql}`);
  });
  t.mock.method(dialogueService, 'loadDialogue', async (dialogueId: string) => {
    assert.equal(dialogueId, 'dlg-main-test');
    return {
      id: dialogueId,
      name: '测试主线对话',
      nodes: [
        { id: 'start', type: 'npc', text: '去测试秘境看一看。', next: 'end' },
        { id: 'end', type: 'system', text: '目标更新：通关测试秘境。' },
      ],
    };
  });
  t.mock.method(questConfig, 'getEnabledMainQuestSectionById', () => ({
    id: 'main-test-section',
    objectives: [{ id: 'obj-1', type: 'dungeon_clear', target: 1, params: { dungeon_id: 'dungeon-test' } }],
  }) as never);
  t.mock.method(objectiveProgress, 'syncCurrentSectionStaticProgress', async () => {});

  const result = await advanceDialogueLegacy(1, 1001);
  assert.equal(result.success, true);
  if (!result.success || !result.data) {
    assert.fail('推进终点提示节点后应成功返回完成态');
  }

  assert.equal(result.data.dialogueState.currentNodeId, 'end');
  assert.equal(result.data.dialogueState.isComplete, true);
  assert.equal(updateCalls.length, 1);
  assert.match(updateCalls[0]?.sql ?? '', /section_status = \$3/);
  assert.equal(updateCalls[0]?.params?.[2], 'objectives');
});
