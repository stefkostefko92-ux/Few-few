// Worker: shades bands of rows for one texture set into shared channel buffers.
import { parentPort, workerData } from 'node:worker_threads';
import { CHANNELS } from './pool.mjs';

const { setUrl, size, seed, shared } = workerData;
const set = (await import(setUrl)).default;
const ctx = set.setup(seed, size);
const out = {};
for (const c of CHANNELS) out[c] = new Float32Array(shared[c]);
const o = { h: 0, r: 0, g: 0, b: 0, rough: 0.5, metal: 0, mask: 0 };

parentPort.on('message', (band) => {
  if (!band) {
    parentPort.close();
    return;
  }
  const [y0, y1] = band;
  for (let y = y0; y < y1; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      o.h = 0;
      o.r = o.g = o.b = 0.5;
      o.rough = 0.5;
      o.metal = 0;
      o.mask = 0;
      set.shade(ctx, (x + 0.5) / size, v, o);
      const i = y * size + x;
      for (const c of CHANNELS) out[c][i] = o[c];
    }
  }
  parentPort.postMessage(1);
});
