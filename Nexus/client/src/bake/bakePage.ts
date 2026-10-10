// Страница-хост на изпичането (виж scripts/bake-items.mjs): Playwright я зарежда през vite,
// вика window.__bake.render(slug) и получава готов 512px WebP като base64. Само за разработка —
// не е част от продукционния бъндъл (vite build има само index.html вход).
import * as THREE from 'three/webgpu';
import { buildItem } from '../combat/engine/items/buildItem';
import { buildMannequin } from '../combat/engine/items/mannequin';
import { previewMode } from '../combat/engine/items/support';
import { fitTextureScale, photoMaterials } from '../combat/engine/items/photoreal';
import { buildPotion, buildGemstone } from '../combat/engine/items/slots/vessels';
import { rngFor } from '../combat/engine/items/rng';
import type { CatalogEntry } from '../combat/engine/items/theme';
import { buildStudioEnvMap } from './studioEnv';
import { buildBakeStudio } from './studio';
import { finish, type Hdr } from './hdrPost';

const RES = 1024;
const OUT = 512;

interface Ctx { renderer: THREE.WebGPURenderer; env: THREE.Texture; rt: THREE.RenderTarget; catalog: Map<string, CatalogEntry> }
let ctx: Promise<Ctx> | null = null;

async function init(): Promise<Ctx> {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: true, forceWebGL: true });
  await renderer.init();
  renderer.setPixelRatio(1);
  renderer.setSize(RES, RES, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  const env = await buildStudioEnvMap(renderer);
  const rt = new THREE.RenderTarget(RES, RES, { type: THREE.FloatType, samples: 4, depthBuffer: true });
  const list = [...(await (await fetch('/assets/items3d/catalog.json')).json()), ...(await (await fetch('/assets/items3d/extras.json')).json())] as CatalogEntry[];
  return { renderer, env, rt, catalog: new Map(list.map((e) => [e.slug, e])) };
}

const DIAGONAL = new Set(['sword', 'dagger', 'staff', 'bow', 'mace', 'axe', 'spear']);

async function buildExtra(entry: CatalogEntry): Promise<{ object: THREE.Object3D; dispose(): void; tilt: number } | null> {
  const photo = await photoMaterials(entry, 0.2);
  const rand = rngFor(entry.slug);
  const obj = (entry.category as string) === 'potion'
    ? buildPotion(photo.M, photo.vessel(), (entry as unknown as { shape: number }).shape, rand)
    : buildGemstone(photo.gem, entry.tier, rand);
  fitTextureScale(obj);
  return { object: obj, dispose: () => { obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); photo.dispose(); }, tilt: 0 };
}

async function buildObject(entry: CatalogEntry): Promise<{ object: THREE.Object3D; dispose(): void; tilt: number } | null> {
  if (['potion', 'gem'].includes(entry.category as string)) return buildExtra(entry);
  const mode = previewMode(entry);
  if (mode === 'standalone') {
    const b = await buildItem(entry);
    if (!b) return null;
    const icon = entry.icon || entry.sub_type || 'sword';
    if (entry.category === 'shield') {
      // boy щитът е в рамката на предмишницата (+X към китката) — изправяме го: връх надолу, лице към камерата.
      const g = new THREE.Group();
      g.add(b.object);
      g.rotation.z = Math.PI;
      const o = new THREE.Group();
      o.add(g);
      o.rotation.y = 0.5;
      return { object: o, dispose: b.dispose, tilt: 0 };
    }
    return { object: b.object, dispose: b.dispose, tilt: entry.category === 'weapon' && DIAGONAL.has(icon) ? 40 : 0 };
  }
  if (mode === 'mannequin') {
    const b = await buildMannequin(entry, rngFor(entry.slug));
    // Продуктов кадър: парчето е в цвят/материал, останалото от манекена е матова въглена „глина".
    const SHOW: Record<string, string[]> = {
      armor: ['chest', 'upperArmR', 'upperArmL', 'pelvis', 'tassetR', 'tassetL'],
      boots: ['shinL', 'shinR', 'footL', 'footR'],
      cloak: ['chest', 'upperArmR', 'upperArmL'],
    };
    const clay = new THREE.MeshPhysicalNodeMaterial({ color: 0x1b2028, roughness: 0.82, sheen: 0.6, sheenColor: new THREE.Color(0x3a4658), sheenRoughness: 0.5 });
    b.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.pieceCategory) return;
      if (SHOW[entry.category]?.includes(m.userData.partName)) { m.material = clay; delete m.userData.excludeFromFraming; } else m.visible = false;
    });
    fitTextureScale(b.object);
    b.object.position.y += 1.4; // над грим-зоната на boy материалите (виж buildItem.ts)
    return { object: b.object, dispose: b.dispose, tilt: 0 };
  }
  return null;
}

async function render(slug: string, q = 0.8): Promise<{ webp: string; bytes: number } | null> {
  const c = await (ctx ??= init());
  const entry = c.catalog.get(slug);
  if (!entry) throw new Error(`непознат slug ${slug}`);
  const built = await buildObject(entry);
  if (!built) return null;
  const studio = buildBakeStudio(built.object, c.env, { tiltDeg: built.tilt, margin: 1.04 });
  c.renderer.setRenderTarget(c.rt);
  c.renderer.setClearColor(0x000000, 0);
  await c.renderer.renderAsync(studio.scene, studio.camera);
  const raw = (await c.renderer.readRenderTargetPixelsAsync(c.rt, 0, 0, RES, RES)) as Float32Array;
  c.renderer.setRenderTarget(null);
  // GL е долу-горе → обръщаме редовете
  const data = new Float32Array(raw.length);
  for (let y = 0; y < RES; y++) data.set(raw.subarray((RES - 1 - y) * RES * 4, (RES - y) * RES * 4), y * RES * 4);
  const hdr: Hdr = { w: RES, h: RES, data };
  const px = finish(hdr, { exposure: 1.3, bloom: entry.theme.finish === 'glowing' ? 0.9 : 0.5, bloomThreshold: 1.6, shadow: 0.55, shadowOffset: [26, 34], shadowBlur: 40 });
  const big = document.createElement('canvas');
  big.width = big.height = RES;
  big.getContext('2d')!.putImageData(new ImageData(px, RES, RES), 0, 0);
  const out = document.createElement('canvas');
  out.width = out.height = OUT;
  const g = out.getContext('2d')!;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  // Кадър по обекта: bbox на плътните пиксели → квадрат с ~6% поле, за да запълва ~90% от клетката.
  let x0 = RES; let y0 = RES; let x1 = 0; let y1 = 0;
  for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) if (px[(y * RES + x) * 4 + 3] > 150) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const side = Math.min(RES, Math.max(x1 - x0, y1 - y0) * 1.1 + 8);
  const sx = Math.max(0, Math.min(RES - side, (x0 + x1) / 2 - side / 2));
  const sy = Math.max(0, Math.min(RES - side, (y0 + y1) / 2 - side / 2));
  g.drawImage(big, sx, sy, side, side, 0, 0, OUT, OUT);
  const blob = await new Promise<Blob>((res) => out.toBlob((b) => res(b!), 'image/webp', q));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  built.dispose();
  studio.dispose();
  return { webp: btoa(s), bytes: buf.length };
}

(window as unknown as { __bake: unknown }).__bake = { render, ready: () => (ctx ??= init()).then(() => true) };
