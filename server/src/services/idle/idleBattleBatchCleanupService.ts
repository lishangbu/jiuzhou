import { query } from '../../config/database.js';

/**
 * idle_battle_batches 清理服务（仅负责清理逻辑，不负责定时调度）
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：按保留天数清理 idle_battle_batches 的过期战斗批次，控制表体积增长。
 * 2. 做什么：仅清理已结束会话（completed/interrupted）关联的批次，避免影响活跃挂机会话。
 * 3. 不做什么：不创建 setInterval，不管理线程生命周期；调度统一交给 cleanupWorker。
 *
 * 输入/输出：
 * - 输入：环境变量（是否启用、保留天数、调度间隔、单批删除量、单轮最大批次数）。
 * - 输出：runCleanupOnce 返回本轮删除条数；getScheduleConfig 返回调度配置。
 *
 * 数据流/状态流：
 * cleanupWorker -> getScheduleConfig -> runCleanupOnce
 * -> advisory lock -> 分批 DELETE idle_battle_batches -> 返回删除统计
 *
 * 关键边界条件与坑点：
 * 1. 多实例部署使用 pg_try_advisory_lock，避免多个实例并发清理同一批数据。
 * 2. 单轮清理采用“单批上限 + 最大批次数”限制，避免单次事务过大导致锁等待/WAL 激增。
 */

type IdleCleanupConfig = {
  enabled: boolean;
  retentionDays: number;
  intervalMs: number;
  deleteBatchSize: number;
  maxDeleteBatchesPerRun: number;
};

export type IdleBattleBatchCleanupScheduleConfig = {
  enabled: boolean;
  intervalMs: number;
};

const IDLE_FINISHED_SESSION_STATUSES = ['completed', 'interrupted'] as const;
const IDLE_CLEANUP_LOCK_KEY_1 = 2026;
const IDLE_CLEANUP_LOCK_KEY_2 = 311;
const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_INTERVAL_SECONDS = 600;
const DEFAULT_DELETE_BATCH_SIZE = 5_000;
const DEFAULT_MAX_DELETE_BATCHES_PER_RUN = 20;

function parseEnvBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;

  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;

  console.warn(`[IdleBatchCleanup] 环境变量 ${name}=${raw} 非法，回退默认值 ${String(fallback)}`);
  return fallback;
}

function parseEnvInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    console.warn(`[IdleBatchCleanup] 环境变量 ${name}=${raw} 非法，回退默认值 ${fallback}`);
    return fallback;
  }

  if (parsed < min) {
    console.warn(`[IdleBatchCleanup] 环境变量 ${name}=${raw} 过小，提升到最小值 ${min}`);
    return min;
  }
  if (parsed > max) {
    console.warn(`[IdleBatchCleanup] 环境变量 ${name}=${raw} 过大，降低到最大值 ${max}`);
    return max;
  }

  return Math.floor(parsed);
}

function loadIdleCleanupConfig(): IdleCleanupConfig {
  const enabled = parseEnvBoolean('IDLE_BATCH_CLEANUP_ENABLED', true);
  const retentionDays = parseEnvInteger('IDLE_BATCH_RETENTION_DAYS', DEFAULT_RETENTION_DAYS, 1, 365);
  const intervalSeconds = parseEnvInteger('IDLE_BATCH_CLEANUP_INTERVAL_SECONDS', DEFAULT_INTERVAL_SECONDS, 60, 86_400);
  const deleteBatchSize = parseEnvInteger('IDLE_BATCH_CLEANUP_DELETE_BATCH_SIZE', DEFAULT_DELETE_BATCH_SIZE, 100, 50_000);
  const maxDeleteBatchesPerRun = parseEnvInteger(
    'IDLE_BATCH_CLEANUP_MAX_BATCHES_PER_RUN',
    DEFAULT_MAX_DELETE_BATCHES_PER_RUN,
    1,
    200,
  );

  return {
    enabled,
    retentionDays,
    intervalMs: intervalSeconds * 1000,
    deleteBatchSize,
    maxDeleteBatchesPerRun,
  };
}

class IdleBattleBatchCleanupService {
  private readonly config: IdleCleanupConfig = loadIdleCleanupConfig();
  private inFlight = false;

  getScheduleConfig(): IdleBattleBatchCleanupScheduleConfig {
    return {
      enabled: this.config.enabled,
      intervalMs: this.config.intervalMs,
    };
  }

  getConfigSummaryText(): string {
    return `保留 ${this.config.retentionDays} 天，间隔 ${Math.floor(
      this.config.intervalMs / 1000,
    )} 秒，单批 ${this.config.deleteBatchSize} 条，单轮最多 ${this.config.maxDeleteBatchesPerRun} 批`;
  }

  private async deleteExpiredBatchesOnce(): Promise<number> {
    const res = await query(
      `
      WITH stale_batch AS (
        SELECT b.id
        FROM idle_battle_batches b
        JOIN idle_sessions s ON s.id = b.session_id
        WHERE b.executed_at < NOW() - ($1::int * INTERVAL '1 day')
          AND s.status = ANY($2::varchar[])
        ORDER BY b.executed_at ASC
        LIMIT $3
      )
      DELETE FROM idle_battle_batches b
      USING stale_batch
      WHERE b.id = stale_batch.id
    `,
      [this.config.retentionDays, IDLE_FINISHED_SESSION_STATUSES, this.config.deleteBatchSize],
    );

    return res.rowCount ?? 0;
  }

  async runCleanupOnce(): Promise<number> {
    if (!this.config.enabled) return 0;
    if (this.inFlight) return 0;
    this.inFlight = true;

    let lockAcquired = false;
    try {
      const lockRes = await query(`SELECT pg_try_advisory_lock($1, $2) AS locked`, [
        IDLE_CLEANUP_LOCK_KEY_1,
        IDLE_CLEANUP_LOCK_KEY_2,
      ]);
      lockAcquired = lockRes.rows[0]?.locked === true;
      if (!lockAcquired) return 0;

      let totalDeleted = 0;
      for (let batchNo = 0; batchNo < this.config.maxDeleteBatchesPerRun; batchNo += 1) {
        const deletedCount = await this.deleteExpiredBatchesOnce();
        totalDeleted += deletedCount;

        if (deletedCount < this.config.deleteBatchSize) {
          break;
        }
      }

      if (totalDeleted > 0) {
        console.log(
          `[IdleBatchCleanup] 本轮清理完成：删除 ${totalDeleted} 条（保留 ${this.config.retentionDays} 天内数据）`,
        );
      }
      return totalDeleted;
    } catch (error) {
      console.error('[IdleBatchCleanup] 清理失败:', error);
      return 0;
    } finally {
      if (lockAcquired) {
        try {
          await query(`SELECT pg_advisory_unlock($1, $2)`, [IDLE_CLEANUP_LOCK_KEY_1, IDLE_CLEANUP_LOCK_KEY_2]);
        } catch (unlockError) {
          console.error('[IdleBatchCleanup] 释放 advisory lock 失败:', unlockError);
        }
      }
      this.inFlight = false;
    }
  }
}

export const idleBattleBatchCleanupService = new IdleBattleBatchCleanupService();
