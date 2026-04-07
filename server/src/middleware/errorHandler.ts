/**
 * 全局错误处理中间件。
 * 作用：统一捕获路由层未处理的异常，返回标准 JSON 错误响应 { success, message }。
 * 输入：Express 错误对象（通过 next(error) 或 asyncHandler 自动转发）。
 * 输出：标准 JSON 响应。
 *
 * 数据流：路由抛出异常 -> asyncHandler catch -> next(error) -> 本中间件 -> res.json
 *
 * 边界条件：
 * 1) BusinessError：保留原始 message 和 statusCode，让客户端展示有意义的提示。
 * 2) 非 BusinessError：统一返回 500 + "服务器错误"，避免泄露内部信息。
 * 3) 若 response 已发送（res.headersSent），委托给 Express 默认错误处理。
 */
import type { Request, Response, NextFunction } from 'express';
import { BusinessError } from './BusinessError.js';

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (res.headersSent) return;

  if (err instanceof BusinessError) {
    console.warn(`[业务错误] ${err.message}`);
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }

  console.error('[系统错误]', err);
  res.status(500).json({ success: false, message: '服务器错误' });
};
