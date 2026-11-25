// Runs a texture set's per-texel shader across all CPU cores over shared memory.
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

export const CHANNELS = ['h', 'r', 'g', 'b', 'rough', 'metal', 'mask'];

export function allocate(size) {
  const img = {};
  const shared = {};
  for (const c of CHANNELS) {
    shared[c] = new SharedArrayBuffer(size * size * 4);
    img[c] = new Float32Array(shared[c]);
  }
  return { img, shared };
}

// Splits the rows into bands (more bands than workers, so uneven rows still balance).
export async function shadeAll(setUrl, size, seed, shared) {
  const workers = Math.max(1, Math.min(availableParallelism(), 8));
  const bands = [];
  const step = Math.max(8, Math.ceil(size / (workers * 6)));
  for (let y = 0; y < size; y += step) bands.push([y, Math.min(size, y + step)]);
  let next = 0;
  const run = () =>
    new Promise((resolve, reject) => {
      const w = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { setUrl, size, seed, shared } });
      const feed = () => {
        if (next >= bands.length) {
          w.postMessage(null);
          return;
        }
        w.postMessage(bands[next++]);
      };
      w.on('message', feed);
      w.on('error', reject);
      w.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`bake worker exited with ${code}`))));
      feed();
    });
  await Promise.all(Array.from({ length: workers }, run));
}
