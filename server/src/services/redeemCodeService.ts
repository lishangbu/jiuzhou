/**
 * 兑换码服务
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护兑换码创建、来源幂等和兑换发奖流程，避免 webhook、后台脚本、前端兑换入口各自写一套发奖逻辑。
 * 2. 做什么：把“来源单号 -> 唯一兑换码”的关系固定在服务层，消除同一订单重复生成新码的问题。
 * 3. 不做什么：不处理爱发电 HTTP 通信、不处理私信重试调度，也不决定前端提示样式。
 *
 * 输入/输出：
 * - 输入：来源类型/来源ID/奖励载荷，或用户ID/角色ID/兑换码字符串。
 * - 输出：创建结果、兑换结果与已发放的奖励明细。
 *
 * 数据流/状态流：
 * webhook 服务 -> getOrCreateCodeBySource -> redeem_code；
 * 前端兑换接口 -> redeemCode -> 通用奖励发放器 -> redeem_code 标记已兑换。
 *
 * 关键边界条件与坑点：
 * 1. 兑换必须在事务中先锁兑换码再发奖，避免并发请求把同一份奖励发两次。
 * 2. 奖励载荷是服务端单一数据源，兑换入口只能消费这份配置，不能在路由层重新拼奖励。
 * 3. 兑换码奖励复用主线奖励发放器，避免再维护一套“银两/灵石/物品/称号”的平行逻辑。
 */
import { randomBytes } from 'node:crypto';

import { query } from '../config/database.js';
import { Transactional } from '../decorators/transactional.js';
import { grantSectionRewards } from './mainQuest/grantRewards.js';
import type { RewardResult } from './mainQuest/types.js';
import type { RedeemCodeRewardPayload } from './afdian/shared.js';

type RedeemCodeRow = {
  id: number | string;
  code: string;
  reward_payload: RedeemCodeRewardPayload;
  status: string;
};

export type RedeemCodeConsumeResult = {
  success: boolean;
  message: string;
  data?: {
    code: string;
    rewards: RewardResult[];
  };
};

const REDEEM_CODE_PREFIX = 'JZ';
const REDEEM_CODE_LENGTH_BYTES = 8;

const normalizeRedeemCode = (code: string): string => {
  return code.trim().toUpperCase();
};

const generateRedeemCode = (): string => {
  return `${REDEEM_CODE_PREFIX}${randomBytes(REDEEM_CODE_LENGTH_BYTES).toString('hex').toUpperCase()}`;
};

/**
 * 把兑换码奖励载荷映射为主线奖励发放器的统一入参。
 *
 * 设计原因：
 * - 主线奖励已经沉淀出完整的“资源/物品/功法/称号/功能解锁”发放链路；
 * - 兑换码只做字段命名对齐，避免再维护一套平行奖励解释器。
 */
const toGrantRewardsInput = (rewardPayload: RedeemCodeRewardPayload): {
  exp?: number;
  silver?: number;
  spirit_stones?: number;
  items?: Array<{ item_def_id: string; quantity: number }>;
  techniques?: string[];
  titles?: string[];
  unlock_features?: string[];
} => {
  return {
    ...(rewardPayload.exp && rewardPayload.exp > 0 ? { exp: rewardPayload.exp } : {}),
    ...(rewardPayload.silver && rewardPayload.silver > 0 ? { silver: rewardPayload.silver } : {}),
    ...(rewardPayload.spiritStones && rewardPayload.spiritStones > 0
      ? { spirit_stones: rewardPayload.spiritStones }
      : {}),
    ...(rewardPayload.items && rewardPayload.items.length > 0
      ? {
          items: rewardPayload.items.map((item) => ({
            item_def_id: item.itemDefId,
            quantity: item.quantity,
          })),
        }
      : {}),
    ...(rewardPayload.techniques && rewardPayload.techniques.length > 0
      ? { techniques: [...rewardPayload.techniques] }
      : {}),
    ...(rewardPayload.titles && rewardPayload.titles.length > 0
      ? { titles: [...rewardPayload.titles] }
      : {}),
    ...(rewardPayload.unlockFeatures && rewardPayload.unlockFeatures.length > 0
      ? { unlock_features: [...rewardPayload.unlockFeatures] }
      : {}),
  };
};

const createRedeemCodeRow = async (input: {
  sourceType: string;
  sourceRefId: string;
  rewardPayload: RedeemCodeRewardPayload;
}): Promise<{ id: number; code: string }> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateRedeemCode();
    const result = await query(
      `
        INSERT INTO redeem_code (code, source_type, source_ref_id, reward_payload)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (code) DO NOTHING
        RETURNING id, code
      `,
      [code, input.sourceType, input.sourceRefId, JSON.stringify(input.rewardPayload)],
    );
    if (result.rows.length > 0) {
      return {
        id: Number(result.rows[0].id),
        code: String(result.rows[0].code),
      };
    }
  }

  throw new Error('生成兑换码失败，请稍后重试');
};

class RedeemCodeService {
  @Transactional
  async getOrCreateCodeBySource(input: {
    sourceType: string;
    sourceRefId: string;
    rewardPayload: RedeemCodeRewardPayload;
  }): Promise<{ id: number; code: string }> {
    const existingResult = await query(
      `
        SELECT id, code
        FROM redeem_code
        WHERE source_type = $1 AND source_ref_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [input.sourceType, input.sourceRefId],
    );
    if (existingResult.rows.length > 0) {
      return {
        id: Number(existingResult.rows[0].id),
        code: String(existingResult.rows[0].code),
      };
    }

    return createRedeemCodeRow(input);
  }

  @Transactional
  async redeemCode(
    userId: number,
    characterId: number,
    code: string,
  ): Promise<RedeemCodeConsumeResult> {
    const normalizedCode = normalizeRedeemCode(code);
    if (!normalizedCode) {
      return { success: false, message: '兑换码不能为空' };
    }

    const codeResult = await query(
      `
        SELECT id, code, reward_payload, status
        FROM redeem_code
        WHERE code = $1
        LIMIT 1
        FOR UPDATE
      `,
      [normalizedCode],
    );
    if (codeResult.rows.length <= 0) {
      return { success: false, message: '兑换码不存在' };
    }

    const row = codeResult.rows[0] as RedeemCodeRow;
    if (row.status === 'redeemed') {
      return { success: false, message: '兑换码已使用' };
    }

    const rewards = await grantSectionRewards(
      userId,
      characterId,
      toGrantRewardsInput(row.reward_payload),
      {
        obtainedFrom: 'redeem_code',
        obtainedRefId: row.code,
      },
    );

    await query(
      `
        UPDATE redeem_code
        SET status = 'redeemed',
            redeemed_by_user_id = $2,
            redeemed_by_character_id = $3,
            redeemed_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [Number(row.id), userId, characterId],
    );

    return {
      success: true,
      message: '兑换成功',
      data: {
        code: row.code,
        rewards,
      },
    };
  }
}

export const redeemCodeService = new RedeemCodeService();
