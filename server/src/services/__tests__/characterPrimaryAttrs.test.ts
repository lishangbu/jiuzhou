import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCharacterPrimaryAttrsToStats,
  createCharacterPrimaryAttrs,
  resolveCharacterPrimaryAttrs,
} from '../shared/characterPrimaryAttrs.js';

test('三维百分比应先作用于人物三维，再派生到战斗属性', () => {
  const basePrimaryAttrs = createCharacterPrimaryAttrs({
    jing: 50,
    qi: 40,
    shen: 30,
  });
  const effectivePrimaryAttrs = resolveCharacterPrimaryAttrs(basePrimaryAttrs, {
    jing: 0.2,
    qi: 0.25,
    shen: 0.1,
  });

  assert.deepEqual(effectivePrimaryAttrs, {
    jing: 60,
    qi: 50,
    shen: 33,
  });

  const stats = {
    max_qixue: 100,
    max_lingqi: 0,
    wugong: 5,
    fagong: 0,
    wufang: 2,
    fafang: 0,
    mingzhong: 0.9,
    baoji: 0.1,
  };

  applyCharacterPrimaryAttrsToStats(stats, effectivePrimaryAttrs);

  assert.deepEqual(stats, {
    max_qixue: 400,
    max_lingqi: 250,
    wugong: 105,
    fagong: 100,
    wufang: 122,
    fafang: 120,
    mingzhong: 0.966,
    baoji: 0.133,
  });
});

test('三维百分比应保持整数口径并忽略非法数值', () => {
  const basePrimaryAttrs = createCharacterPrimaryAttrs({
    jing: 19.8,
    qi: '12',
    shen: 'bad',
  });

  assert.deepEqual(basePrimaryAttrs, {
    jing: 19,
    qi: 12,
    shen: 0,
  });

  const effectivePrimaryAttrs = resolveCharacterPrimaryAttrs(basePrimaryAttrs, {
    jing: 0.05,
    qi: Number.NaN,
    shen: 0.5,
  });

  assert.deepEqual(effectivePrimaryAttrs, {
    jing: 19,
    qi: 12,
    shen: 0,
  });
});
