// Влиза само през bake.html (Playwright headless Chromium, вижте bake-item-icons.mjs).
// URL: /bake.html?slug=<slug> — строи предмета, рендерира един кадър в студийната сцена на
// renderScene.ts (същата рамка/осветление като живия преглед — еднакво кадриране), и излага
// window.__bakeReady + window.__bakeWebp за скрипта.
// ?multi=1 — диагностичен режим: строи 5 предмета в кръг (симулира SetViewer3D) за дебъг на
// „WebGL Device Lost" при много обекти в една сцена.
import * as THREE from 'three/webgpu';
import { buildItem } from '../combat/engine/items/buildItem';
import { fallbackTheme } from '../combat/engine/items/theme';
import { buildStudioScene, createRenderer } from '../combat/engine/items/renderScene';
import type { CatalogEntry } from '../combat/engine/items/theme';

declare global {
  interface Window {
    __bakeReady?: boolean;
    __bakeError?: string;
    __bakeWebp?: string;
  }
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug');
  if (!slug && !params.has('multi')) { window.__bakeError = 'missing ?slug='; return; }

  const res = await fetch('/assets/items3d/catalog.json');
  const catalog: CatalogEntry[] = res.ok ? await res.json() : [];

  let target: THREE.Object3D;
  if (params.has('multi')) {
    const picks = catalog.filter((e) => e.set_slug).slice(0, 5);
    const root = new THREE.Group();
    picks.forEach((entry, i) => {
      const built = buildItem(entry);
      const holder = new THREE.Group();
      const a = (i / picks.length) * Math.PI * 2;
      holder.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      holder.add(built.object);
      root.add(holder);
    });
    target = root;
  } else {
    const entry = catalog.find((e) => e.slug === slug) ?? {
      slug, name: slug, category: 'weapon', tier: 1, rarity: 'common',
      theme: fallbackTheme({ tier: 1, rarity: 'common', category: 'weapon' }),
    } as CatalogEntry;
    target = buildItem(entry).object;
  }

  const studio = buildStudioScene(target);

  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const forceWebGL = params.has('webgl') || true; // headless Chromium here = software WebGL2, see task notes
  const { renderer } = await createRenderer(canvas, { forceWebGL, alpha: true });
  renderer.setPixelRatio(1);
  renderer.setSize(512, 512, false);
  studio.camera.aspect = 1;
  studio.camera.updateProjectionMatrix();

  await renderer.renderAsync(studio.scene, studio.camera);

  // Четем пикселите ВЕДНАГА след рендера (не изложено като функция за по-късно извикване) —
  // WebGL заден буфер без preserveDrawingBuffer не се гарантира отвъд текущия кадър.
  const out = document.createElement('canvas');
  out.width = 256;
  out.height = 256;
  const ctx = out.getContext('2d');
  ctx?.clearRect(0, 0, 256, 256);
  ctx?.drawImage(canvas, 0, 0, 256, 256);
  window.__bakeWebp = ctx ? out.toDataURL('image/webp', 0.92) : '';
  window.__bakeReady = true;
}

main().catch((err) => { window.__bakeError = String(err); });
