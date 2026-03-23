/**
 * 伙伴回收脚本属性展示测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定回收脚本输出伙伴完整属性时的字段顺序、中文标签和百分比展示口径。
 * 2. 做什么：保证回收脚本继续复用属性注册表，而不是在脚本里临时拼一份字段名单。
 * 3. 不做什么：不计算伙伴属性、不连接数据库，也不验证回收脚本的 SQL 查询逻辑。
 *
 * 输入/输出：
 * - 输入：一份手工构造的 `PartnerComputedAttrsDto`。
 * - 输出：格式化后的属性文本行断言。
 *
 * 数据流/状态流：
 * 测试样本属性 -> `formatPartnerReclaimComputedAttrs` -> 断言输出文本与分组顺序。
 *
 * 关键边界条件与坑点：
 * 1. 比率属性必须继续按百分比展示，不能把 `0.125` 打成 `0.125` 这类原始小数。
 * 2. 第一行必须从资源与主属性开始，避免后续有人改成对象遍历后出现非稳定顺序。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPartnerReclaimComputedAttrs } from '../../scripts/shared/partnerReclaimComputedAttrs.js';
import type { PartnerComputedAttrsDto } from '../shared/partnerView.js';

test('formatPartnerReclaimComputedAttrs: 应按固定顺序输出完整伙伴属性并格式化百分比', () => {
    const attrs: PartnerComputedAttrsDto = {
        qixue: 1000,
        max_qixue: 1000,
        lingqi: 300,
        max_lingqi: 300,
        wugong: 80,
        fagong: 120,
        wufang: 55,
        fafang: 45,
        mingzhong: 0.125,
        shanbi: 0.08,
        zhaojia: 0.05,
        baoji: 0.2,
        baoshang: 0.5,
        jianbaoshang: 0.1,
        jianfantan: 0.03,
        kangbao: 0.09,
        zengshang: 0.15,
        zhiliao: 0.18,
        jianliao: 0.07,
        xixue: 0.04,
        lengque: 0.11,
        sudu: 66,
        kongzhi_kangxing: 0.13,
        jin_kangxing: 0.01,
        mu_kangxing: 0.02,
        shui_kangxing: 0.03,
        huo_kangxing: 0.04,
        tu_kangxing: 0.05,
        qixue_huifu: 8,
        lingqi_huifu: 6,
    };

    assert.deepEqual(formatPartnerReclaimComputedAttrs(attrs), [
        '气血 1000，气血上限 1000，灵气 300，灵气上限 300，物攻 80，法攻 120',
        '物防 55，法防 45，速度 66，命中 12.5%，闪避 8%，招架 5%',
        '暴击 20%，暴伤 50%，暴伤减免 10%，反伤减免 3%，抗暴 9%，增伤 15%',
        '治疗 18%，减疗 7%，吸血 4%，冷却 11%，控制抗性 13%，金抗性 1%',
        '木抗性 2%，水抗性 3%，火抗性 4%，土抗性 5%，气血恢复 8，灵气恢复 6',
    ]);
});
