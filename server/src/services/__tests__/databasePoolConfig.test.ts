import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDatabasePoolConfig } from '../../config/databasePoolConfig.js';

/**
 * 数据库连接池配置回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁住运行时连接池的单一配置入口，避免 `database.ts` 再次回退成内联硬编码。
 * 2. 做什么：覆盖“默认保活策略”“显式环境变量覆盖”“min/max 非法关系”三条关键路径。
 * 3. 不做什么：不创建真实连接池，不连接数据库，只验证纯配置解析逻辑。
 *
 * 输入 / 输出：
 * - 输入：最小化环境变量对象。
 * - 输出：标准化后的 `pg` 连接池配置。
 *
 * 数据流 / 状态流：
 * 测试构造 env -> 调用 `resolveDatabasePoolConfig` -> 断言 `database.ts` 将要复用的池参数。
 *
 * 复用设计说明：
 * - 连接池配置已被抽到 `databasePoolConfig.ts` 单一入口，这里的测试直接锁住该抽象，避免运行时和文档再次分叉。
 * - 后续若部署脚本、压测脚本也读取同一组 `DB_POOL_*`，都应共享这里的断言口径。
 *
 * 关键边界条件与坑点：
 * 1. `DB_POOL_MIN > DB_POOL_MAX` 必须启动即失败，不能静默修正，否则线上排查会被掩盖。
 * 2. `keepAlive` 与生命周期参数属于根因治理的一部分，默认值必须被测试锁住，避免后续回退。
 */

test('resolveDatabasePoolConfig: 未显式配置时应返回默认保活与生命周期策略', () => {
  const config = resolveDatabasePoolConfig({});

  assert.deepEqual(config, {
    application_name: 'jiuzhou-server',
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    max: 600,
    maxLifetimeSeconds: 900,
    maxUses: 7_500,
    min: 20,
  });
});

test('resolveDatabasePoolConfig: 显式环境变量应覆盖默认连接池参数', () => {
  const config = resolveDatabasePoolConfig({
    DB_APPLICATION_NAME: 'jiuzhou-server-prod',
    DB_POOL_CONNECT_TIMEOUT_MS: '7000',
    DB_POOL_IDLE_TIMEOUT_MS: '45000',
    DB_POOL_KEEPALIVE_DELAY_MS: '15000',
    DB_POOL_MAX: '320',
    DB_POOL_MAX_LIFETIME_SECONDS: '1200',
    DB_POOL_MAX_USES: '9000',
    DB_POOL_MIN: '40',
  });

  assert.deepEqual(config, {
    application_name: 'jiuzhou-server-prod',
    connectionTimeoutMillis: 7_000,
    idleTimeoutMillis: 45_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 15_000,
    max: 320,
    maxLifetimeSeconds: 1_200,
    maxUses: 9_000,
    min: 40,
  });
});

test('resolveDatabasePoolConfig: min 大于 max 时应直接失败', () => {
  assert.throws(
    () =>
      resolveDatabasePoolConfig({
        DB_POOL_MAX: '32',
        DB_POOL_MIN: '64',
      }),
    /DB_POOL_MIN 不能大于 DB_POOL_MAX/,
  );
});

test('resolveDatabasePoolConfig: 非法数字环境变量应直接失败', () => {
  assert.throws(
    () =>
      resolveDatabasePoolConfig({
        DB_POOL_KEEPALIVE_DELAY_MS: '0',
      }),
    /DB_POOL_KEEPALIVE_DELAY_MS 必须是正整数/,
  );
});
