// Вход за снимките на семената за Discord (scripts/render-seeds.ts): една сцена → JPEG като data: URL.
// Не се сервира от сайта — бъндълът се прави само в паметта на скрипта.
import type { SeedSceneSpec } from './seeds3d.js';
import { SeedRenderer } from './seeds3d.js';

declare global {
  interface Window {
    semkiRender?: (spec: SeedSceneSpec, w: number, h: number) => string | null;
  }
}

const renderer = SeedRenderer.create();
window.semkiRender = (spec, w, h) => {
  if (!renderer) return null;
  const canvas = document.createElement('canvas');
  return renderer.draw(canvas, spec, { w, h }) ? canvas.toDataURL('image/jpeg', 0.88) : null;
};
