import { describe, expect, it } from 'vitest';
import {
  formatTechniqueBonusAmount,
  getMergedUnlockedTechniqueBonuses,
  getUnlockedTechniqueBonuses,
  mergeTechniqueBonuses,
  type TechniqueBonus,
} from '../bonusShared';

const buildBonus = (
  key: string,
  amount: number,
  label: string,
): TechniqueBonus => ({
  key,
  label,
  amount,
  value: formatTechniqueBonusAmount(key, amount),
});

describe('bonusShared', () => {
  it('getUnlockedTechniqueBonuses: 只提取当前已解锁层的被动', () => {
    const bonuses = getUnlockedTechniqueBonuses([
      { bonuses: [buildBonus('fagong', 0.06, '法攻')] },
      { bonuses: [buildBonus('huo_kangxing', 0.04, '火抗性')] },
      { bonuses: [buildBonus('zengshang', 0.05, '增伤')] },
    ], 2);

    expect(bonuses).toStrictEqual([
      buildBonus('fagong', 0.06, '法攻'),
      buildBonus('huo_kangxing', 0.04, '火抗性'),
    ]);
  });

  it('getUnlockedTechniqueBonuses: 应过滤展示值为 0 的被动', () => {
    const bonuses = getUnlockedTechniqueBonuses([
      { bonuses: [buildBonus('fagong', 0, '法攻'), buildBonus('lingqi_huifu', 10, '灵气恢复')] },
      { bonuses: [buildBonus('mingzhong', 0.06, '命中')] },
    ], 2);

    expect(bonuses).toStrictEqual([
      buildBonus('lingqi_huifu', 10, '灵气恢复'),
      buildBonus('mingzhong', 0.06, '命中'),
    ]);
  });

  it('mergeTechniqueBonuses: 应按被动 key 合并重复属性并重算展示值', () => {
    const merged = mergeTechniqueBonuses([
      buildBonus('fagong', 0.06, '法攻'),
      buildBonus('huo_kangxing', 0.04, '火抗性'),
      buildBonus('fagong', 0.1, '法攻'),
      buildBonus('zengshang', 0.05, '增伤'),
      buildBonus('fagong', 0.14, '法攻'),
    ]);

    expect(merged).toStrictEqual([
      buildBonus('fagong', 0.3, '法攻'),
      buildBonus('huo_kangxing', 0.04, '火抗性'),
      buildBonus('zengshang', 0.05, '增伤'),
    ]);
  });

  it('mergeTechniqueBonuses: 输入为 0 或合并后归零时应直接隐藏', () => {
    const merged = mergeTechniqueBonuses([
      buildBonus('fagong', 0, '法攻'),
      buildBonus('fagong', 0.06, '法攻'),
      buildBonus('fagong', -0.06, '法攻'),
      buildBonus('lengque', 0.05, '冷却'),
    ]);

    expect(merged).toStrictEqual([
      buildBonus('lengque', 0.05, '冷却'),
    ]);
  });

  it('getMergedUnlockedTechniqueBonuses: 应同时完成层数截取与重复属性合并', () => {
    const merged = getMergedUnlockedTechniqueBonuses([
      { bonuses: [buildBonus('fagong', 0.08, '法攻'), buildBonus('huo_kangxing', 0.05, '火抗性')] },
      { bonuses: [buildBonus('fagong', 0.1, '法攻'), buildBonus('zengshang', 0.04, '增伤')] },
      { bonuses: [buildBonus('fagong', 0.12, '法攻'), buildBonus('lengque', 0.05, '冷却')] },
    ], 3);

    expect(merged).toStrictEqual([
      buildBonus('fagong', 0.3, '法攻'),
      buildBonus('huo_kangxing', 0.05, '火抗性'),
      buildBonus('zengshang', 0.04, '增伤'),
      buildBonus('lengque', 0.05, '冷却'),
    ]);
  });
});
