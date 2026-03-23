/**
 * 伙伴回收邮件奖励汇总测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定伙伴回收脚本把补偿令牌、功法书、升级材料、经验与灵石汇总成单一邮件奖励载荷的规则。
 * 2. 做什么：保证 dry run 预览与 execute 发奖继续共用同一份聚合逻辑，而不是在脚本里散落两套拼装代码。
 * 3. 不做什么：不连接数据库、不发送真实邮件，也不执行伙伴删除流程。
 *
 * 输入/输出：
 * - 输入：一份手工构造的伙伴回收返还摘要。
 * - 输出：邮件奖励载荷与邮件文案断言结果。
 *
 * 数据流/状态流：
 * 测试样本 -> 伙伴回收邮件奖励共享模块 -> 断言奖励汇总与文案保持稳定。
 *
 * 关键边界条件与坑点：
 * 1. 同一种 `itemDefId` 必须在邮件附件里合并数量，避免同类奖励在邮件预览和领取时重复出现多条。
 * 2. 伙伴灌注经验与功法升级经验都属于返还经验，必须合并到同一个 `exp` 字段，而不是拆成两套附件语义。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildPartnerReclaimMailContent,
    buildPartnerReclaimMailRewardPayload,
} from '../../scripts/shared/partnerReclaimMailReward.js';

test('buildPartnerReclaimMailRewardPayload: 应汇总补偿令牌、功法书、升级材料、经验与灵石', () => {
    const payload = buildPartnerReclaimMailRewardPayload({
        compensationItemDefId: 'token-004',
        compensationQty: 1,
        partnerSpentExp: 1200,
        learnedTechniqueBooks: [
            {
                itemDefId: 'book-001',
                itemName: '烈焰诀残卷',
                techniqueId: 'tech-001',
                techniqueName: '烈焰诀',
            },
            {
                itemDefId: 'book-001',
                itemName: '烈焰诀残卷',
                techniqueId: 'tech-001',
                techniqueName: '烈焰诀',
            },
        ],
        techniqueUpgradeRefund: {
            spiritStones: 800,
            exp: 300,
            materials: [
                {
                    itemId: 'mat-001',
                    itemName: '玄铁',
                    qty: 2,
                },
                {
                    itemId: 'mat-001',
                    itemName: '玄铁',
                    qty: 3,
                },
                {
                    itemId: 'mat-002',
                    itemName: '灵木',
                    qty: 1,
                },
            ],
        },
    });

    assert.deepEqual(payload, {
        exp: 1500,
        spiritStones: 800,
        items: [
            { itemDefId: 'token-004', quantity: 1 },
            { itemDefId: 'book-001', quantity: 2 },
            { itemDefId: 'mat-001', quantity: 5 },
            { itemDefId: 'mat-002', quantity: 1 },
        ],
    });
});

test('buildPartnerReclaimMailContent: 应明确说明回收返还通过系统邮件发放', () => {
    assert.equal(
        buildPartnerReclaimMailContent({
            partnerNickname: '焚天',
            partnerName: '火灵',
            baseModel: '全体六连击六万法攻十万血',
        }),
        '你被回收的伙伴【焚天】/火灵（底模：全体六连击六万法攻十万血）相关补偿、材料、经验、物品与功法书已通过系统邮件返还，请及时领取。',
    );
});
