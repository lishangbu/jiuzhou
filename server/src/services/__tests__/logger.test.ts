/**
 * 统一日志工具测试。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定 logger 会输出结构化 JSON，并自动携带 scope/bindings，避免后续调用方又回退成散乱字符串日志。
 * 2. 做什么：锁定非法日志级别会回落到 info，保证环境变量配置错误时仍能稳定输出。
 * 3. 不做什么：不覆盖 pino 第三方库本身的全部行为，只验证本项目 logger 封装的契约。
 *
 * 输入/输出：
 * - 输入：自定义 writable destination、scope、bindings、日志调用。
 * - 输出：写入 destination 的 JSON 日志内容。
 *
 * 数据流/状态流：
 * createLogger -> 写入内存流 -> 解析 JSON
 * -> 断言 scope、业务绑定与消息文本是否齐全。
 *
 * 关键边界条件与坑点：
 * 1. 若 scope/bindings 没有被统一挂上，模块日志后续就无法按来源筛选。
 * 2. 日志级别回退必须稳定，否则非法环境配置会造成日志缺失或噪音异常。
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { Writable } from 'node:stream';

import { createLogger } from '../../utils/logger.js';

class MemoryWritable extends Writable {
  public readonly lines: string[] = [];

  _write(
    chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    callback(null);
  }
}

test('createLogger: 应输出带 scope 与 bindings 的结构化日志', () => {
  const destination = new MemoryWritable();
  const battleLogger = createLogger({
    scope: 'battle.action',
    bindings: {
      battleId: 'battle-1',
      userId: 1,
    },
    level: 'info',
    destination,
  });

  battleLogger.info({ skillId: 'skill-normal-attack' }, '行动已提交');

  assert.equal(destination.lines.length, 1);
  const logEntry = JSON.parse(destination.lines[0] ?? '{}') as {
    level?: number;
    time?: string;
    scope?: string;
    battleId?: string;
    userId?: number;
    skillId?: string;
    msg?: string;
  };
  assert.equal(typeof logEntry.time, 'string');
  assert.equal(logEntry.level, 30);
  assert.equal(logEntry.scope, 'battle.action');
  assert.equal(logEntry.battleId, 'battle-1');
  assert.equal(logEntry.userId, 1);
  assert.equal(logEntry.skillId, 'skill-normal-attack');
  assert.equal(logEntry.msg, '行动已提交');
});

test('createLogger: 非法日志级别应回退到 info', () => {
  const destination = new MemoryWritable();
  const fallbackLogger = createLogger({
    scope: 'logger.test',
    level: 'invalid-level',
    destination,
  });

  fallbackLogger.info('fallback works');

  assert.equal(destination.lines.length, 1);
  const logEntry = JSON.parse(destination.lines[0] ?? '{}') as {
    level?: number;
    scope?: string;
    msg?: string;
  };
  assert.equal(logEntry.level, 30);
  assert.equal(logEntry.scope, 'logger.test');
  assert.equal(logEntry.msg, 'fallback works');
});
