/**
 * 境界突破链路完整性回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：校验 `realm_breakthrough.json` 的 `realmOrder` 每一档境界都为非空文本，且与 `breakthroughs` 的 from/to 链路严格一一对应。
 * 2. 做什么：防止顺序表 typo、空字符串或断链配置把“下一境界展示”和“可突破判定”同时带坏。
 * 3. 不做什么：不连接数据库、不执行真实突破事务，也不覆盖奖励数值细节。
 *
 * 输入 / 输出：
 * - 输入：`realm_breakthrough.json` 静态配置。
 * - 输出：境界顺序链完整性断言结果；任一境界文本为空、数量不匹配或 from/to 与顺序表断链时直接失败。
 *
 * 数据流 / 状态流：
 * 突破 seed 文件 -> 提取 `realmOrder` 与 `breakthroughs` -> 先校验境界文本非空
 * -> 再校验每一档突破与顺序表严格衔接。
 *
 * 复用设计说明：
 * - 把“顺序表必须驱动突破链路”的约束收敛到单一测试入口，避免服务端预览、突破提交、前端展示各自重复补同类断言。
 * - 与 `realmService` 的加载期校验形成双保险：测试负责阻止错误配置进入主干，运行期负责阻止错误配置静默生效。
 *
 * 关键边界条件与坑点：
 * 1. 配置文件在不同 cwd 下存在两套候选路径，测试必须沿用现有探测顺序，否则容易出现本地能过、CI 找不到文件。
 * 2. 这里要求全文本 `trim` 后非空；像“炼精化炁· 期”这种局部缺字虽不是空串，但仍会在 from/to 衔接断言里被识别出来。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Breakthrough = {
  from?: string;
  to?: string;
};

type RealmBreakthroughSeed = {
  realmOrder?: string[];
  breakthroughs?: Breakthrough[];
};

const loadSeed = (): RealmBreakthroughSeed => {
  const candidatePaths = [
    resolve(process.cwd(), 'server/src/data/seeds/realm_breakthrough.json'),
    resolve(process.cwd(), 'src/data/seeds/realm_breakthrough.json'),
  ];
  const seedPath = candidatePaths.find((filePath) => existsSync(filePath));
  assert.ok(seedPath, '未找到 realm_breakthrough.json');
  return JSON.parse(readFileSync(seedPath, 'utf-8')) as RealmBreakthroughSeed;
};

test('境界顺序表应为非空文本，且与突破 from/to 链严格衔接', () => {
  const seed = loadSeed();
  const realmOrder = seed.realmOrder ?? [];
  const breakthroughs = seed.breakthroughs ?? [];

  assert.equal(realmOrder.length, breakthroughs.length + 1, 'realmOrder 与 breakthroughs 数量不匹配');

  realmOrder.forEach((realm, index) => {
    assert.notEqual(String(realm ?? '').trim(), '', `realmOrder[${index}] 不能为空`);
  });

  breakthroughs.forEach((entry, index) => {
    assert.equal(entry.from, realmOrder[index], `第 ${index + 1} 档突破 from 与 realmOrder 不一致`);
    assert.equal(entry.to, realmOrder[index + 1], `第 ${index + 1} 档突破 to 与 realmOrder 不一致`);
  });
});
