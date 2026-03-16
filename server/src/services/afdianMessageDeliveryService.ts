/**
 * 爱发电私信投递服务
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护“订单 -> 私信任务”的建单、抢占、发送结果回写和失败重试时间计算。
 * 2. 做什么：为 webhook 即时投递和后台定时重试复用同一套状态机，避免两套发送逻辑分叉。
 * 3. 不做什么：不验证 webhook 签名、不生成兑换码，也不负责启动/停止定时器。
 *
 * 输入/输出：
 * - 输入：订单ID、接收人、私信正文，或待发送任务 ID / 批量领取数量。
 * - 输出：创建结果、抢占结果与本轮重试处理数量。
 *
 * 数据流/状态流：
 * webhook 服务 -> getOrCreateDeliveryTx -> afdian_message_delivery；
 * 即时发送/定时重试 -> claim -> send-msg -> sent/failed。
 *
 * 关键边界条件与坑点：
 * 1. 网络发送不能持有数据库行锁，因此先“抢占任务”再发请求；若进程中途退出，陈旧 `sending` 任务必须能被再次拾起。
 * 2. 失败后的下一次重试时间必须只由这里统一计算，避免 webhook 即时发送与后台重试的节奏不一致。
 */
import { query } from '../config/database.js';
import { Transactional } from '../decorators/transactional.js';
import { sendAfdianPrivateMessage } from './afdianOpenApiService.js';
import { computeAfdianMessageRetryAt } from './afdian/shared.js';

type AfdianMessageDeliveryClaimRow = {
  id: number | string;
  recipient_user_id: string;
  content: string;
  attempt_count: number;
};

const AFDIAN_MESSAGE_STALE_SENDING_SECONDS = 600;

const getErrorMessage = (
  error: Error | { message?: string } | string | null | undefined,
): string => {
  if (typeof error === 'string') {
    return error.trim() || '未知错误';
  }
  if (error instanceof Error) {
    return error.message.trim() || '未知错误';
  }
  if (error?.message) {
    return error.message.trim() || '未知错误';
  }
  return '未知错误';
};

class AfdianMessageDeliveryService {
  @Transactional
  async getOrCreateDeliveryTx(input: {
    orderId: number;
    recipientUserId: string;
    content: string;
  }): Promise<number> {
    const existing = await query(
      `
        SELECT id
        FROM afdian_message_delivery
        WHERE order_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [input.orderId],
    );
    if (existing.rows.length > 0) {
      return Number(existing.rows[0].id);
    }

    const inserted = await query(
      `
        INSERT INTO afdian_message_delivery (order_id, recipient_user_id, content)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [input.orderId, input.recipientUserId, input.content],
    );
    return Number(inserted.rows[0].id);
  }

  @Transactional
  async claimDeliveryById(id: number): Promise<AfdianMessageDeliveryClaimRow | null> {
    const claimed = await query(
      `
        UPDATE afdian_message_delivery
        SET status = 'sending',
            updated_at = NOW()
        WHERE id = $1
          AND (
            (status IN ('pending', 'failed') AND next_retry_at IS NOT NULL AND next_retry_at <= NOW())
            OR (
              status = 'sending'
              AND updated_at <= NOW() - ($2 * INTERVAL '1 second')
            )
          )
        RETURNING id, recipient_user_id, content, attempt_count
      `,
      [id, AFDIAN_MESSAGE_STALE_SENDING_SECONDS],
    );
    if (claimed.rows.length <= 0) {
      return null;
    }
    return claimed.rows[0] as AfdianMessageDeliveryClaimRow;
  }

  @Transactional
  async claimDueDeliveries(limit: number): Promise<AfdianMessageDeliveryClaimRow[]> {
    const claimed = await query(
      `
        WITH picked AS (
          SELECT id
          FROM afdian_message_delivery
          WHERE (
            (status IN ('pending', 'failed') AND next_retry_at IS NOT NULL AND next_retry_at <= NOW())
            OR (
              status = 'sending'
              AND updated_at <= NOW() - ($2 * INTERVAL '1 second')
            )
          )
          ORDER BY next_retry_at ASC NULLS FIRST, id ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE afdian_message_delivery AS delivery
        SET status = 'sending',
            updated_at = NOW()
        FROM picked
        WHERE delivery.id = picked.id
        RETURNING delivery.id, delivery.recipient_user_id, delivery.content, delivery.attempt_count
      `,
      [limit, AFDIAN_MESSAGE_STALE_SENDING_SECONDS],
    );
    return claimed.rows as AfdianMessageDeliveryClaimRow[];
  }

  async processDeliveryById(id: number): Promise<void> {
    const claimed = await this.claimDeliveryById(id);
    if (!claimed) return;
    await this.processClaimedDelivery(claimed);
  }

  async runDueRetriesOnce(limit: number): Promise<number> {
    const claimed = await this.claimDueDeliveries(limit);
    for (const row of claimed) {
      await this.processClaimedDelivery(row);
    }
    return claimed.length;
  }

  private async processClaimedDelivery(row: AfdianMessageDeliveryClaimRow): Promise<void> {
    const nextAttemptCount = Number(row.attempt_count) + 1;
    try {
      await sendAfdianPrivateMessage({
        recipient: row.recipient_user_id,
        content: row.content,
      });
      await query(
        `
          UPDATE afdian_message_delivery
          SET status = 'sent',
              attempt_count = $2,
              next_retry_at = NULL,
              last_error = NULL,
              sent_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [Number(row.id), nextAttemptCount],
      );
    } catch (error) {
      const retryAt = computeAfdianMessageRetryAt(nextAttemptCount);
      const errorMessage = getErrorMessage(error as Error | { message?: string } | string | null);
      await query(
        `
          UPDATE afdian_message_delivery
          SET status = 'failed',
              attempt_count = $2,
              next_retry_at = $3,
              last_error = $4,
              updated_at = NOW()
          WHERE id = $1
        `,
        [Number(row.id), nextAttemptCount, retryAt?.toISOString() ?? null, errorMessage],
      );
      console.error(`[AfdianMessageDelivery] 私信发送失败，deliveryId=${String(row.id)}：${errorMessage}`);
    }
  }
}

export const afdianMessageDeliveryService = new AfdianMessageDeliveryService();
