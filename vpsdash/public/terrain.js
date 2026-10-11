// „Терен на натоварването" — историята на машината в 3D, като водопада на
// спектрален анализатор: всяка метрика е лента във времето, височината е
// стойността, магентната равнина е прагът от 85%.
//
// Защо 3D, а не още една плоска графика: четирите метрики СЕ ГЛЕДАТ ЗАЕДНО.
// Въпросът при инцидент е „кое се качи първо" — скок в мрежата, после CPU,
// после паметта. Наредени една зад друга в пространството, лентите показват
// съвпадението във времето с един поглед; четири отделни графики искат четири
// погледа и сравнение наум.
//
// Правила, които този модул НЕ нарушава:
//   · нула зависимости и нула външни ресурси — чист WebGL2, собствена матрична
//     математика (~40 реда);
//   · рисува САМО при нужда (нови данни, влачене, посочване) — няма вечен цикъл,
//     GPU-то спи, докато панелът стои отворен на телефона;
//   · „не знам" не е нула: липсваща проба СКЪСВА лентата, не я сваля на пода;
//   · единственото движение без действие на човека е еднократното „изправяне"
//     при отваряне (0.7 s) и то изчезва при prefers-reduced-motion;
//   · без WebGL2 връща null — обзорът си остава 2D, нищо не гърми.
import { el, fmtBps } from './ui.js';

// Ширина на времевата ос (световни единици). На тесен екран е по-къса: иначе
// широката сцена се мащабира по ширина и остава ивица в средата на картата.
let W = 12;
const H = 3.2; // височина на 100%
const GAP = 1.45; // разстояние между лентите
const MAX_COLS = 300; // повече колони не носят нищо на екран — само шум
const THRESHOLD = 85;
// Отвъд ~55° времевата ос гледа към камерата: колоните се застъпват, етикетите
// също, а посочването по екранно x престава да е еднозначно.
const YAW_MAX = 0.95;

// Отпред назад. Дискът е обикновено висок и равен — стои отзад, за да не крие
// останалите; мрежата е шиповата — отпред.
const LANES = [
  { key: 'net', label: 'Мрежа ▼', pct: false, get: (p) => p.rxBps },
  { key: 'cpu', label: 'CPU', pct: true, get: (p) => p.cpu },
  { key: 'mem', label: 'Памет', pct: true, get: (p) => (p.memUsed != null && p.memTotal ? (p.memUsed / p.memTotal) * 100 : null) },
  { key: 'disk', label: 'Диск', pct: true, get: (p) => p.diskMax },
];
const laneZ = (i) => (1.5 - i) * GAP; // отпред (+z) назад (−z)

// ── Матрици (колонен ред, като в GLSL) ─────────────────────────────────────
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function lookAt(e, c, u) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
  l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
}
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}

function hexRgb(h, fallback) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim());
  const v = m ? m[1] : fallback;
  return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255];
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const VS = `#version 300 es
in vec3 aPos;
in vec4 aCol;
uniform mat4 uMVP;
uniform vec3 uEye;
uniform float uRise;
out vec4 vCol;
out float vDist;
void main() {
  vec3 p = vec3(aPos.x, aPos.y * uRise, aPos.z);
  vCol = aCol;
  vDist = distance(p, uEye);
  gl_Position = uMVP * vec4(p, 1.0);
}`;
// Мъгла към цвета на картата: далечното избледнява — дълбочина без сенки.
const FS = `#version 300 es
precision mediump float;
in vec4 vCol;
in float vDist;
uniform vec3 uFog;
uniform vec2 uFogRange;
out vec4 o;
void main() {
  float f = smoothstep(uFogRange.x, uFogRange.y, vDist) * 0.6;
  vec3 c = mix(vCol.rgb, uFog, f);
  o = vec4(c * vCol.a, vCol.a);
}`;

let current = null; // един жив контекст: браузърът държи ~16, после гаси най-старите

export function mountTerrain(host, { lang = 'bg-BG' } = {}) {
  if (current) current.destroy();
  const canvas = el('canvas', {
    class: 'terrain-cv',
    role: 'img',
    tabindex: '0',
    'aria-label': 'Натоварване във времето в 3D: мрежа, CPU, памет и диск. Стрелките въртят изгледа.',
  });
  let gl = null;
  try {
    gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const prog = program(gl, VS, FS);
  if (!prog) return null;

  const labels = el('div', { class: 'terrain-labels', 'aria-hidden': 'true' });
  const tip = el('div', { class: 'terrain-tip hidden', role: 'status' });
  host.append(canvas, labels, tip);

  const css = getComputedStyle(document.documentElement);
  const C = {
    panel: hexRgb(css.getPropertyValue('--panel'), '25292e'),
    line: hexRgb(css.getPropertyValue('--line'), '3a4047'),
    data: hexRgb(css.getPropertyValue('--txt'), 'eef1f3'),
    warn: hexRgb(css.getPropertyValue('--warn'), 'f2b544'),
    bad: hexRgb(css.getPropertyValue('--danger'), 'ff6b6b'),
    target: hexRgb(css.getPropertyValue('--target'), 'e27ae0'),
    accent: hexRgb(css.getPropertyValue('--accent'), '5cd0e3'),
  };
  const stateCol = (lane, v) => (!lane.pct ? mix(C.data, C.panel, 0.25) : v > 95 ? C.bad : v > THRESHOLD ? C.warn : C.data);

  const loc = {
    pos: gl.getAttribLocation(prog, 'aPos'),
    col: gl.getAttribLocation(prog, 'aCol'),
    mvp: gl.getUniformLocation(prog, 'uMVP'),
    eye: gl.getUniformLocation(prog, 'uEye'),
    rise: gl.getUniformLocation(prog, 'uRise'),
    fog: gl.getUniformLocation(prog, 'uFog'),
    fogRange: gl.getUniformLocation(prog, 'uFogRange'),
  };
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(loc.pos);
  gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(loc.col);
  gl.vertexAttribPointer(loc.col, 4, gl.FLOAT, false, 28, 12);

  // Изгледът по подразбиране зависи от формата: на широка карта отстрани (времето
  // тече хоризонтално), на тесен екран — повече отгоре, за да се разделят
  // лентите по височина вместо да се смачкат в една ивица. Щом човекът завърти,
  // неговият ъгъл печели до двойния клик.
  const homeFor = (aspect) => (aspect < 1.7 ? { yaw: -0.16, pitch: 0.78 } : { yaw: -0.3, pitch: 0.36 });
  const cam = { ...homeFor(2.5) };
  let userMoved = false;
  let cols = []; // [{ts, v:[...по ленти]}]
  let netPeak = 1;
  let hover = -1;
  let rise = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0;
  let riseStart = 0;
  let raf = 0;
  let mvp = null;
  let size = { w: 1, h: 1 };
  let dead = false;

  // ── Данни → колони ──────────────────────────────────────────────────────
  // Пикът в интервала, не средното: средното изглажда точно шипа, заради
  // който човек отваря панела. Интервал без нито една проба остава null.
  function setData(points) {
    const pts = (points || []).filter((p) => p && p.ts != null);
    const n = Math.min(MAX_COLS, pts.length);
    cols = [];
    if (n < 2) return;
    const per = pts.length / n;
    for (let i = 0; i < n; i++) {
      const slice = pts.slice(Math.floor(i * per), Math.max(Math.floor(i * per) + 1, Math.floor((i + 1) * per)));
      const v = LANES.map((lane) => {
        let m = null;
        for (const p of slice) {
          const x = lane.get(p);
          if (x != null && Number.isFinite(x)) m = m == null ? x : Math.max(m, x);
        }
        return m;
      });
      cols.push({ ts: slice[slice.length - 1].ts, v, span: slice.length });
    }
    netPeak = Math.max(1, ...cols.map((c) => c.v[0] ?? 0));
  }

  const xAt = (i) => -W / 2 + (cols.length < 2 ? 0 : (i / (cols.length - 1)) * W);
  const hAt = (lane, v) => (v == null ? null : Math.max(0, Math.min(1.08, (lane.pct ? v / 100 : v / netPeak))) * H);

  // ── Геометрия ──────────────────────────────────────────────────────────
  function build() {
    const tri = []; // непрозрачни
    const lin = []; // линии
    const glass = []; // полупрозрачни
    const v = (arr, x, y, z, c, a = 1) => arr.push(x, y, z, c[0], c[1], c[2], a);
    const quad = (arr, p, c, a) => { // p: 4 върха по ред
      for (const k of [0, 1, 2, 0, 2, 3]) v(arr, p[k][0], p[k][1], p[k][2], c[k] || c, a);
    };
    const zf = laneZ(0) + 0.7, zb = laneZ(LANES.length - 1) - 0.7;

    // Под: базови линии на лентите + четвъртини на времето.
    for (let i = 0; i < LANES.length; i++) { v(lin, -W / 2, 0, laneZ(i), C.line); v(lin, W / 2, 0, laneZ(i), C.line); }
    for (let q = 0; q <= 4; q++) { const x = -W / 2 + (q / 4) * W; v(lin, x, 0, zf, C.line); v(lin, x, 0, zb, C.line); }
    // Задна стена: 25/50/75/100% — скалата, по която се чете височината.
    for (const pct of [25, 50, 75, 100]) {
      const y = (pct / 100) * H;
      v(lin, -W / 2, y, zb, C.line, 0.8); v(lin, W / 2, y, zb, C.line, 0.8);
    }
    v(lin, -W / 2, 0, zb, C.line); v(lin, -W / 2, H, zb, C.line);
    v(lin, W / 2, 0, zb, C.line); v(lin, W / 2, H, zb, C.line);

    LANES.forEach((lane, li) => {
      const z = laneZ(li);
      for (let i = 0; i + 1 < cols.length; i++) {
        const h0 = hAt(lane, cols[i].v[li]);
        const h1 = hAt(lane, cols[i + 1].v[li]);
        if (h0 == null || h1 == null) continue; // „не знам" скъсва лентата
        const x0 = xAt(i), x1 = xAt(i + 1);
        const s0 = stateCol(lane, cols[i].v[li]);
        const s1 = stateCol(lane, cols[i + 1].v[li]);
        // Завеса: тъмна долу, оцветена горе — обемът се чете без осветление.
        const bot = mix(C.panel, [0, 0, 0], 0.18);
        quad(tri, [[x0, 0, z], [x0, h0, z], [x1, h1, z], [x1, 0, z]],
          [bot, mix(C.panel, s0, 0.2), mix(C.panel, s1, 0.2), bot]);
        // Горен ръб: лента с дебелина, видима и отгоре.
        quad(tri, [[x0, h0, z - 0.06], [x0, h0, z + 0.06], [x1, h1, z + 0.06], [x1, h1, z - 0.06]], [s0, s0, s1, s1]);
        v(lin, x0, h0 + 0.002, z, s0); v(lin, x1, h1 + 0.002, z, s1);
      }
    });

    // Прагът: магентна равнина над процентните ленти (не над мрежата — там
    // „85%" няма смисъл).
    const yT = (THRESHOLD / 100) * H;
    const tz0 = laneZ(1) + 0.55, tz1 = laneZ(LANES.length - 1) - 0.55;
    quad(glass, [[-W / 2, yT, tz0], [W / 2, yT, tz0], [W / 2, yT, tz1], [-W / 2, yT, tz1]], C.target, 0.09);
    for (const [a, b] of [[[-W / 2, yT, tz0], [W / 2, yT, tz0]], [[-W / 2, yT, tz1], [W / 2, yT, tz1]]]) {
      v(lin, ...a, C.target, 0.75); v(lin, ...b, C.target, 0.75);
    }

    // Избраният момент: циан срез през всички ленти (циан = изборът на човека).
    if (hover >= 0 && hover < cols.length) {
      const x = xAt(hover);
      quad(glass, [[x, 0, zf], [x, H * 1.05, zf], [x, H * 1.05, zb], [x, 0, zb]], C.accent, 0.12);
      v(lin, x, 0, zf, C.accent); v(lin, x, H * 1.05, zf, C.accent);
    }
    return { tri: new Float32Array(tri), lin: new Float32Array(lin), glass: new Float32Array(glass) };
  }

  // ── Рисуване ────────────────────────────────────────────────────────────
  function draw(now) {
    raf = 0;
    if (dead) return;
    if (rise < 1) {
      if (!riseStart) riseStart = now;
      const t = Math.min(1, (now - riseStart) / 700);
      rise = 1 - Math.pow(1 - t, 3);
      if (t < 1) request();
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    size = { w, h };
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Кадрирането: камерата е на постоянно разстояние, а проекцията се
    // мащабира и центрира така, че ЦЯЛАТА сцена (с полето за етикетите вляво)
    // да запълни платното — на широка карта, на телефон и при всяко завъртане.
    // Равномерният мащаб е смяна на фокусното разстояние, не изкривяване.
    const target = [0, H * 0.42, -0.2];
    const aspect = w / h;
    if (!userMoved) Object.assign(cam, homeFor(aspect));
    W = aspect < 1.7 ? 6.5 : 12;
    const d = 16;
    const eye = [
      target[0] + d * Math.cos(cam.pitch) * Math.sin(cam.yaw),
      target[1] + d * Math.sin(cam.pitch),
      target[2] + d * Math.cos(cam.pitch) * Math.cos(cam.yaw),
    ];
    const base = mul(perspective(0.6, aspect, 0.5, 120), lookAt(eye, target, [0, 1, 0]));
    const zf = laneZ(0) + 0.7, zb = laneZ(LANES.length - 1) - 0.7;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const x of [-W / 2 - 1.9, W / 2 + 1.0]) for (const y of [-0.4, H * 1.05]) for (const z of [zf, zb]) {
      const cw = base[3] * x + base[7] * y + base[11] * z + base[15];
      const nx = (base[0] * x + base[4] * y + base[8] * z + base[12]) / cw;
      const ny = (base[1] * x + base[5] * y + base[9] * z + base[13]) / cw;
      x0 = Math.min(x0, nx); x1 = Math.max(x1, nx); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny);
    }
    const k = Math.min(1.92 / (x1 - x0), 1.88 / (y1 - y0));
    const frame = [k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1, 0, -k * (x0 + x1) / 2, -k * (y0 + y1) / 2, 0, 1];
    mvp = mul(frame, base);

    gl.useProgram(prog);
    gl.uniformMatrix4fv(loc.mvp, false, new Float32Array(mvp));
    gl.uniform3fv(loc.eye, eye);
    gl.uniform1f(loc.rise, rise);
    gl.uniform3fv(loc.fog, C.panel);
    gl.uniform2f(loc.fogRange, d * 0.75, d * 1.45);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

    const g = build();
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
    gl.bufferData(gl.ARRAY_BUFFER, g.tri, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, g.tri.length / 7);
    gl.bufferData(gl.ARRAY_BUFFER, g.lin, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINES, 0, g.lin.length / 7);
    gl.depthMask(false);
    gl.bufferData(gl.ARRAY_BUFFER, g.glass, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, g.glass.length / 7);
    gl.depthMask(true);

    placeLabels();
  }
  function request() {
    if (!raf && !dead) raf = requestAnimationFrame(draw);
  }

  // Световна точка → пиксели в контейнера (null зад камерата).
  function project(x, y, z) {
    if (!mvp) return null;
    const cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
    const cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
    const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
    if (cw <= 0.01) return null;
    return { x: ((cx / cw + 1) / 2) * size.w, y: ((1 - cy / cw) / 2) * size.h };
  }

  // Етикетите са HTML, не текстура: превеждат се, четат се от екранния четец
  // на картата и са остри при всяко увеличение.
  const laneEls = LANES.map((lane) => el('span', { class: 'tl-lane', text: lane.label }));
  const pctEls = [25, 50, 75, 100].map((p) => el('span', { class: 'tl-pct', 'data-p': String(p), raw: `${p}%` }));
  const thrEl = el('span', { class: 'tl-thr', raw: `${THRESHOLD}%` });
  const t0El = el('span', { class: 'tl-time', raw: '' });
  const t1El = el('span', { class: 'tl-time', text: 'сега' });
  labels.append(...laneEls, ...pctEls, thrEl, t0El, t1El);
  function put(node, p, dx = 0, dy = 0) {
    if (!p) { node.style.display = 'none'; return; }
    node.style.display = '';
    node.style.transform = `translate(${Math.round(p.x + dx)}px, ${Math.round(p.y + dy)}px)`;
  }
  function placeLabels() {
    const y0 = rise;
    // Етикетът на лентата завършва В началото ѝ (дясно подравнен към точката).
    LANES.forEach((_, i) => put(laneEls[i], project(-W / 2 - 0.25, 0, laneZ(i)), -laneEls[i].offsetWidth - 4, -9));
    const zb = laneZ(LANES.length - 1) - 0.7;
    [25, 50, 75, 100].forEach((p, i) => put(pctEls[i], project(W / 2 + 0.15, (p / 100) * H * y0, zb), 4, -7));
    put(thrEl, project(W / 2 + 0.15, (THRESHOLD / 100) * H * y0, laneZ(1) + 0.55), 4, -7);
    const zf = laneZ(0) + 0.7;
    if (cols.length) t0El.textContent = fmtTime(cols[0].ts);
    put(t0El, project(-W / 2, 0, zf), 0, 6);
    put(t1El, project(W / 2, 0, zf), -24, 6);
  }
  function fmtTime(ts) {
    const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(lang, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  // ── Взаимодействие ──────────────────────────────────────────────────────
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, moved: false };
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; userMoved = true; }
      cam.yaw = clamp(drag.yaw - dx * 0.0045, -YAW_MAX, YAW_MAX);
      // На тъч вертикалното плъзгане е скрол на страницата (touch-action: pan-y).
      if (e.pointerType !== 'touch') cam.pitch = clamp(drag.pitch + dy * 0.006, 0.08, 1.25);
      hideTip();
      request();
      return;
    }
    pick(e);
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', (e) => { if (drag && !drag.moved) pick(e); end(); });
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { if (!drag) { hover = -1; hideTip(); request(); } });
  canvas.addEventListener('dblclick', () => { userMoved = false; request(); });
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') cam.yaw = clamp(cam.yaw + 0.1, -YAW_MAX, YAW_MAX);
    else if (k === 'ArrowRight') cam.yaw = clamp(cam.yaw - 0.1, -YAW_MAX, YAW_MAX);
    else if (k === 'ArrowUp') cam.pitch = clamp(cam.pitch + 0.08, 0.08, 1.25);
    else if (k === 'ArrowDown') cam.pitch = clamp(cam.pitch - 0.08, 0.08, 1.25);
    else if (k === 'Home') { userMoved = false; request(); e.preventDefault(); return; }
    else return;
    userMoved = true;
    e.preventDefault();
    request();
  });

  // Най-близката колона по екранно x на предната лента — при перспектива x
  // остава монотонно, значи едно минаване стига.
  function pick(e) {
    if (cols.length < 2) return;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const zf = laneZ(0);
    let best = -1, bd = Infinity;
    for (let i = 0; i < cols.length; i++) {
      const p = project(xAt(i), 0, zf);
      if (!p) continue;
      const d = Math.abs(p.x - px);
      if (d < bd) { bd = d; best = i; }
    }
    if (best !== hover) { hover = best; request(); }
    showTip(best, e.clientX - r.left, e.clientY - r.top);
  }
  function showTip(i, x, y) {
    const c = cols[i];
    if (!c) return hideTip();
    tip.innerHTML = '';
    tip.append(el('div', { class: 'tt-time', raw: fmtTime(c.ts) }));
    LANES.forEach((lane, li) => {
      const val = c.v[li];
      const txt = val == null ? '—' : lane.pct ? `${Math.round(val)}%` : fmtBps(val);
      const row = el('div', { class: 'tt-row' }, [el('span', { text: lane.label }), el('b', { raw: txt })]);
      if (lane.pct && val != null) row.dataset.level = val > 95 ? 'bad' : val > THRESHOLD ? 'warn' : 'ok';
      tip.append(row);
    });
    tip.classList.remove('hidden');
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.transform = `translate(${Math.round(Math.min(size.w - tw - 6, Math.max(6, x + 14)))}px, ${Math.round(Math.max(6, Math.min(size.h - th - 6, y - th - 10)))}px)`;
  }
  function hideTip() { tip.classList.add('hidden'); }

  const ro = new ResizeObserver(() => request());
  ro.observe(host);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); dead = true; });

  const api = {
    update(points) { setData(points); request(); },
    destroy() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* вече изгубен */ }
      if (current === api) current = null;
    },
  };
  current = api;
  return api;
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function program(gl, vs, fs) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}
