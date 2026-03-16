/**
 * 爱发电私信失败重试调度器
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：定时扫描到期的爱发电私信任务，并调用统一投递服务重试。
 * 2. 做什么：统一管理单进程内的定时器与并发互斥，避免 webhook、启动流程和手动脚本重复写调度逻辑。
 * 3. 不做什么：不创建任务、不拼私信文案，也不处理 webhook 签名。
 *
 * 输入/输出：
 * - 输入：环境变量中的启用状态、扫描间隔与批量处理数量。
 * - 输出：无直接返回；副作用为驱动待重试任务进入 sent/failed。
 *
 * 数据流/状态流：
 * startupPipeline -> initializeAfdianMessageRetryService -> setInterval -> afdianMessageDeliveryService.runDueRetriesOnce。
 *
 * 关键边界条件与坑点：
 * 1. 同一进程内必须用 `inFlight` 互斥，避免上一轮网络请求未结束时又开始下一轮重试。
 * 2. 这里只负责“到期任务调度”，具体发送成功/失败与下次时间计算全部复用投递服务，不能在调度层再写一套规则。
 */
import { afdianMessageDeliveryService } from './afdianMessageDeliveryService.js';

const parseEnvBoolean = (name: string, fallback: boolean): boolean => {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
};

const parseEnvInteger = (name: string, fallback: number, min: number, max: number): number => {
  const raw = String(process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const AFDIAN_MESSAGE_RETRY_ENABLED = parseEnvBoolean('AFDIAN_MESSAGE_RETRY_ENABLED', true);
const AFDIAN_MESSAGE_RETRY_INTERVAL_MS =
  parseEnvInteger('AFDIAN_MESSAGE_RETRY_INTERVAL_SECONDS', 60, 10, 3600) * 1000;
const AFDIAN_MESSAGE_RETRY_BATCH_SIZE =
  parseEnvInteger('AFDIAN_MESSAGE_RETRY_BATCH_SIZE', 10, 1, 50);

class AfdianMessageRetryService {
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;
  private initialized = false;

  private async runOnce(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const handledCount = await afdianMessageDeliveryService.runDueRetriesOnce(AFDIAN_MESSAGE_RETRY_BATCH_SIZE);
      if (handledCount > 0) {
        console.log(`[AfdianMessageRetry] 本轮重试处理 ${String(handledCount)} 条私信任务`);
      }
    } catch (error) {
      console.error('[AfdianMessageRetry] 扫描失败:', error);
    } finally {
      this.inFlight = false;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized || !AFDIAN_MESSAGE_RETRY_ENABLED) return;
    this.initialized = true;
    console.log(
      `[AfdianMessageRetry] 已启动：间隔 ${String(Math.floor(AFDIAN_MESSAGE_RETRY_INTERVAL_MS / 1000))} 秒，批量 ${String(AFDIAN_MESSAGE_RETRY_BATCH_SIZE)} 条`,
    );
    await this.runOnce();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, AFDIAN_MESSAGE_RETRY_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.inFlight = false;
    this.initialized = false;
  }
}

const service = new AfdianMessageRetryService();

export const initializeAfdianMessageRetryService = service.initialize.bind(service);
export const stopAfdianMessageRetryService = service.stop.bind(service);
