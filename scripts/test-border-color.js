#!/usr/bin/env node

import sharp from 'sharp';

// 读取图片并采样边框颜色
const image = await sharp('scripts/1234.png')
  .extract({ left: 100, top: 100, width: 200, height: 200 })
  .raw()
  .toBuffer({ resolveWithObject: true });

const { data, info } = image;
const { width, height, channels } = info;

// 采样一些像素点，找出可能是边框的颜色
const samples = [];
for (let y = 0; y < height; y += 10) {
  for (let x = 0; x < width; x += 10) {
    const idx = (y * width + x) * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    // 只记录可能是边框的颜色（非白色、非黑色）
    if (r > 50 && g > 50 && b < 200 && !(r > 240 && g > 240 && b > 240)) {
      samples.push({ r, g, b });
    }
  }
}

// 输出前20个样本
console.log('边框颜色样本（前20个）：');
samples.slice(0, 20).forEach((s, i) => {
  console.log(`${i + 1}. RGB(${s.r}, ${s.g}, ${s.b})`);
});
