// A logo with transparency, as a company would upload it (the company created by the e2e run).
import { join } from 'node:path';
import sharp from 'sharp';

export async function logoE2E(shots) {
  const file = join(shots, 'logo-e2e.png');
  await sharp({
    create: {
      width: 900,
      height: 260,
      channels: 4,
      background: { r: 15, g: 50, b: 120, alpha: 0.85 },
    },
  })
    .png()
    .toFile(file);
  return file;
}
