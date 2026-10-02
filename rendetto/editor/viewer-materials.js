// Procedural board materials for the 3D view: decor colour from the catalog (hex, and a darker tone for wood),
// wood grain or fine speckle drawn on a canvas, gloss from the decor finish. No photographs are used.
import * as THREE from 'three';
import { decor } from '../engine/materials.js';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const hashStr = (str) => [...str].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}

function woodCanvas(base, dark, seed, w = 1024, h = 512) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < 900; i++) {
    const y0 = r() * h;
    const amp = 0.3 + r() * 2.2;
    const freq = (0.001 + r() * 0.003) * Math.PI * 2;
    const ph = r() * 10;
    g.beginPath();
    for (let x = 0; x <= w; x += 16) {
      const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 0.37 + ph * 2) * amp * 0.6;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokeStyle = dark;
    g.globalAlpha = 0.03 + r() * 0.11;
    g.lineWidth = 0.3 + r() * 1.4;
    g.stroke();
  }
  g.fillStyle = dark;
  for (let i = 0; i < 4200; i++) {
    g.globalAlpha = 0.07 + r() * 0.18;
    g.fillRect(r() * w, r() * h, 2 + r() * 7, 0.5 + r() * 0.5);
  }
  g.globalAlpha = 1;
  return c;
}

function speckCanvas(base, amount, seed, size = 256) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const r = rng(seed);
  for (let i = 0; i < size * size * amount; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)';
    g.globalAlpha = 0.02 + r() * 0.05;
    g.fillRect(r() * size, r() * size, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  return c;
}

function chipCanvas() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#c9ad84';
  g.fillRect(0, 0, size, size);
  const r = rng(17);
  for (let i = 0; i < 2600; i++) {
    const t = r();
    g.fillStyle = t < 0.4 ? '#8e7350' : t < 0.75 ? '#e2c9a0' : '#a88a60';
    g.globalAlpha = 0.5 + r() * 0.5;
    g.fillRect(r() * size, r() * size, 1 + r() * 4, 1 + r() * 3);
  }
  return c;
}

const ROUGH = {
  gloss: 0.14,
  'high-gloss': 0.1,
  satin: 0.34,
  pearl: 0.36,
  matt: 0.52,
  'super-matt': 0.62,
};

// Finish → metal look for handles and hardware.
const FINISH = [
  [
    /черен|black|графит|graphite|антрацит|anthracite/i,
    { color: 0x1d1d1f, metalness: 0.55, roughness: 0.5 },
  ],
  [/злат|gold|месинг|brass|шампан|champagne/i, { color: 0xc6a15b, metalness: 1, roughness: 0.3 }],
  [
    /бронз|bronze|антик|antique|мед|copper|кафяв|brown/i,
    { color: 0x6e4b2a, metalness: 0.9, roughness: 0.42 },
  ],
  [/бял|white/i, { color: 0xf0efea, metalness: 0, roughness: 0.4 }],
  [/хром|chrome|гланц/i, { color: 0xdfe2e4, metalness: 1, roughness: 0.12 }],
];

export class MaterialCache {
  constructor(renderer) {
    this.renderer = renderer;
    this.textures = new Map();
    this.materials = new Map();
  }

  texture(key, make, repeat) {
    if (!this.textures.has(key)) {
      const t = new THREE.CanvasTexture(make());
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
      if (repeat) t.repeat.set(repeat[0], repeat[1]);
      this.textures.set(key, t);
    }
    return this.textures.get(key);
  }

  get(key, make) {
    if (!this.materials.has(key)) this.materials.set(key, make());
    return this.materials.get(key);
  }

  // Board face or edge band in a decor (or a RAL lacquer).
  board(decorId, edge = false) {
    return this.get(`${edge ? 'band' : 'face'}:${decorId}`, () => {
      const d = decor(decorId);
      const rough = ROUGH[d.finish] ?? 0.45;
      if (d.painted)
        return new THREE.MeshPhysicalMaterial({
          color: d.hex,
          roughness: 0.32,
          clearcoat: 0.35,
          clearcoatRoughness: 0.35,
        });
      const seed = hashStr(decorId);
      let map;
      if (d.category === 'wood')
        map = this.texture(`wood:${decorId}`, () =>
          woodCanvas(d.hex, d.hexDark ?? shade(d.hex, 0.68), seed),
        );
      else if (d.category === 'stone' || d.category === 'concrete')
        map = this.texture(`stone:${decorId}`, () => speckCanvas(d.hex, 0.45, seed), [9, 4.5]);
      else map = this.texture(`uni:${decorId}`, () => speckCanvas(d.hex, 0.025, seed), [9, 4.5]);
      return new THREE.MeshPhysicalMaterial({
        map,
        roughness: edge ? Math.max(0.1, rough - 0.08) : rough,
        metalness: 0,
        clearcoat: rough < 0.2 ? 0.6 : 0.08,
        clearcoatRoughness: 0.5,
      });
    });
  }

  raw() {
    return this.get(
      'raw',
      () =>
        new THREE.MeshStandardMaterial({
          map: this.texture('chip', chipCanvas, [13, 6.5]),
          roughness: 0.9,
        }),
    );
  }

  hdf(face) {
    return this.get(
      `hdf:${face}`,
      () =>
        new THREE.MeshStandardMaterial({
          map: this.texture(
            `hdf:${face}`,
            () => speckCanvas(face ? '#f1f0ec' : '#8b6b4e', face ? 0.02 : 0.12, face ? 9 : 11, 128),
            [18, 9],
          ),
          roughness: face ? 0.5 : 0.85,
        }),
    );
  }

  metal(finish = '') {
    const hit = FINISH.find(([re]) => re.test(finish));
    const p = hit ? hit[1] : { color: 0xb9bec2, metalness: 1, roughness: 0.32 };
    return this.get(`metal:${p.color}`, () => new THREE.MeshPhysicalMaterial(p));
  }

  floor() {
    return this.get(
      'floor',
      () =>
        new THREE.MeshStandardMaterial({
          map: this.texture('floor', () => woodCanvas('#b89a74', '#7d6447', 99), [2, 4]),
          roughness: 0.62,
        }),
    );
  }

  plain(key, params) {
    return this.get(key, () => new THREE.MeshStandardMaterial(params));
  }
}
