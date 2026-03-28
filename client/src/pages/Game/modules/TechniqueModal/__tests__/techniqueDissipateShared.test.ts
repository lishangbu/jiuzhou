import { describe, expect, it } from 'vitest';

import {
  buildTechniqueDissipateConfirmLines,
  buildTechniqueDissipateConfirmTitle,
  resolveTechniqueDissipateActionState,
} from '../techniqueDissipateShared';

describe('techniqueDissipateShared', () => {
  it('未装配功法应展示可执行的散功按钮', () => {
    expect(resolveTechniqueDissipateActionState(null)).toEqual({
      label: '散功',
      disabled: false,
      disabledReason: null,
    });
  });

  it('已装配功法应禁用散功并提示先取消运功', () => {
    expect(resolveTechniqueDissipateActionState('副功法Ⅰ')).toEqual({
      label: '已运功',
      disabled: true,
      disabledReason: '该功法正在副功法Ⅰ运转，请先取消运功',
    });
  });

  it('确认文案应明确散功移除与不返还代价', () => {
    expect(buildTechniqueDissipateConfirmTitle('太虚剑诀')).toBe('确认散去「太虚剑诀」？');
    expect(buildTechniqueDissipateConfirmLines('太虚剑诀')).toEqual([
      '散功后，「太虚剑诀」会从已学功法中移除。',
      '本次散功不会返还任何修炼资源或功法书。',
    ]);
  });
});
