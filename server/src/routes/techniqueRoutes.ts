import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getOptionalUserId } from '../middleware/auth.js';
import { getEnabledTechniqueDefs, getTechniqueDetailById } from '../services/techniqueService.js';
import { getSingleParam } from '../services/shared/httpParam.js';
import { getCharacterIdByUserId } from '../services/shared/characterId.js';
import { sendSuccess } from '../middleware/response.js';
import { BusinessError } from '../middleware/BusinessError.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const techniques = await getEnabledTechniqueDefs();
  sendSuccess(res, { techniques });
}));

router.get('/:techniqueId', asyncHandler(async (req, res) => {
  const techniqueId = getSingleParam(req.params.techniqueId);
  const userId = getOptionalUserId(req);
  const viewerCharacterId = userId ? await getCharacterIdByUserId(userId) : null;
  const detail = await getTechniqueDetailById(techniqueId, { viewerCharacterId });
  if (!detail) {
    throw new BusinessError('未找到功法', 404);
  }
  sendSuccess(res, detail);
}));

export default router;
