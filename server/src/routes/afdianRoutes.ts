/**
 * 爱发电 webhook 路由
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：接收爱发电订单回调，并按官方要求返回 `{ ec, em }` 结构。
 * 2. 做什么：把错误响应格式限定在本路由内，避免走全局业务错误中间件后破坏 webhook 协议。
 * 3. 不做什么：不直接写 SQL、不直接生成兑换码，业务逻辑统一下沉到 service。
 *
 * 输入/输出：
 * - 输入：爱发电 webhook JSON 负载。
 * - 输出：官方要求的回调确认 JSON。
 *
 * 数据流/状态流：
 * HTTP webhook -> afdianWebhookService -> ec/em JSON。
 *
 * 关键边界条件与坑点：
 * 1. webhook 成功回包格式必须固定，否则平台会继续重试。
 * 2. 这里只负责协议层兜底，真正的幂等与私信失败重试必须在服务层处理。
 */
import { Router, type Request, type Response } from 'express';

import { afdianWebhookService } from '../services/afdianWebhookService.js';
import type { AfdianWebhookPayload } from '../services/afdian/shared.js';

const router = Router();

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    await afdianWebhookService.handleWebhook(req.body as AfdianWebhookPayload);
    res.json({ ec: 200, em: '' });
  } catch (error) {
    console.error('[AfdianWebhook] 处理失败:', error);
    const message = error instanceof Error ? error.message : 'webhook处理失败';
    res.status(400).json({ ec: 400, em: message });
  }
});

export default router;
