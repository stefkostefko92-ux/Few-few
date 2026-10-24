#!/usr/bin/env node
// popup_shield3d.mjs — щитът на марката за popup-а като ПРЕДВАРИТЕЛНО рендериран 3D (three.js).
// Същият подход като tools/agents/mascot-icons3d.mjs: тежкото 3D е в билд инструмент, който се
// пуска от човек и чийто изход се комитва; в разширението няма three.js (нула отдалечен код).
//
// Изход (popup/img/, всичко ≤150 KB общо):
//   shield-<ok|pause|off>-bg.webp   щитът (сгънат на две фасети, метална рамка, карбоново поле,
//                                   неонов канал) + бейкнат ореол и сянка на „тика“
//   shield-<ok|pause|off>-fg.webp   „тикът“ (острието), отделен слой → паралакс по курсора
//   shield-bg-n.webp, shield-fg-n.webp  карти на нормалите (екранни) за преосветяване в
//                                   popup/shield3d.js (малък собствен WebGL2, без библиотека)
// Статичният кадър в popup.html е bg+fg (CSS наслояване) — идентичен с първия GL кадър в покой.
//
//   node tools/popup_shield3d.mjs                 # регенерира всичко
//   node tools/popup_shield3d.mjs --preview <dir> # + PNG на 4× за преглед
//   node tools/popup_shield3d.mjs --hero <out.png> [--hero-size 1100]
//                                                 # само голям щит (щит + острие, ореол) за промо
//                                                 # графиките (tools/store_promo.mjs); popup/img не се пипа
//
// Иска Playwright + Chromium (PW_ROOT=$(npm root -g)) и мрежа до cdn.jsdelivr.net (three, пиннат).
// Не е в CI и не влиза в пакета (tools/ се изключва от package.sh).
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "popup", "img");
const THREE_VER = "0.186.0"; // същата като mascot/cinematic/package.json
const HERO = process.argv.includes("--hero") ? process.argv[process.argv.indexOf("--hero") + 1] : null;
const SIZE = HERO ? Number(process.argv.includes("--hero-size") ? process.argv[process.argv.indexOf("--hero-size") + 1] : 1100) : 300; // popup: 150 CSS px @2x
const SS = HERO ? 2 : 4;     // суперсемплинг (голямото платно е вече 2200 px)
const preview = process.argv.includes("--preview") ? process.argv[process.argv.indexOf("--preview") + 1] : null;
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
const { chromium } = require("playwright");

const page0 = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/"}}</script>
<style>html,body{margin:0;background:#222}</style></head><body><script type="module">
import * as THREE from "three";
window.THREE = THREE; window.ready = true;

const S = ${SIZE} * ${SS}, K = ${SIZE} / 300; // K: ореолът и сянката растат с размера
const PALETTE = {
  ok:    { frameL: 0x2a7fc4, frameR: 0x4fe6e0, field: 0x0b2b38, fieldE: 0x0a7d96, fieldEI: 0.5, chan: 0x00e5ff, blade: 0x5fdcf0, bladeE: 0x00c4e0, bladeEI: 0.5, rim: 0x00e5ff, halo: [0, 229, 255], haloA: 0.55, metal: 1.0 },
  pause: { frameL: 0xa8651a, frameR: 0xf5bd4a, field: 0x2e200a, fieldE: 0x8a5a0e, fieldEI: 0.5, chan: 0xffb830, blade: 0xffc65a, bladeE: 0xff9d1a, bladeEI: 0.45, rim: 0xffb02e, halo: [255, 176, 46], haloA: 0.5, metal: 1.0 },
  off:   { frameL: 0x5a6068, frameR: 0xaab1bb, field: 0x15191e, fieldE: 0x2c323a, fieldEI: 0.3, chan: 0x6b727c, blade: 0x9aa1ab, bladeE: 0x3a4048, bladeEI: 0.15, rim: 0x8a919b, halo: [138, 145, 155], haloA: 0.18, metal: 0.9 },
};

// ---- форма на щита (дясна половина; лявата е огледална) ----
const CY = -0.02;
function halfOutline(k) { // k = мащаб около (0,CY); от върха (x=0) по рамото и ръба до острието
  const pts = [];
  const P = (x, y) => new THREE.Vector2(x * k, CY + (y - CY) * k);
  const apex = [0, 0.96], sh = [0.88, 0.64], sideTop = [0.88, 0.22], tip = [0, -1.04];
  const seg = (a, b, c, n) => { for (let i = 0; i <= n; i++) { const t = i / n; // квадратична
    pts.push(P((1-t)*(1-t)*a[0] + 2*(1-t)*t*b[0] + t*t*c[0], (1-t)*(1-t)*a[1] + 2*(1-t)*t*b[1] + t*t*c[1])); } };
  seg(apex, [0.46, 0.84], sh, 14);
  pts.pop(); pts.push(P(sh[0], sh[1]), P(sideTop[0], sideTop[1]));
  // долната дъга към острието (кубична)
  const c0 = sideTop, c1 = [0.88, -0.42], c2 = [0.34, -0.80], c3 = tip;
  for (let i = 1; i <= 28; i++) { const t = i / 28, u = 1 - t;
    pts.push(P(u*u*u*c0[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*c3[0], u*u*u*c0[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*c3[1])); }
  return pts;
}
const mirror = (pts) => pts.map((p) => new THREE.Vector2(-p.x, p.y)).reverse();
function halfShape(kOut, kIn, side) { // kIn=0 → плътна половина; иначе рамка между kIn и kOut
  let o = halfOutline(kOut);
  if (side < 0) o = mirror(o);
  if (!kIn) return new THREE.Shape(o);
  let i = halfOutline(kIn); if (side < 0) i = mirror(i);
  return new THREE.Shape(o.concat(i.slice().reverse()));
}
const ext = (shape, depth, bevel) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 6, curveSegments: 32 });

// острието („тик“): отгоре-лява опашка → дебело тяло → остър връх горе вдясно
function bladeShape() {
  const s = new THREE.Shape();
  s.moveTo(-1.02, -0.20);
  s.bezierCurveTo(-0.92, -0.46, -0.52, -0.54, -0.06, -0.26);   // долен ръб: коремът
  s.bezierCurveTo(0.30, -0.02, 0.70, 0.46, 1.10, 1.00);        // към върха
  s.bezierCurveTo(0.66, 0.56, 0.26, 0.24, -0.10, 0.02);        // горен ръб назад
  s.bezierCurveTo(-0.46, -0.16, -0.80, -0.18, -1.02, -0.20);   // обратно към опашката
  return s;
}

function carbonNormal() {
  const N = 128, c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d"), h = new Float32Array(N * N), cell = 16;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / cell * 2, v = y / cell * 2, iu = Math.floor(u), iv = Math.floor(v);
    const horiz = ((iu + iv) % 4 + 4) % 4 < 2;
    h[y * N + x] = horiz ? Math.sin(Math.PI * (v - iv)) : Math.sin(Math.PI * (u - iu));
  }
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N], hy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
    const nx = -hx * 1.4, ny = -hy * 1.4, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * N + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i+1] = (ny / l * 0.5 + 0.5) * 255; img.data[i+2] = (nz / l * 0.5 + 0.5) * 255; img.data[i+3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); t.anisotropy = 8; return t;
}

// студийна среда: тъмна, с мека бяла лайт-кутия, циан лента и топла точка — за метала
function studioEnv(renderer, accent) {
  const sc = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ color: 0x070b10, side: THREE.BackSide })); sc.add(dome);
  const box = (w, h, col, int, pos) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(int), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); sc.add(m); };
  box(8, 6, 0xffffff, 5.0, [-5, 6, 5]);
  box(2.0, 9, accent, 4.5, [7, 0, -1]);
  box(7, 1.6, 0xbfe9ff, 3.4, [0, -6, 4]);
  box(2, 2, 0xfff1d6, 2.0, [5, 4, 6]);
  const pm = new THREE.PMREMGenerator(renderer); const t = pm.fromScene(sc, 0.03).texture; pm.dispose(); return t;
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(S, S, false); renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement); renderer.domElement.style.cssText = "width:300px;height:300px";
const carbon = carbonNormal();

function build(st) {
  const P = PALETTE[st];
  const root = new THREE.Group(), shield = new THREE.Group(), blade = new THREE.Group();
  const frameMat = (c) => new THREE.MeshPhysicalMaterial({ color: c, metalness: P.metal * 0.62, roughness: 0.26, clearcoat: 0.8, clearcoatRoughness: 0.1, envMapIntensity: 2.3 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x03070a, emissive: P.chan, emissiveIntensity: 0.9, roughness: 0.5, metalness: 0.2 });
  const fieldMat = new THREE.MeshPhysicalMaterial({ color: P.field, metalness: 0.55, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.08, normalMap: carbon, normalScale: new THREE.Vector2(0.55, 0.55), emissive: P.fieldE, emissiveIntensity: P.fieldEI, envMapIntensity: 1.1 });
  for (const side of [1, -1]) {
    const half = new THREE.Group();
    const frame = new THREE.Mesh(ext(halfShape(1.0, 0.82, side), 0.12, 0.05), frameMat(side > 0 ? P.frameR : P.frameL));
    const plate = new THREE.Mesh(ext(halfShape(0.835, 0, side), 0.02, 0.01), plateMat); plate.position.z = 0.0;
    const field = new THREE.Mesh(ext(halfShape(0.755, 0, side), 0.07, 0.035), fieldMat); field.position.z = 0.03;
    half.add(frame, plate, field);
    half.rotation.y = side > 0 ? 0.20 : -0.20;
    shield.add(half);
  }
  const bladeMat = new THREE.MeshPhysicalMaterial({ color: P.blade, metalness: 0.15, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, emissive: P.bladeE, emissiveIntensity: P.bladeEI, envMapIntensity: 0.9 });
  const b = new THREE.Mesh(ext(bladeShape(), 0.1, 0.05), bladeMat); b.position.z = 0.42; blade.add(b);
  root.add(shield, blade);
  root.rotation.set(0.10, -0.30, 0);
  return { root, shield, blade, P };
}

const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 50);
camera.position.set(0, 0.0, 8.2); camera.lookAt(0, 0.0, 0);

// слоеве: "bg" (щит) / "fg" (острие) / "all"; режим: beauty | normal
window.renderLayer = (st, layer, mode) => {
  const { root, shield, blade, P } = build(st);
  shield.visible = layer !== "fg"; blade.visible = layer !== "bg";
  const sc = new THREE.Scene(); sc.add(root);
  if (mode === "normal") {
    sc.overrideMaterial = new THREE.MeshNormalMaterial();
    renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(new THREE.Color().setRGB(0.5, 0.5, 1, THREE.LinearSRGBColorSpace), 1);
  } else {
    sc.environment = studioEnv(renderer, P.rim); sc.environmentIntensity = 1.0;
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-0.45 * 6, 0.62 * 6, 0.66 * 6); sc.add(key);
    const rim = new THREE.DirectionalLight(P.rim, 3.2); rim.position.set(5, 1.5, -3); sc.add(rim);
    const fill = new THREE.DirectionalLight(0x8fb8ff, 0.5); fill.position.set(3, -3, 5); sc.add(fill);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3; renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
  }
  renderer.render(sc, camera);
  const c = document.createElement("canvas"); c.width = c.height = S; c.getContext("2d").drawImage(renderer.domElement, 0, 0);
  return c;
};

// ---- 2D постпроцес: суперсемпл, ореол, сянка → WebP ----
function down(c, size) { const o = document.createElement("canvas"); o.width = o.height = size; const g = o.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(c, 0, 0, size, size); return o; }
function tinted(c, rgb, blurPx, alpha) { // силует → цветен размит
  const o = document.createElement("canvas"); o.width = o.height = c.width; const g = o.getContext("2d");
  g.filter = "blur(" + blurPx + "px)"; g.drawImage(c, 0, 0); g.filter = "none";
  g.globalCompositeOperation = "source-in"; g.fillStyle = "rgb(" + rgb.join(",") + ")"; g.fillRect(0, 0, o.width, o.height);
  const r = document.createElement("canvas"); r.width = r.height = c.width; const h = r.getContext("2d"); h.globalAlpha = alpha; h.drawImage(o, 0, 0); return r;
}
window.makeSprite = (st, layer, q) => window.spriteCanvas(st, layer).toDataURL("image/webp", q);
window.spriteCanvas = (st, layer) => {
  const P = PALETTE[st];
  let beauty = down(window.renderLayer(st, layer, "beauty"), ${SIZE});
  const out = document.createElement("canvas"); out.width = out.height = ${SIZE}; const g = out.getContext("2d");
  if (layer === "bg") {
    // ореол: размит силует в цвета на състоянието, под щита
    g.drawImage(tinted(beauty, P.halo, 14 * K, P.haloA), 0, 0);
    g.drawImage(tinted(beauty, P.halo, 5 * K, P.haloA * 0.5), 0, 0);
    // сянка на острието върху щита (само там, където има щит)
    const bladeA = down(window.renderLayer(st, "fg", "beauty"), ${SIZE});
    const sh = document.createElement("canvas"); sh.width = sh.height = ${SIZE}; const sg = sh.getContext("2d");
    sg.filter = "blur(" + 5 * K + "px)"; sg.drawImage(bladeA, 7 * K, 9 * K); sg.filter = "none";
    sg.globalCompositeOperation = "source-in"; sg.fillStyle = "rgba(0,0,0,0.62)"; sg.fillRect(0, 0, ${SIZE}, ${SIZE});
    sg.globalCompositeOperation = "destination-in"; sg.drawImage(beauty, 0, 0);
    g.drawImage(beauty, 0, 0); g.drawImage(sh, 0, 0);
  } else {
    g.drawImage(tinted(beauty, P.halo, 10 * K, P.haloA * 0.9), 0, 0);
    g.drawImage(beauty, 0, 0);
    g.globalCompositeOperation = "lighter"; g.globalAlpha = st === "off" ? 0.0 : 0.35; g.filter = "blur(" + 6 * K + "px)"; g.drawImage(beauty, 0, 0);
  }
  return out;
};
// the promo hero: shield + blade in one transparent PNG, the same layering as the popup's static frame
window.makeHero = () => {
  const out = document.createElement("canvas"); out.width = out.height = ${SIZE}; const g = out.getContext("2d");
  g.drawImage(window.spriteCanvas("ok", "bg"), 0, 0); g.drawImage(window.spriteCanvas("ok", "fg"), 0, 0);
  return out.toDataURL("image/png");
};
window.makeNormal = (layer, q) => down(window.renderLayer("ok", layer, "normal"), ${SIZE}).toDataURL("image/webp", q);
window.makePng = (st, layer) => down(window.renderLayer(st, layer, "beauty"), ${SIZE}).toDataURL("image/png");
</script></body></html>`;

const browser = await chromium.launch({
  executablePath: CHROME,
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({ viewport: { width: 400, height: 400 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
if (process.env.DEBUG) { page.on("pageerror", (e) => console.error("PAGE", e.message)); page.on("console", (m) => console.error("CON", m.text().slice(0, 300))); }
// Chromium през проксито на средата реже CDN-а понякога — curl минава (само в инструмента, не в продукта).
await page.route("https://cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" },
  body: execFileSync("curl", ["-sSf", r.request().url()], { maxBuffer: 1 << 26 }) }));
await page.route("https://shield.test/**", (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: page0 }));
for (let i = 1; ; i++) {
  try { await page.goto("https://shield.test/"); await page.waitForFunction(() => window.ready && window.makeSprite, null, { timeout: 60_000 }); break; }
  catch (e) { if (i >= 3) throw e; console.error(`… three.js не се зареди (опит ${i}/3)`); }
}

if (HERO) {
  mkdirSync(dirname(HERO), { recursive: true });
  const b = Buffer.from((await page.evaluate(() => window.makeHero())).split(",")[1], "base64");
  writeFileSync(HERO, b); console.log(`✓ ${HERO} ${SIZE}×${SIZE} ${(b.length / 1024).toFixed(0)} KB`);
  await browser.close(); process.exit(0);
}
mkdirSync(OUT, { recursive: true });
let total = 0;
const save = (name, dataUrl) => { const b = Buffer.from(dataUrl.split(",")[1], "base64"); writeFileSync(join(OUT, name), b); total += b.length; console.log(`✓ ${name.padEnd(24)} ${(b.length / 1024).toFixed(1)} KB`); };
for (const st of ["ok", "pause", "off"]) {
  for (const layer of ["bg", "fg"]) {
    save(`shield-${st}-${layer}.webp`, await page.evaluate(([s, l]) => window.makeSprite(s, l, 0.82), [st, layer]));
    if (preview) { mkdirSync(preview, { recursive: true }); writeFileSync(join(preview, `${st}-${layer}.png`), Buffer.from((await page.evaluate(([s, l]) => window.makePng(s, l), [st, layer])).split(",")[1], "base64")); }
  }
}
for (const layer of ["bg", "fg"]) save(`shield-${layer}-n.webp`, await page.evaluate((l) => window.makeNormal(l, 0.9), layer));
console.log(`общо ${(total / 1024).toFixed(1)} KB`);
await browser.close();
