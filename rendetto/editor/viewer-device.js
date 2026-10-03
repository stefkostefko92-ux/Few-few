// How much 3D the device can take. The pipeline holds ~150 bytes per pixel (HalfFloat targets, 4× MSAA, ambient
// occlusion) and a wood or stone decor ~24 MB of textures, so phones and tablets (coarse pointer) and devices that
// report little memory get a lighter view: fewer pixels, no MSAA (the resting view is still anti-aliased by its
// jittered frames), decor textures at half size and fewer of them kept. Desktops keep the full view.
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const memory = typeof navigator === 'undefined' ? undefined : navigator.deviceMemory;

export const LIGHT = coarse || (memory !== undefined && memory <= 4);

export const DEVICE = LIGHT
  ? { maxPixels: 1.2e6, samples: 0, texScale: 0.5, maxBakes: 6 }
  : { maxPixels: 4e6, samples: 4, texScale: 1, maxBakes: 10 };

// Device pixels per CSS pixel for a canvas w × h: the screen's own, at most 2, fewer when the canvas would pass
// the pixel budget — never below the screen's own up to 1 (no blur on ordinary screens).
export function pixelRatio(w, h) {
  const dpr = (typeof window === 'undefined' ? 1 : window.devicePixelRatio) || 1;
  const fit = Math.sqrt(DEVICE.maxPixels / Math.max(1, w * h));
  return Math.max(Math.min(1, dpr), Math.min(dpr, 2, fit));
}
