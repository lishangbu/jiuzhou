/**
 * 服务端统一日志工具。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：基于 pino 提供统一日志入口，收敛 `console.*` 的散落调用，保证 battle、dungeon、worker 等模块都能输出结构化日志。
 * 2. 做什么：支持按 scope 创建子 logger，让模块日志天然带上来源，便于后续筛选和聚合。
 * 3. 不做什么：不做日志持久化策略配置，也不引入多 transport/多格式分支；当前只提供服务端标准输出日志。
 *
 * 输入/输出：
 * - 输入：可选的 `scope`、额外 bindings、日志级别、以及测试时可注入的 destination。
 * - 输出：pino logger 实例；调用方可直接使用 `info/warn/error/debug` 等方法。
 *
 * 数据流/状态流：
 * 调用方 import root logger / createLogger
 * -> logger.child 叠加 scope 与上下文绑定
 * -> pino 统一输出 JSON 结构化日志到 stdout。
 *
 * 关键边界条件与坑点：
 * 1. 日志级别只接受约定枚举；非法环境变量会回落到 `info`，避免把进程卡在启动阶段。
 * 2. 这里不做“开发环境 console、美化输出”等双轨分支，避免日志格式在不同环境漂移。
 */

import pino, {
  stdTimeFunctions,
  type DestinationStream,
  type Logger as PinoLogger,
  type LoggerOptions as PinoLoggerOptions,
} from 'pino';

type LogBindingValue = boolean | number | string | null | undefined;

export type LogBindings = Record<string, LogBindingValue>;

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

type CreateLoggerOptions = {
  scope?: string;
  bindings?: LogBindings;
  level?: string;
  destination?: DestinationStream;
};

const DEFAULT_LOG_LEVEL: LogLevel = 'info';

const normalizeLogLevel = (value: string | undefined): LogLevel => {
  switch (value) {
    case 'fatal':
    case 'error':
    case 'warn':
    case 'info':
    case 'debug':
    case 'trace':
      return value;
    default:
      return DEFAULT_LOG_LEVEL;
  }
};

const buildLoggerOptions = (level: LogLevel): PinoLoggerOptions => ({
  level,
  base: undefined,
  timestamp: stdTimeFunctions.isoTime,
});

const attachBindings = (
  baseLogger: PinoLogger,
  scope?: string,
  bindings?: LogBindings,
): PinoLogger => {
  if (scope && bindings) {
    return baseLogger.child({ scope, ...bindings });
  }
  if (scope) {
    return baseLogger.child({ scope });
  }
  if (bindings) {
    return baseLogger.child(bindings);
  }
  return baseLogger;
};

export const createLogger = (options: CreateLoggerOptions = {}): PinoLogger => {
  const level = normalizeLogLevel(options.level);
  const baseLogger = pino(buildLoggerOptions(level), options.destination);
  return attachBindings(baseLogger, options.scope, options.bindings);
};

export const logger = createLogger({
  level: process.env.LOG_LEVEL,
});

export const createScopedLogger = (
  scope: string,
  bindings?: LogBindings,
): PinoLogger => {
  return attachBindings(logger, scope, bindings);
};
