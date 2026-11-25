// Помощниците на клипа (promo/README.md): време, плавност, текст, прозорец с камера, курсор.
// Всичко се рисува от `t` (секунди) — без CSS анимации, затова всеки кадър е детерминистичен.
/* eslint-disable no-unused-vars */
const BPM = 104;
const BEAT = 60 / BPM;
const BAR = 4 * BEAT;
const at = (bar, beat = 0) => bar * BAR + beat * BEAT;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const ease = {
  out: (x) => 1 - Math.pow(1 - x, 3),
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inOutQuint: (x) => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2),
  outBack: (x) => {
    const c1 = 1.5;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
  in: (x) => x * x * x,
};

function el(tag, cls, parent, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html !== undefined) node.innerHTML = html;
  if (parent) parent.appendChild(node);
  return node;
}
function place(node, x, y, w, h) {
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  if (w !== undefined) node.style.width = `${w}px`;
  if (h !== undefined) node.style.height = `${h}px`;
  return node;
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Кинетичен текст: думите влизат една след друга (отдолу, от размито), излизат заедно.
 * `parts` — масив от [текст, клас] или низ; `*дума*` в низа е акцент.
 */
function kinetic(parent, text, cls, x, y, opts = {}) {
  const node = el('div', `kt ${cls}`, parent);
  place(node, x, y, opts.w);
  if (opts.align) node.style.textAlign = opts.align;
  const words = [];
  let inAccent = false; // „*няколко думи*“ — акцентът продължава през интервалите
  for (const line of text.split('\n')) {
    const lineEl = el('div', '', node);
    line.split(/(\s+)/).forEach((token) => {
      if (!token) return;
      if (/^\s+$/.test(token)) {
        lineEl.appendChild(document.createTextNode(' '));
        return;
      }
      let word = token;
      if (word.startsWith('*')) {
        inAccent = true;
        word = word.slice(1);
      }
      const closes = word.endsWith('*');
      if (closes) word = word.slice(0, -1);
      const w = el('span', `w${inAccent ? ' accent' : ''}`, lineEl, esc(word));
      if (closes) inAccent = false;
      words.push(w);
    });
  }
  return {
    node,
    /** in: [начало, продължителност на една дума, отместване между думите]; out: [начало, продължителност] */
    draw(t, inAt, outAt = Infinity, stagger = 0.06, dur = 0.7) {
      words.forEach((w, i) => {
        const p = ease.outExpo(seg(t, inAt + i * stagger, inAt + i * stagger + dur));
        const q = ease.in(seg(t, outAt, outAt + 0.45));
        const o = p * (1 - q);
        w.style.opacity = o.toFixed(3);
        w.style.transform = `translateY(${((1 - p) * 46 - q * 26).toFixed(1)}px)`;
        w.style.filter = p < 1 || q > 0 ? `blur(${((1 - p) * 10 + q * 8).toFixed(2)}px)` : 'none';
      });
    },
  };
}

/** Видимост на сцена с мек преход: нарастване при влизане, затъмняване при излизане. */
function sceneAlpha(t, a, b, fadeIn = 0.45, fadeOut = 0.45) {
  return Math.min(
    ease.out(seg(t, a - fadeIn * 0.5, a + fadeIn * 0.5)),
    1 - ease.in(seg(t, b - fadeOut * 0.5, b + fadeOut * 0.5)),
  );
}

/**
 * Прозорец на браузъра с реална снимка и камера: `frame(rect, fill)` → мащаб и отместване, така че
 * правоъгълникът от страницата (CSS px) да е в средата на изгледа.
 */
function browserWindow(parent, shotKey, url, w, h) {
  const shot = window.SHOTS[shotKey];
  const win = el('div', 'win', parent);
  place(win, 0, 0, w, h);
  const top = el('div', 'top', win);
  el('i', 'dot', top);
  el('i', 'dot', top);
  el('i', 'dot', top);
  const [host, ...rest] = url.split('/');
  el('div', 'url', top, `<b>${esc(host)}</b>/${esc(rest.join('/'))}`);
  const view = el('div', 'view', win);
  const cam = el('div', 'cam', view);
  const img = el('img', '', cam);
  img.src = `/shots/${shot.file}`;
  img.style.width = `${shot.w}px`;
  img.style.height = `${shot.h}px`;
  const VW = w;
  const VH = h - 44;
  const layers = { cam, img, shot };
  function camFor(rect, fill = 0.9) {
    const [x, y, rw, rh] = rect;
    let s = Math.min((VW * fill) / rw, (VH * fill) / rh);
    s = Math.max(s, VW / shot.w);
    let tx = VW / 2 - (x + rw / 2) * s;
    let ty = VH / 2 - (y + rh / 2) * s;
    tx = Math.min(0, Math.max(VW - shot.w * s, tx));
    ty = Math.min(0, Math.max(VH - shot.h * s, ty));
    return { s, tx, ty };
  }
  return {
    win,
    layers,
    VW,
    VH,
    camFor,
    /** keys: [[време, rect, fill]] — плавен път на камерата между ключовите кадри */
    camera(t, keys) {
      let a = keys[0];
      let b = keys[0];
      for (let i = 0; i < keys.length; i++) {
        if (t >= keys[i][0]) {
          a = keys[i];
          b = keys[i + 1] || keys[i];
        }
      }
      const ca = camFor(a[1], a[2]);
      const cb = camFor(b[1], b[2]);
      const p = b === a ? 0 : ease.inOutQuint(seg(t, a[0], b[0]));
      const s = Math.exp(lerp(Math.log(ca.s), Math.log(cb.s), p));
      // Точката в средата се движи по права в координатите на страницата — без „люлеене“ при зуум.
      const cx = lerp((VW / 2 - ca.tx) / ca.s, (VW / 2 - cb.tx) / cb.s, p);
      const cy = lerp((VH / 2 - ca.ty) / ca.s, (VH / 2 - cb.ty) / cb.s, p);
      const tx = VW / 2 - cx * s;
      const ty = VH / 2 - cy * s;
      cam.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(4)})`;
      return { s, tx, ty };
    },
    /** Точка от страницата (CSS px) → точка в прозореца (за курсора). */
    toWin(px, py, c) {
      return [c.tx + px * c.s, 44 + c.ty + py * c.s];
    },
  };
}

/** Рамка около елемент от страницата — живее в слоя на камерата, затова следва зуума. */
function highlight(cam, rect, pad = 8) {
  const node = el('div', 'hl', cam);
  place(node, rect[0] - pad, rect[1] - pad, rect[2] + 2 * pad, rect[3] + 2 * pad);
  return {
    draw(p) {
      node.style.opacity = p.toFixed(3);
      node.style.transform = `scale(${lerp(1.08, 1, ease.outExpo(p)).toFixed(4)})`;
    },
  };
}

/** „Писане“: попълнената снимка се разкрива върху празната в полето, отляво надясно, с каретка. */
function typing(cam, filledSrc, shot, rect) {
  const box = el('div', 'reveal', cam);
  place(box, rect[0], rect[1], 0, rect[3]);
  const img = el('img', '', box);
  img.src = filledSrc;
  img.style.width = `${shot.w}px`;
  img.style.height = `${shot.h}px`;
  img.style.left = `${-rect[0]}px`;
  img.style.top = `${-rect[1]}px`;
  const caret = el('div', 'caret', cam);
  return {
    draw(p, showCaret) {
      // Текстът е в лявата част на полето: разкриваме до 75 % от ширината, после цялото.
      const w = p >= 1 ? rect[2] : rect[2] * 0.78 * p;
      box.style.width = `${w}px`;
      const blink = showCaret && p < 1;
      place(caret, rect[0] + Math.max(10, w), rect[1] + rect[3] * 0.22, undefined, rect[3] * 0.56);
      caret.style.opacity = blink ? '1' : '0';
    },
  };
}

const CURSOR_SVG =
  '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.6 L12 13.8 L19 13.8 Z" fill="#fff" stroke="#0c1929" stroke-width="1.4" stroke-linejoin="round"/></svg>';

function cursor(parent) {
  const node = el('div', 'cursor', parent, CURSOR_SVG);
  const ripple = el('div', 'ripple', parent);
  return {
    /** path: [[време, x, y]]; clicks: [време] */
    draw(t, path, clicks = [], visible = 1) {
      let x = path[0][1];
      let y = path[0][2];
      for (let i = 0; i < path.length - 1; i++) {
        const [t0, x0, y0] = path[i];
        const [t1, x1, y1] = path[i + 1];
        if (t >= t0) {
          const p = ease.inOut(seg(t, t0, t1));
          // Лека дъга — човешко движение, не права.
          const arc = Math.sin(p * Math.PI) * Math.min(80, Math.hypot(x1 - x0, y1 - y0) * 0.12);
          x = lerp(x0, x1, p) + arc * 0.3;
          y = lerp(y0, y1, p) - arc;
        }
      }
      let press = 0;
      let rp = -1;
      for (const c of clicks) {
        if (t >= c - 0.08 && t < c + 0.18) press = Math.sin(seg(t, c - 0.08, c + 0.18) * Math.PI);
        if (t >= c && t < c + 0.6) rp = seg(t, c, c + 0.6);
      }
      node.style.opacity = String(visible);
      node.style.transform = `translate(${x - 4}px, ${y - 2}px) scale(${1 - press * 0.18})`;
      if (rp >= 0) {
        const r = lerp(8, 46, ease.out(rp));
        place(ripple, x - r, y - r, 2 * r, 2 * r);
        ripple.style.opacity = String((1 - rp) * visible);
      } else ripple.style.opacity = '0';
    },
  };
}

const ICONS = {
  check:
    '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="#2cc5b5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  shield:
    '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z"/><path d="M8.8 12.2l2.2 2.2 4.4-4.6"/></svg>',
  globe:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/></svg>',
  archive:
    '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/></svg>',
  key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2"/></svg>',
};
