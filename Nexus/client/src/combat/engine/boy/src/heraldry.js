// Canvas-painted heraldry: capes, the Warden's shield and the castle banners.
import * as THREE from 'three';
import { rng, Noise2 } from './noise.js';

const AZURE = '#1a346c';
const OR = '#c89a3c';
const GULES = '#5c0a10';
const SABLE = '#0c0b0d';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

// Multiplies the painted field with weave, stains and a damp, muddy hem.
function weather(ctx, w, h, seed, hem = 0.3) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const nz = new Noise2(seed);
  for (let y = 0; y < h; y++) {
    const fy = y / h;
    const damp = 1 - Math.max(0, (fy - (1 - hem)) / hem) * 0.55;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const weave = 0.9 + 0.1 * (((x >> 1) + (y >> 1)) % 2);
      const stain = 0.78 + 0.34 * nz.fbm(x / 64, y / 64, 64, 4);
      const k = weave * stain * damp;
      d[i] *= k;
      d[i + 1] *= k;
      d[i + 2] *= k;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function tower(ctx, cx, cy, s, fill, trim) {
  ctx.fillStyle = fill;
  const w = s * 0.62;
  const h = s * 0.9;
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  const m = w / 5;
  for (let k = 0; k < 3; k++) ctx.fillRect(cx - w / 2 + k * 2 * m, cy - h / 2 - m * 1.1, m, m * 1.15);
  ctx.fillRect(cx - w * 0.62, cy + h / 2 - s * 0.08, w * 1.24, s * 0.1);
  ctx.fillStyle = trim;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.16, cy + h / 2 - s * 0.08);
  ctx.lineTo(cx - w * 0.16, cy + h * 0.12);
  ctx.arc(cx, cy + h * 0.12, w * 0.16, Math.PI, 0);
  ctx.lineTo(cx + w * 0.16, cy + h / 2 - s * 0.08);
  ctx.fill();
  ctx.fillRect(cx - w * 0.07, cy - h * 0.22, w * 0.14, h * 0.16);
}

export function capeTextureAzure() {
  const w = 512;
  const h = 768;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = AZURE;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = OR;
  ctx.fillRect(w * 0.45, h * 0.1, w * 0.1, h * 0.5);
  ctx.fillRect(w * 0.26, h * 0.22, w * 0.48, w * 0.1);
  ctx.fillRect(0, 0, w * 0.03, h);
  ctx.fillRect(w * 0.97, 0, w * 0.03, h);
  ctx.fillRect(0, h * 0.955, w, h * 0.045);
  ctx.strokeStyle = 'rgba(20,14,6,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(w * 0.45, h * 0.1, w * 0.1, h * 0.5);
  ctx.strokeRect(w * 0.26, h * 0.22, w * 0.48, w * 0.1);
  weather(ctx, w, h, 12, 0.35);
  return toTexture(c);
}

export function capeTextureCrimson() {
  const w = 512;
  const h = 768;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = GULES;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2a0508';
  ctx.fillRect(0, 0, w, h * 0.04);
  tower(ctx, w * 0.5, h * 0.3, w * 0.34, SABLE, GULES);
  weather(ctx, w, h, 29, 0.45);
  // Tattered hem, tears and holes cut into the alpha channel.
  const rand = rng(404);
  const nz = new Noise2(31);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) {
    const cut = h * (0.86 + 0.12 * nz.fbm(x / 40, 0.5, 64, 3) + 0.03 * rand());
    ctx.lineTo(x, cut);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  for (let k = 0; k < 7; k++) {
    const x = w * (0.08 + 0.84 * rand());
    const top = h * (0.62 + 0.25 * rand());
    ctx.beginPath();
    ctx.moveTo(x - 6, h);
    ctx.lineTo(x + (rand() - 0.5) * 20, top);
    ctx.lineTo(x + 6 + rand() * 8, h);
    ctx.fill();
  }
  for (let k = 0; k < 9; k++) {
    ctx.beginPath();
    ctx.ellipse(w * rand(), h * (0.55 + 0.35 * rand()), 4 + rand() * 12, 3 + rand() * 9, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  return toTexture(c);
}

// Heater shield outline in metres (face coordinates), shared with the 3D geometry.
export function heaterShape(shape) {
  shape.moveTo(-0.28, 0.32);
  shape.lineTo(0.28, 0.32);
  shape.quadraticCurveTo(0.3, -0.12, 0, -0.44);
  shape.quadraticCurveTo(-0.3, -0.12, -0.28, 0.32);
  return shape;
}
export const SHIELD_BOUNDS = { x0: -0.3, x1: 0.3, y0: -0.46, y1: 0.34 };

function heaterPath(ctx, map) {
  const p = new THREE.Shape();
  heaterShape(p);
  const pts = p.getPoints(48);
  ctx.beginPath();
  pts.forEach((pt, i) => {
    const [x, y] = map(pt.x, pt.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

export function shieldTextures() {
  const w = 512;
  const h = 683;
  const B = SHIELD_BOUNDS;
  const map = (x, y) => [((x - B.x0) / (B.x1 - B.x0)) * w, ((B.y1 - y) / (B.y1 - B.y0)) * h];
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const r = makeCanvas(w, h);
  const rtx = r.getContext('2d');
  ctx.fillStyle = '#5a4128';
  ctx.fillRect(0, 0, w, h);
  heaterPath(ctx, map);
  ctx.fillStyle = OR;
  ctx.fill();
  ctx.save();
  heaterPath(ctx, map);
  ctx.clip();
  ctx.lineWidth = 44;
  ctx.strokeStyle = OR;
  ctx.fillStyle = GULES;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  tower(ctx, w * 0.5, h * 0.4, w * 0.42, SABLE, OR);
  rtx.fillStyle = '#6e6e6e';
  rtx.fillRect(0, 0, w, h);
  const rand = rng(77);
  // Chipped paint showing the wood, then scratches and two old sword gashes.
  for (let k = 0; k < 70; k++) {
    const a = rand() * Math.PI * 2;
    const rr = 0.36 + rand() * 0.14;
    const x = w * (0.5 + Math.cos(a) * rr * 0.9);
    const y = h * (0.45 + Math.sin(a) * rr);
    const s = 3 + rand() * 11;
    ctx.fillStyle = rand() > 0.5 ? '#6b4d2e' : '#4a331d';
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * (0.4 + rand() * 0.6), rand() * 3, 0, Math.PI * 2);
    ctx.fill();
    rtx.fillStyle = '#d0d0d0';
    rtx.beginPath();
    rtx.ellipse(x, y, s, s * 0.6, 0, 0, Math.PI * 2);
    rtx.fill();
  }
  for (let k = 0; k < 160; k++) {
    const x = rand() * w;
    const y = rand() * h;
    const a = rand() * Math.PI;
    const l = 6 + rand() * 50;
    ctx.strokeStyle = `rgba(210,190,160,${0.08 + rand() * 0.18})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
    rtx.strokeStyle = '#c4c4c4';
    rtx.beginPath();
    rtx.moveTo(x, y);
    rtx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    rtx.stroke();
  }
  for (const [x0, y0, x1, y1] of [
    [0.22, 0.2, 0.46, 0.33],
    [0.6, 0.52, 0.8, 0.44],
  ]) {
    ctx.strokeStyle = '#1d130b';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(w * x0, h * y0);
    ctx.lineTo(w * x1, h * y1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190,160,120,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  weather(ctx, w, h, 5, 0.25);
  return { map: toTexture(c), roughnessMap: toTexture(r, false) };
}

export function bannerTexture() {
  const w = 512;
  const h = 1024;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = GULES;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = OR;
  ctx.fillRect(0, h * 0.04, w, h * 0.02);
  tower(ctx, w * 0.5, h * 0.36, w * 0.56, SABLE, GULES);
  weather(ctx, w, h, 71, 0.2);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(w * 0.5 - 1, h * 0.8);
  ctx.lineTo(w * 0.5 - 64, h + 2);
  ctx.lineTo(w * 0.5 + 64, h + 2);
  ctx.lineTo(w * 0.5 + 1, h * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  return toTexture(c);
}
