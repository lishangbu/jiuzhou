import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {
  compressTechniqueSkillImageBuffer,
  TECHNIQUE_SKILL_IMAGE_OUTPUT_MAX_EDGE,
} from '../shared/techniqueSkillImageGenerator.js';

test('compressTechniqueSkillImageBuffer: 应统一压缩为受限尺寸的 webp', async () => {
  const original = await sharp({
    create: {
      width: 1024,
      height: 768,
      channels: 4,
      background: { r: 120, g: 80, b: 220, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const compressed = await compressTechniqueSkillImageBuffer(original);
  assert.ok(compressed);
  assert.ok(compressed.length > 0);

  const metadata = await sharp(compressed).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, TECHNIQUE_SKILL_IMAGE_OUTPUT_MAX_EDGE);
  assert.equal(metadata.height, 288);
});
