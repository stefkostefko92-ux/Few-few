// Runs a texture set's per-texel shader across the CPU cores over shared memory.
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

export const CHANNELS = ['h', 'r', 'g', 'b', 'rough', 'metal'];

export function allocate(w, h) {
  const img = {};
  const shared = {};
  for (const c of CHANNELS) {
    shared[c] = new SharedArrayBuffer(w * h * 4);
    img[c] = new Float32Array(shared[c]);
  }
  return { img, shared };
}

export async function shadeAll(setUrl, w, h, seed, shared) {
  const workers = Math.max(1, Math.min(availableParallelism(), 8));
  const bands = [];
  const step = Math.max(8, Math.ceil(h / (workers * 6)));
  for (let y = 0; y < h; y += step) bands.push([y, Math.min(h, y + step)]);
  let next = 0;
  const run = () =>
    new Promise((resolve, reject) => {
      const wk = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { setUrl, w, h, seed, shared } });
      const feed = () => wk.postMessage(next < bands.length ? bands[next++] : null);
      wk.on('message', feed);
      wk.on('error', reject);
      wk.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`bake worker exited with ${code}`))));
      feed();
    });
  await Promise.all(Array.from({ length: workers }, run));
}
