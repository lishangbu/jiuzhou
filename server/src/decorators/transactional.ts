/**
 * 事务方法装饰器
 *
 * 作用：
 * - 标记 class 方法在数据库事务中执行
 * - 已在事务中时直接执行（复用上下文），不在事务中时自动开启新事务
 * - 成功 return → COMMIT，抛异常 → ROLLBACK
 *
 * 复用点：所有需要事务保证的 service 方法统一使用此装饰器
 *
 * 边界条件：
 * 1) 只能装饰返回 Promise 的异步方法
 * 2) 装饰器内部通过 isInTransaction() 判断嵌套，避免不必要的 SAVEPOINT
 */
import { withTransaction, isInTransaction } from '../config/database.js';

export function Transactional<A extends unknown[], R>(
  target: (this: unknown, ...args: A) => Promise<R>,
  _context: ClassMethodDecoratorContext,
): (this: unknown, ...args: A) => Promise<R> {
  return function (this: unknown, ...args: A): Promise<R> {
    if (isInTransaction()) {
      return target.call(this, ...args);
    }
    return withTransaction(() => target.call(this, ...args));
  };
}
