// Картата на сървъра (Обзор, „Топокарта" v1.19) — релеф, воден от натоварването,
// с местата на седемте хъба отгоре.
//
// Защо така, а не друго:
//  · 2D canvas, НЕ втори WebGL контекст. Историята в 3D (terrain.js) вече държи
//    единия жив контекст, а браузърът гаси най-старите след ~16 — карта, която
//    изгасва историята, е по-лоша от карта без шейдъри.
//  · Платното е УКРАСА (`aria-hidden`). Местата са истински бутони отгоре: картата
//    е ускорител, не единствената навигация (рейлът/докът са винаги там).
//  · Цветът е ЗНАЧЕНИЕ: хребетите са в мента; около хъб с аларма стават
//    кехлибарени/червени — същата карта на цветовете като навсякъде, плюс
//    форма на маркера (кръг/триъгълник/квадрат) и брой.
//  · Движението е бавно „дишане" (период ~7 s), ≤24 кадъра/с, САМО докато
//    картата се вижда и разделът е отпред. При `prefers-reduced-motion` и на
//    телефон — един кадър и спира (батерията и GPU-то трябват, когато нещо гори).
import { el } from './ui.js';

// Местата на хъбовете като дял от ширината/височината на картата (долният център
// на пръстена). Подредени така, че етикетите да не се застъпват дори на 360px.
export const PLACES = {
  // Пет реда през ≥0.16 от височината (≥34px и на телефон): на един ред стоят
  // само по два пръстена, далеч един от друг — дългите (IT „Carichi di lavoro")
  // имат свой ред.
  pulse: [0.22, 0.24],
  data: [0.76, 0.22],
  release: [0.5, 0.4],
  defense: [0.84, 0.56],
  work: [0.16, 0.72],
  analysis: [0.26, 0.88],
  control: [0.74, 0.88],
};

// Хоризонталният център на всяко място в пиксели: желаното място, но пръстенът
// цял вътре в картата (±4px). Без това „Carichi di lavoro" (IT) излизаше вляво от
// картата на телефон, а „Анализ" и „Управление" се застъпваха на 390px (снимка от
// лабораторията). Чиста функция — `test/topo.test.js` я проверява на трите езика.
export function layoutPins(widths, W) {
  const out = {};
  for (const [id, w] of Object.entries(widths)) {
    const want = (PLACES[id] || [0.5, 0.5])[0] * W;
    const half = w / 2 + 4;
    out[id] = half * 2 >= W ? W / 2 : Math.min(W - half, Math.max(half, want));
  }
  return out;
}

const ROWS = 26;
const SEV_BOOST = { warn: 0.45, danger: 0.85 };

// Височина на релефа в точка (u ∈ [0,1] по ширина, d ∈ [0,1] по дълбочина).
// Чиста функция — тестваема и детерминистична при дадено t.
export function heightAt(u, d, { states = {}, load = 0, t = 0 } = {}) {
  let hgt = 0;
  let top = null;
  let topW = 0;
  for (const [id, [px, py]] of Object.entries(PLACES)) {
    const pd = (py - 0.12) / 0.84;
    const g = Math.exp(-((u - px) ** 2) / 0.012 - ((d - pd) ** 2) / 0.05);
    const s = states[id]?.sev;
    // Основата е видима и при празна машина (иначе картата е вълнички, не
    // релеф); натоварването и тревогата я вдигат.
    const amp = 0.85 + 0.75 * Math.min(1, Math.max(0, load)) + (SEV_BOOST[s] || 0);
    const w = g * amp;
    hgt += w;
    if (w > topW) {
      topW = w;
      top = id;
    }
  }
  hgt += Math.sin(u * 17 + d * 9 + t * 0.5) * 0.05 + Math.sin(u * 41 - d * 5) * 0.025;
  return { h: hgt * (1 + 0.05 * Math.sin(t + d * 6)), top, topW };
}

function rgbVar(cs, name, fallback) {
  const v = cs.getPropertyValue(name).trim();
  return v || fallback;
}

export function mountTopo(host, { hubs, states = {}, load = 0, onPick } = {}) {
  const cv = el('canvas', { 'aria-hidden': 'true' });
  host.appendChild(cv);
  const pins = new Map();
  for (const h of hubs) {
    const [x, y] = PLACES[h.id] || [0.5, 0.5];
    const n = el('span', { class: 'n' });
    const pin = el('button', { class: 'topo-pin', style: `left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%`, title: h.q, onclick: () => onPick?.(h.id) }, [
      el('span', { class: 'mk', 'aria-hidden': 'true' }),
      el('span', { text: h.label }),
      n,
    ]);
    pins.set(h.id, { pin, n });
    host.appendChild(pin);
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const still = reduced || matchMedia('(max-width: 820px), (pointer: coarse)').matches;
  let cur = { states, load };
  let t = 0;
  let visible = true;
  let timer = null;
  let dead = false;

  function draw() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const cs = getComputedStyle(host);
    const RGB = {
      ok: rgbVar(cs, '--glow-rgb', '79, 227, 166'),
      warn: rgbVar(cs, '--warn-rgb', '255, 191, 64'),
      danger: rgbVar(cs, '--danger-rgb', '255, 92, 110'),
    };
    const ground = rgbVar(cs, '--screen', '#030b08');
    const step = Math.max(4, Math.round(w / 220));
    for (let r = 0; r < ROWS; r++) {
      const d = r / (ROWS - 1);
      const y0 = h * 0.12 + d * h * 0.84;
      const amp = h * (0.09 + d * 0.2);
      const pts = [];
      for (let x = 0; x <= w + step; x += step) {
        const u = Math.min(1, x / w);
        const { h: hh, top, topW } = heightAt(u, d, { states: cur.states, load: cur.load, t });
        pts.push([Math.min(x, w), y0 - hh * amp, topW > 0.35 ? cur.states[top]?.sev : null]);
      }
      // Запълването до дъното закрива хребетите зад този; контурът е само по хребета.
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.lineTo(w, h);
      g.lineTo(0, h);
      g.closePath();
      g.fillStyle = ground;
      g.fill();
      const a = 0.16 + d * 0.66;
      g.lineWidth = 1 + d * 0.7;
      for (let i = 1; i < pts.length; i++) {
        const sev = pts[i][2] || pts[i - 1][2];
        g.strokeStyle = `rgba(${RGB[sev] || RGB.ok}, ${sev ? Math.min(1, a + 0.2) : a})`;
        g.beginPath();
        g.moveTo(pts[i - 1][0], pts[i - 1][1]);
        g.lineTo(pts[i][0], pts[i][1]);
        g.stroke();
      }
    }
  }

  function paintPins() {
    for (const [id, { pin, n }] of pins) {
      const s = cur.states[id];
      pin.dataset.sev = s?.sev || 'ok';
      n.textContent = s?.sev ? String(s.n) : '';
    }
    placePins();
  }
  // Ширината на пръстена зависи от езика и от числото в него — мери се, не се гадае.
  function placePins() {
    const W = host.clientWidth;
    if (!W) return;
    const widths = {};
    for (const [id, { pin }] of pins) widths[id] = pin.offsetWidth;
    const xs = layoutPins(widths, W);
    for (const [id, { pin }] of pins) pin.style.left = `${xs[id].toFixed(1)}px`;
  }

  function loop() {
    timer = null;
    if (dead || !visible || document.hidden) return;
    t += (2 * Math.PI) / (7 * 24);
    draw();
    timer = setTimeout(() => requestAnimationFrame(loop), 1000 / 24);
  }
  function kick() {
    if (still) {
      draw();
      return;
    }
    if (!timer) loop();
  }

  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((es) => {
        visible = es.some((e) => e.isIntersecting);
        if (visible) kick();
      })
    : null;
  io?.observe(host);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { placePins(); draw(); }) : null;
  ro?.observe(host);
  const onVis = () => !document.hidden && kick();
  document.addEventListener('visibilitychange', onVis);

  paintPins();
  requestAnimationFrame(() => {
    placePins();
    draw();
    kick();
  });
  // Шрифтът идва след първото рисуване и сменя ширината на пръстените.
  document.fonts?.ready.then(() => !dead && placePins());

  return {
    update(states2, load2) {
      cur = { states: states2 || cur.states, load: load2 ?? cur.load };
      paintPins();
      draw();
    },
    destroy() {
      dead = true;
      if (timer) clearTimeout(timer);
      io?.disconnect();
      ro?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}
