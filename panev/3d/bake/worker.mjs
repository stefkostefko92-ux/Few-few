// Worker: shades bands of rows for one texture set into the shared channel buffers.
import { parentPort, workerData } from 'node:worker_threads';
import { CHANNELS } from './pool.mjs';

const { setUrl, w, h, seed, shared } = workerData;
const set = (await import(setUrl)).default;
const ctx = set.setup(seed);
const out = Object.fromEntries(CHANNELS.map((c) => [c, new Float32Array(shared[c])]));
const o = { h: 0, r: 1, g: 1, b: 1, rough: 1, metal: 1 };

parentPort.on('message', (band) => {
  if (!band) {
    parentPort.close();
    return;
  }
  for (let y = band[0]; y < band[1]; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      o.h = 0;
      o.r = o.g = o.b = 1;
      o.rough = 1;
      o.metal = 1;
      set.shade(ctx, (x + 0.5) / w, v, o);
      const i = y * w + x;
      for (const c of CHANNELS) out[c][i] = o[c];
    }
  }
  parentPort.postMessage(1);
});
