import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireCharacter } from '../middleware/auth.js';
import {
  getMainQuestProgress,
  startDialogue,
  advanceDialogue,
  selectDialogueChoice,
  completeCurrentSection,
  getChapterList,
  getSectionList,
  setMainQuestTracked
} from '../domains/mainQuest/index.js';
import { safePushCharacterUpdate } from '../middleware/pushUpdate.js';
import { sendSuccess, sendResult } from '../middleware/response.js';
import { BusinessError } from '../middleware/BusinessError.js';
import { getSingleParam, parseNonEmptyText } from '../services/shared/httpParam.js';

const router = Router();

// 获取主线进度
router.get('/progress', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const data = await getMainQuestProgress(characterId);
  return sendSuccess(res, data);
}));

// 获取章节列表
router.get('/chapters', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const data = await getChapterList(characterId);
  return sendSuccess(res, data);
}));

// 获取章节下的任务节列表
router.get('/chapters/:chapterId/sections', requireCharacter, asyncHandler(async (req, res) => {
  const characterId = req.characterId!;

  const chapterId = parseNonEmptyText(getSingleParam(req.params.chapterId));
  if (!chapterId) {
    throw new BusinessError('章节ID不能为空');
  }
  const data = await getSectionList(characterId, chapterId);
  return sendSuccess(res, data);
}));

// 开始对话
router.post('/dialogue/start', requireCharacter, asyncHandler(async (req, res) => {
  const characterId = req.characterId!;

  const body = req.body as { dialogueId?: string };
  const dialogueId = parseNonEmptyText(body?.dialogueId) ?? undefined;

  const result = await startDialogue(characterId, dialogueId);
  return sendResult(res, result);
}));

// 推进对话
router.post('/dialogue/advance', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const result = await advanceDialogue(userId, characterId);
  if (result.success) {
    await safePushCharacterUpdate(userId);
  }
  return sendResult(res, result);
}));

// 选择对话选项
router.post('/dialogue/choice', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const body = req.body as { choiceId?: string };
  const choiceId = parseNonEmptyText(body?.choiceId);

  if (!choiceId) {
    throw new BusinessError('选项ID不能为空');
  }

  const result = await selectDialogueChoice(userId, characterId, choiceId);
  if (result.success) {
    await safePushCharacterUpdate(userId);
  }
  return sendResult(res, result);
}));

// 完成任务节并领取奖励
router.post('/section/complete', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const result = await completeCurrentSection(userId, characterId);
  if (result.success) {
    await safePushCharacterUpdate(userId);
  }
  return sendResult(res, result);
}));

// 设置主线任务追踪状态
router.post('/track', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const body = req.body as { tracked?: boolean };
  const tracked = body?.tracked === true;

  const result = await setMainQuestTracked(characterId, tracked);
  return sendResult(res, result);
}));

export default router;
