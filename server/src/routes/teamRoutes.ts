/**
 * 九州修仙录 - 组队系统路由
 */
import { Request, Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  getCharacterTeam,
  createTeam,
  disbandTeam,
  leaveTeam,
  applyToTeam,
  getTeamApplications,
  handleApplication,
  kickMember,
  transferLeader,
  updateTeamSettings,
  getNearbyTeams,
  getLobbyTeams,
  inviteToTeam,
  getReceivedInvitations,
  handleInvitation,
  getTeamById
} from '../services/teamService.js';
import { getSingleParam, getSingleQueryValue, parseNonEmptyText, parsePositiveInt } from '../services/shared/httpParam.js';
import { sendResult } from '../middleware/response.js';
import { BusinessError } from '../middleware/BusinessError.js';

const router = Router();

const getRequiredCharacterIdFromQuery = (req: Request): number => {
  const characterId = parsePositiveInt(getSingleQueryValue(req.query.characterId));
  if (!characterId) {
    throw new BusinessError('缺少角色ID');
  }
  return characterId;
};

const getRequiredTeamIdParam = (req: Request): string => {
  const teamId = parseNonEmptyText(getSingleParam(req.params.teamId));
  if (!teamId) {
    throw new BusinessError('缺少队伍ID');
  }
  return teamId;
};

// 获取角色当前队伍
router.get('/my', asyncHandler(async (req, res) => {
    const characterId = getRequiredCharacterIdFromQuery(req);
    const result = await getCharacterTeam(characterId);
    sendResult(res, result);
}));

// 获取队伍详情
router.get('/:teamId', asyncHandler(async (req, res) => {
    const teamId = getRequiredTeamIdParam(req);
    const result = await getTeamById(teamId);
    sendResult(res, result);
}));


// 创建队伍
router.post('/create', asyncHandler(async (req, res) => {
    const { characterId, name, goal } = req.body;
    if (!characterId) {
      throw new BusinessError('缺少角色ID');
    }
    const result = await createTeam(characterId, name, goal);
    sendResult(res, result);
}));

// 解散队伍
router.post('/disband', asyncHandler(async (req, res) => {
    const { characterId, teamId } = req.body;
    if (!characterId || !teamId) {
      throw new BusinessError('缺少参数');
    }
    const result = await disbandTeam(characterId, teamId);
    sendResult(res, result);
}));

// 离开队伍
router.post('/leave', asyncHandler(async (req, res) => {
    const { characterId } = req.body;
    if (!characterId) {
      throw new BusinessError('缺少角色ID');
    }
    const result = await leaveTeam(characterId);
    sendResult(res, result);
}));

// 申请加入队伍
router.post('/apply', asyncHandler(async (req, res) => {
    const { characterId, teamId, message } = req.body;
    if (!characterId || !teamId) {
      throw new BusinessError('缺少参数');
    }
    const result = await applyToTeam(characterId, teamId, message);
    sendResult(res, result);
}));

// 获取队伍申请列表
router.get('/applications/:teamId', asyncHandler(async (req, res) => {
    const teamId = getRequiredTeamIdParam(req);
    const characterId = getRequiredCharacterIdFromQuery(req);
    const result = await getTeamApplications(teamId, characterId);
    sendResult(res, result);
}));

// 处理入队申请
router.post('/application/handle', asyncHandler(async (req, res) => {
    const { characterId, applicationId, approve } = req.body;
    if (!characterId || !applicationId || approve === undefined) {
      throw new BusinessError('缺少参数');
    }
    const result = await handleApplication(characterId, applicationId, approve);
    sendResult(res, result);
}));

// 踢出成员
router.post('/kick', asyncHandler(async (req, res) => {
    const { leaderId, targetCharacterId } = req.body;
    if (!leaderId || !targetCharacterId) {
      throw new BusinessError('缺少参数');
    }
    const result = await kickMember(leaderId, targetCharacterId);
    sendResult(res, result);
}));

// 转让队长
router.post('/transfer', asyncHandler(async (req, res) => {
    const { currentLeaderId, newLeaderId } = req.body;
    if (!currentLeaderId || !newLeaderId) {
      throw new BusinessError('缺少参数');
    }
    const result = await transferLeader(currentLeaderId, newLeaderId);
    sendResult(res, result);
}));

// 更新队伍设置
router.post('/settings', asyncHandler(async (req, res) => {
    const { characterId, teamId, settings } = req.body;
    if (!characterId || !teamId) {
      throw new BusinessError('缺少参数');
    }
    const result = await updateTeamSettings(characterId, teamId, settings);
    sendResult(res, result);
}));

// 获取附近队伍
router.get('/nearby/list', asyncHandler(async (req, res) => {
    const characterId = getRequiredCharacterIdFromQuery(req);
    const mapId = parseNonEmptyText(getSingleQueryValue(req.query.mapId)) ?? undefined;
    const result = await getNearbyTeams(characterId, mapId);
    sendResult(res, result);
}));

// 获取队伍大厅
router.get('/lobby/list', asyncHandler(async (req, res) => {
    const characterId = getRequiredCharacterIdFromQuery(req);
    const search = parseNonEmptyText(getSingleQueryValue(req.query.search)) ?? undefined;
    const limit = parsePositiveInt(getSingleQueryValue(req.query.limit)) ?? undefined;
    const result = await getLobbyTeams(characterId, search, limit);
    sendResult(res, result);
}));

// 邀请玩家入队
router.post('/invite', asyncHandler(async (req, res) => {
    const { inviterId, inviteeId, message } = req.body;
    if (!inviterId || !inviteeId) {
      throw new BusinessError('缺少参数');
    }
    const result = await inviteToTeam(inviterId, inviteeId, message);
    sendResult(res, result);
}));

// 获取收到的邀请
router.get('/invitations/received', asyncHandler(async (req, res) => {
    const characterId = getRequiredCharacterIdFromQuery(req);
    const result = await getReceivedInvitations(characterId);
    sendResult(res, result);
}));

// 处理入队邀请
router.post('/invitation/handle', asyncHandler(async (req, res) => {
    const { characterId, invitationId, accept } = req.body;
    if (!characterId || !invitationId || accept === undefined) {
      throw new BusinessError('缺少参数');
    }
    const result = await handleInvitation(characterId, invitationId, accept);
    sendResult(res, result);
}));

export default router;
