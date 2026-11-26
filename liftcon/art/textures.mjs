// Процедурни PBR текстури (canvas 2D) — детерминистични (seed), без външни файлове.
import * as THREE from 'three';

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
}
// tileable value noise: cx, cy = брой клетки по периода
function tn(u, v, cx, cy, s) {
  const x = u * cx, y = v * cy, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const X0 = ((x0 % cx) + cx) % cx, X1 = (X0 + 1) % cx, Y0 = ((y0 % cy) + cy) % cy, Y1 = (Y0 + 1) % cy;
  const a = hash2(X0, Y0, s), b = hash2(X1, Y0, s), c = hash2(X0, Y1, s), d = hash2(X1, Y1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(u, v, cx, cy, oct, s) {
  let a = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) { a += amp * tn(u, v, cx << o, cy << o, s + o * 17); tot += amp; amp *= 0.5; }
  return a / tot;
}
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(canvas, { srgb = false, aniso = 16, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
  return t;
}
function perPixel(S, W, H, fn) {
  const c = cv(W, H), g = c.getContext('2d'), im = g.createImageData(W, H), d = im.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4; const px = fn(x / W, y / H, x, y); d[o] = px[0]; d[o + 1] = px[1]; d[o + 2] = px[2]; d[o + 3] = 255;
  }
  g.putImageData(im, 0, 0); return c;
}

// ---------- Терацо: плочи 1.2 м, 2x2 в текстура от 2.4 м ----------
export function terrazzo(seed = 11, S = 4096) {
  const c = cv(S, S), g = c.getContext('2d'), R = mulberry32(seed);
  const slab = S / 2, ppm = S / 2.4;
  const bases = [0xc6c3bb, 0xcac7bf, 0xc2bfb7, 0xc8c5bd];
  const chipCols = [[0xf1ece2, 34], [0xe3d8c2, 26], [0xb9b3a8, 22], [0x8f8e8a, 14], [0x44474a, 6], [0xc2a688, 9], [0xa3ab9f, 8], [0xd9cdb5, 20]];
  const totalW = chipCols.reduce((a, b) => a + b[1], 0);
  const pick = () => { let r = R() * totalW; for (const [h, w] of chipCols) { if ((r -= w) <= 0) return h; } return 0xf1ece2; };
  for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
    const x0 = sx * slab, y0 = sy * slab;
    g.save(); g.beginPath(); g.rect(x0, y0, slab, slab); g.clip();
    g.fillStyle = '#' + bases[sy * 2 + sx].toString(16).padStart(6, '0'); g.fillRect(x0, y0, slab, slab);
    // леко облачно изменение на тона
    for (let i = 0; i < 40; i++) {
      const gx = x0 + R() * slab, gy = y0 + R() * slab, rr = 150 + R() * 400;
      const gr = g.createRadialGradient(gx, gy, 0, gx, gy, rr); const dk = R() < 0.5;
      gr.addColorStop(0, dk ? 'rgba(90,80,65,0.05)' : 'rgba(255,250,240,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(gx - rr, gy - rr, rr * 2, rr * 2);
    }
    const n = 5200;
    for (let i = 0; i < n; i++) {
      const big = R() < 0.035; const size = (big ? 28 + R() * 32 : 3 + Math.pow(R(), 1.8) * 26) * ppm / 1707;
      const [r, gg, b] = hex(pick()); const sh = 0.9 + R() * 0.16;
      g.fillStyle = `rgb(${Math.min(255, r * sh) | 0},${Math.min(255, gg * sh) | 0},${Math.min(255, b * sh) | 0})`;
      const cx = x0 + R() * slab, cy = y0 + R() * slab, k = 5 + (R() * 4 | 0), rot = R() * 6.28, el = 0.6 + R() * 0.4;
      g.beginPath();
      for (let j = 0; j < k; j++) { const a = rot + j / k * 6.283 + (R() - 0.5) * 0.5, rr = size * (0.6 + R() * 0.55);
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * el; j ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.closePath(); g.fill();
    }
    // ситни песъчинки
    for (let i = 0; i < 9000; i++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(60,55,50,0.3)';
      g.fillRect(x0 + R() * slab, y0 + R() * slab, 1.5, 1.5); }
    g.restore();
  }
  // фуги (2 мм) + сянка
  g.fillStyle = 'rgba(70,64,56,0.75)';
  for (const p of [0, slab]) { g.fillRect(p - 1.5, 0, 3, S); g.fillRect(0, p - 1.5, S, 3); }
  g.fillRect(S - 1.5, 0, 1.5, S); g.fillRect(0, S - 1.5, S, 1.5);
  return tex(c, { srgb: true });
}

// ---------- Травертин: панели 1.2 х 0.6 м, 2.4 х 2.4 м текстура ----------
export function travertine(seed = 5, S = 2048) {
  const pal = [hex(0xe5ded2), hex(0xddd3c2), hex(0xede7dc), hex(0xd0c4ae)];
  const col = perPixel(S, S, S, (u, v) => {
    const pc = Math.floor(u * 2), pr = Math.floor(v * 4), ps = seed + pc * 7 + pr * 13;
    const uu = u + pc * 0.31 + pr * 0.17, vv = v + pr * 0.23;
    const warp = fbm(uu, vv, 3, 5, 3, ps) * 0.05;
    const band = fbm(uu, vv + warp, 2, 44, 4, ps + 3);
    const band2 = fbm(uu, vv + warp * 1.5, 3, 90, 3, ps + 9);
    let t = sstep(0.30, 0.72, band);
    let c = [mix(pal[0][0], pal[1][0], t), mix(pal[0][1], pal[1][1], t), mix(pal[0][2], pal[1][2], t)];
    const lt = sstep(0.55, 0.78, band2); c = [mix(c[0], pal[2][0], lt * 0.6), mix(c[1], pal[2][1], lt * 0.6), mix(c[2], pal[2][2], lt * 0.6)];
    const vein = 1 - sstep(0.0, 0.04, Math.abs(band2 - 0.45)); const dk = vein * 0.16;
    c = [mix(c[0], pal[3][0] * 0.82, dk), mix(c[1], pal[3][1] * 0.8, dk), mix(c[2], pal[3][2] * 0.78, dk)];
    const tone = 0.965 + hash2(pc, pr, ps) * 0.07, gr = 0.985 + fbm(u, v, 300, 300, 2, 1) * 0.03;
    const f = tone * gr; return [c[0] * f, c[1] * f, c[2] * f];
  });
  const g = col.getContext('2d'), R = mulberry32(seed * 31);
  const bump = cv(S, S), bg = bump.getContext('2d'); bg.fillStyle = '#808080'; bg.fillRect(0, 0, S, S);
  // грапавост по пластовете
  const bimg = perPixel(S, S, S, (u, v) => { const b = fbm(u, v, 2, 120, 3, seed + 99); const k = 118 + b * 26; return [k, k, k]; });
  bg.drawImage(bimg, 0, 0);
  const pitsN = 8 * 40 / 1; // 8 панела x ~40
  for (let i = 0; i < 230; i++) {
    const x = R() * S, y = R() * S, w = 2.5 + Math.pow(R(), 3) * 14, h = 1.4 + R() * 2.4, a = (R() - 0.5) * 0.1;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = `rgba(150,130,104,${0.16 + R() * 0.14})`; g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(110,90,68,0.3)'; g.beginPath(); g.ellipse(0, h * 0.18, w * 0.8, h * 0.55, 0, 0, 6.283); g.fill();
    g.restore();
    bg.save(); bg.translate(x, y); bg.rotate(a); bg.fillStyle = 'rgba(20,20,20,0.85)'; bg.beginPath(); bg.ellipse(0, 0, w, h, 0, 0, 6.283); bg.fill(); bg.restore();
  }
  // фуги
  for (const [cc, w] of [[g, 'rgba(110,98,80,0.7)'], [bg, 'rgba(0,0,0,0.9)']]) {
    cc.fillStyle = w;
    for (let i = 0; i <= 2; i++) cc.fillRect(i * S / 2 - 1.5, 0, 3, S);
    for (let i = 0; i <= 4; i++) cc.fillRect(0, i * S / 4 - 1.5, S, 3);
    cc.fillRect(S - 2, 0, 2, S); cc.fillRect(0, S - 2, S, 2);
  }
  return { map: tex(col, { srgb: true }), bump: tex(bump) };
}

// ---------- Орех: вертикални летви 66 мм, 1.32 х 1.98 м ----------
export function walnut(seed = 3, W = 2048, H = 3072) {
  const dk = hex(0x33211a), md = hex(0x4f3424), lt = hex(0x654530);
  const slatW = W / 20;
  const col = perPixel(0, W, H, (u, v, x) => {
    const si = Math.floor(x / slatW), lx = (x % slatW) / slatW, s = seed + si * 5;
    if (lx < 0.04 || lx > 0.96) return [8, 6, 5];
    const warp = fbm(u, v, 6, 3, 3, s) * 0.5;
    const gr = tn(u + warp * 0.02 + si * 0.37, v, 150 + (si % 5) * 12, 2, s) * 0.55 + fbm(u + si * 0.13, v, 18, 4, 3, s + 4) * 0.45;
    const ring = 0.5 + 0.5 * Math.sin((lx * 9 + warp * 6 + hash2(si, 1, seed) * 6) * 3.14);
    let t = sstep(0.1, 0.9, gr * 0.6 + ring * 0.4); const tone = 0.86 + hash2(si, 7, seed) * 0.22;
    const a = t < 0.5 ? [mix(dk[0], md[0], t * 2), mix(dk[1], md[1], t * 2), mix(dk[2], md[2], t * 2)] : [mix(md[0], lt[0], t * 2 - 1), mix(md[1], lt[1], t * 2 - 1), mix(md[2], lt[2], t * 2 - 1)];
    const edge = 1 - 0.35 * (sstep(0.0, 0.1, 0.1 - Math.min(lx - 0.04, 0.96 - lx)));
    return [a[0] * tone * edge, a[1] * tone * edge, a[2] * tone * edge];
  });
  const rough = perPixel(0, W / 2, H / 2, (u, v, x) => { const lx = ((x * 2) % slatW) / slatW; const k = (lx < 0.04 || lx > 0.96) ? 255 : 105 + fbm(u, v, 80, 6, 2, 9) * 40; return [k, k, k]; });
  return { map: tex(col, { srgb: true }), rough: tex(rough) };
}

// ---------- Шлифована (браширана) стомана: 1 м плочка ----------
export function brushedSteel(seed = 8, S = 2048) {
  const val = (u, v) => 0.45 * tn(u, v, 1100, 5, seed) + 0.3 * tn(u, v, 520, 9, seed + 1) + 0.15 * tn(u, v, 2000, 3, seed + 2) + 0.1 * tn(u, v, 6, 6, seed + 3);
  const bump = perPixel(0, S, S, (u, v) => { const k = 70 + val(u, v) * 150; return [k, k, k]; });
  const rough = perPixel(0, S, S, (u, v) => { const k = 255 * (0.34 + 0.32 * (val(u, v) - 0.5)); return [k, k, k]; });
  return { bump: tex(bump), rough: tex(rough) };
}

// ---------- мек радиален блясък (за зелен светлинен акцент) ----------
export function glowTexture() {
  const c = cv(256, 256), g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.07)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c);
}
// ---------- светла на тавана: вертикален градиент (зелен #5FD11E -> #2E7D12) ----------
export function greenGradient() {
  const c = cv(4, 128), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#5FD11E'); gr.addColorStop(1, '#2E7D12'); g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
