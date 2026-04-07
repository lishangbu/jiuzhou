/**
 * 宗门每日维护费服务
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中处理“每个现实自然日按宗门人数扣除维护费”的批量结算，避免时间服务、宗门核心服务各自维护一套扣费 SQL。
 * 2. 做什么：以单次批量 UPDATE + INSERT 方式同时完成资金扣减与日志写入，保证高频跨天结算时仍保持低查询次数。
 * 3. 不做什么：不推进游戏时间，不决定何时跨天，也不负责宗门详情缓存失效时机。
 *
 * 输入/输出：
 * - 输入：`dayToken` 表示当前要结算的现实自然日 token；`dayKey` 表示该自然日对应的 `YYYY-MM-DD` 文案。
 * - 输出：返回本次被扣费的宗门 ID 列表，供外层在事务提交后统一失效缓存。
 *
 * 数据流/状态流：
 * - 游戏时间服务识别跨天 -> 调用本模块
 * - 本模块批量更新 `sect_def.funds` -> 批量写入 `sect_log`
 * - 外层拿到受影响宗门 ID 后统一失效宗门详情缓存。
 *
 * 复用设计说明：
 * 1. 宗门维护费公式、日志文案和批量 SQL 都只维护这一份，后续若还要接宗门日报、统计或更多跨天宗门扣费，都可以继续复用同一入口。
 * 2. 返回“受影响宗门 ID 列表”而不是在内部直接操作缓存，能让时间服务把多天补结算的失效动作合并成单一出口，减少重复缓存抖动。
 *
 * 关键边界条件与坑点：
 * 1. 本模块必须运行在事务上下文中；否则会出现“资金已扣但时间状态未推进”或反过来的状态撕裂。
 * 2. 日志写入必须和资金扣减处于同一条 SQL 事务里；否则补结算或服务重试时会丢失当天的运营记录。
 */
import { getTransactionClient, isInTransaction, query } from '../../config/database.js';

const SECT_DAILY_MAINTENANCE_PER_MEMBER = 100;
const SECT_DAILY_MAINTENANCE_LOCK_NAMESPACE = 4101;
const SECT_DAILY_MAINTENANCE_LOG_TYPE = 'daily_maintenance';

interface SettledSectRow {
  sect_id: string;
}

interface ApplySectDailyMaintenanceParams {
  dayKey: string;
  dayToken: number;
}

export const applySectDailyMaintenanceTx = async (
  params: ApplySectDailyMaintenanceParams,
): Promise<string[]> => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.dayKey)) {
    throw new Error(`宗门每日维护费结算参数错误: dayKey=${String(params.dayKey)}`);
  }
  if (!Number.isInteger(params.dayToken) || params.dayToken <= 0) {
    throw new Error(`宗门每日维护费结算参数错误: dayToken=${String(params.dayToken)}`);
  }
  if (!isInTransaction()) {
    throw new Error('宗门每日维护费结算必须在事务上下文中执行');
  }

  const client = getTransactionClient();
  if (!client) {
    throw new Error('宗门每日维护费结算失败：事务连接不存在');
  }

  await client.query(
    'SELECT pg_advisory_xact_lock($1::integer, $2::integer)',
    [SECT_DAILY_MAINTENANCE_LOCK_NAMESPACE, params.dayToken],
  );

  const result = await query<SettledSectRow>(
    `
      WITH updated AS (
        UPDATE sect_def AS sd
        SET
          funds = sd.funds - (sd.member_count * $1),
          updated_at = NOW()
        WHERE sd.member_count > 0
        RETURNING sd.id AS sect_id, sd.member_count
      )
      INSERT INTO sect_log (sect_id, log_type, operator_id, target_id, content)
      SELECT
        updated.sect_id,
        $2::varchar,
        NULL,
        NULL,
        format(
          '%s宗门维护：成员%s人，扣除资金%s',
          $3::text,
          updated.member_count,
          updated.member_count * $1
        )
      FROM updated
      RETURNING sect_id
    `,
    [
      SECT_DAILY_MAINTENANCE_PER_MEMBER,
      SECT_DAILY_MAINTENANCE_LOG_TYPE,
      params.dayKey,
    ],
  );

  return Array.from(new Set(result.rows.map((row) => row.sect_id)));
};
