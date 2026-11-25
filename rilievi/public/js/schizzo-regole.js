// The rules of the sketch elements in the browser: what the server takes (`valido` mirrors
// src/schizzi/elementi.ts — a unit test runs both on thousands of elements), bringing an element the
// editor made into that shape (`normalizza`: whole numbers, inside the sheet, no empty keys — null when
// nothing is left), the drawing weight of an element (the sheet's budget), moving it, and the points it
// offers to snapping. Pure functions of the sizes the server sends (`schizzi-vista`); no DOM.
(() => {
  'use strict';

  window.rilieviRegole = (view, forme) => {
    const W = view.larghezza;
    const H = view.altezza;
    const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    const PERCORSO = new RegExp(
      `^M\\d{1,4} \\d{1,4}(?:l-?\\d{1,4} -?\\d{1,4}){1,${view.maxSegmenti}}z?$`,
    );
    const KEYS = {
      p: ['t', 'c', 's', 'k', 'd'],
      x: ['t', 'c', 's', 'x', 'y', 'v'],
      e: ['t', 'c', 's', 'k', 'x', 'y', 'rx', 'ry'],
      a: ['t', 'c', 's', 'k', 'x1', 'y1', 'x2', 'y2', 'v'],
      q: ['t', 'c', 's', 'x1', 'y1', 'x2', 'y2', 'o', 'v', 'm'],
      s: ['t', 'c', 's', 'k', 'n', 'x', 'y', 'w', 'h', 'r', 'f'],
    };

    // The text as the server keeps it: no control, invisible or lone surrogate characters, single
    // spaces.
    const pulito = (value) =>
      String(value)
        .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const intero = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
    const testoOk = (v, max) =>
      typeof v === 'string' &&
      v.length <= max * 4 &&
      pulito(v).length >= 1 &&
      pulito(v).length <= max;
    const inX = (v) => intero(v, 0, W);
    // The dimension line (the points moved by `o`) stays on the sheet, 2 units of slack — as
    // src/schizzi/elementi.ts (lineaQuotaNelFoglio), the same operations in the same order.
    const lineaNelFoglio = (el, o) => {
      const lungo = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
      const nx = -(el.y2 - el.y1) / lungo;
      const ny = (el.x2 - el.x1) / lungo;
      return [
        [el.x1 + nx * o, el.y1 + ny * o],
        [el.x2 + nx * o, el.y2 + ny * o],
      ].every(([x, y]) => x >= -2 && x <= W + 2 && y >= -2 && y <= H + 2);
    };
    const inY = (v) => intero(v, 0, H);

    const valido = (el) => {
      if (!el || typeof el !== 'object' || !hasOwn(KEYS, el.t)) return false;
      if (Object.keys(el).some((key) => !KEYS[el.t].includes(key))) return false;
      if (!['k', 'r', 'b'].includes(el.c) || (el.s !== 1 && el.s !== 2)) return false;
      if (hasOwn(el, 'k') && el.k !== 1 && el.k !== undefined) return false;
      switch (el.t) {
        case 'p': {
          if (typeof el.d !== 'string' || el.d.length > 50000 || !PERCORSO.test(el.d)) return false;
          const [x, y] = forme.puntiDi(el.d)[0];
          return x <= W && y <= H;
        }
        case 'x':
          return inX(el.x) && inY(el.y) && testoOk(el.v, view.maxTesto);
        case 'e':
          return inX(el.x) && inY(el.y) && intero(el.rx, 1, W) && intero(el.ry, 1, W);
        case 'a':
          return (
            inX(el.x1) &&
            inY(el.y1) &&
            inX(el.x2) &&
            inY(el.y2) &&
            (el.x1 !== el.x2 || el.y1 !== el.y2) &&
            (el.v === undefined || testoOk(el.v, view.maxTesto))
          );
        case 'q':
          return (
            inX(el.x1) &&
            inY(el.y1) &&
            inX(el.x2) &&
            inY(el.y2) &&
            (el.x1 !== el.x2 || el.y1 !== el.y2) &&
            intero(el.o, -W, W) &&
            testoOk(el.v, view.maxQuota) &&
            (el.m === undefined || (el.m === 'r' && el.o === 0)) &&
            lineaNelFoglio(el, el.o)
          );
        default:
          return (
            typeof el.n === 'string' &&
            hasOwn(view.simboli, el.n) &&
            inX(el.x) &&
            inY(el.y) &&
            intero(el.w, 10, W) &&
            intero(el.h, 10, W) &&
            intero(el.r, 0, 3) &&
            (el.f === undefined || el.f === 1)
          );
      }
    };

    const clamp = (v, min, max) => Math.min(max, Math.max(min, Math.round(v)));
    // The offset of a dimension cut so that its line stays on the sheet (1 unit inside the slack).
    const offsetInside = (el, o) => {
      const lungo = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
      const n = [-(el.y2 - el.y1) / lungo, (el.x2 - el.x1) / lungo];
      let lo = -W;
      let hi = W;
      [
        [el.x1, el.y1],
        [el.x2, el.y2],
      ].forEach((p) =>
        [W, H].forEach((max, axis) => {
          if (Math.abs(n[axis]) < 1e-9) return;
          const a = (-1 - p[axis]) / n[axis];
          const b = (max + 1 - p[axis]) / n[axis];
          lo = Math.max(lo, Math.min(a, b));
          hi = Math.min(hi, Math.max(a, b));
        }),
      );
      return Math.min(Math.floor(hi), Math.max(Math.ceil(lo), Math.round(o)));
    };
    // The element as the server takes it, or null: rounded and kept inside the sheet, the texts
    // cleaned, the empty or default keys left out. An empty dimension gets "?" (measured later).
    const normalizza = (el) => {
      const out = { t: el.t, c: el.c, s: el.s };
      if (el.k && el.t !== 'x' && el.t !== 'q') out.k = 1;
      switch (el.t) {
        case 'p':
          out.d = el.d;
          break;
        case 'x': {
          const v = pulito(el.v || '').slice(0, view.maxTesto);
          if (!v) return null;
          Object.assign(out, { x: clamp(el.x, 0, W), y: clamp(el.y, 0, H), v });
          break;
        }
        case 'e':
          Object.assign(out, {
            x: clamp(el.x, 0, W),
            y: clamp(el.y, 0, H),
            rx: clamp(el.rx, 1, W),
            ry: clamp(el.ry, 1, W),
          });
          break;
        case 'a':
        case 'q': {
          Object.assign(out, {
            x1: clamp(el.x1, 0, W),
            y1: clamp(el.y1, 0, H),
            x2: clamp(el.x2, 0, W),
            y2: clamp(el.y2, 0, H),
          });
          if (out.x1 === out.x2 && out.y1 === out.y2) return null;
          const max = el.t === 'q' ? view.maxQuota : view.maxTesto;
          const v = pulito(el.v || '').slice(0, max);
          if (el.t === 'q') {
            out.o = el.m === 'r' ? 0 : offsetInside(out, el.o || 0);
            out.v = v || '?';
            if (el.m === 'r') out.m = 'r';
          } else if (v) {
            out.v = v;
          }
          break;
        }
        default:
          if (!hasOwn(view.simboli, el.n)) return null;
          Object.assign(out, {
            n: el.n,
            x: clamp(el.x, 0, W),
            y: clamp(el.y, 0, H),
            w: clamp(el.w, 10, W),
            h: clamp(el.h, 10, W),
            r: ((Math.round(el.r) % 4) + 4) % 4,
          });
          if (el.f) out.f = 1;
      }
      return valido(out) ? out : null;
    };

    // How much an element draws (src/schizzi/elementi.ts, `pesoDi`).
    const pesoDi = (el) => {
      if (el.t === 's') return hasOwn(view.simboli, el.n) ? view.simboli[el.n].parti.length : 1;
      if (el.t === 'a') return el.v ? view.pesi.a + 1 : view.pesi.a;
      return hasOwn(view.pesi, el.t) ? view.pesi[el.t] : 1;
    };

    // The points that must stay on the sheet when the element moves (what the server checks), each with
    // how far past the edge it may go: the line of a dimension, 2 units (lineaNelFoglio).
    const anchorsOf = (el) => {
      if (el.t === 'p') return [[...forme.puntiDi(el.d)[0], 0]];
      if (el.t === 'a' || el.t === 'q') {
        const ends = [
          [el.x1, el.y1, 0],
          [el.x2, el.y2, 0],
        ];
        if (el.t !== 'q' || !el.o) return ends;
        const lungo = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
        const nx = -(el.y2 - el.y1) / lungo;
        const ny = (el.x2 - el.x1) / lungo;
        return ends.concat([
          [el.x1 + nx * el.o, el.y1 + ny * el.o, 2],
          [el.x2 + nx * el.o, el.y2 + ny * el.o, 2],
        ]);
      }
      return [[el.x, el.y, 0]];
    };

    // The move (dx, dy) in whole units cut so that every anchor of every element stays on the sheet.
    const limitMove = (elements, dx, dy) => {
      let [lx, hx, ly, hy] = [-Infinity, Infinity, -Infinity, Infinity];
      elements.forEach((el) =>
        anchorsOf(el).forEach(([x, y, slack]) => {
          lx = Math.max(lx, Math.ceil(-slack - x));
          hx = Math.min(hx, Math.floor(W + slack - x));
          ly = Math.max(ly, Math.ceil(-slack - y));
          hy = Math.min(hy, Math.floor(H + slack - y));
        }),
      );
      return [
        Math.min(hx, Math.max(lx, Math.round(dx))),
        Math.min(hy, Math.max(ly, Math.round(dy))),
      ];
    };

    // The element moved by (dx, dy) whole units — a path moves its start, its segments are relative.
    const moved = (el, dx, dy) => {
      if (el.t === 'p') {
        const [x, y] = forme.puntiDi(el.d)[0];
        return { ...el, d: el.d.replace(/^M-?\d+ -?\d+/, `M${x + dx} ${y + dy}`) };
      }
      if (el.t === 'a' || el.t === 'q') {
        return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
      }
      return { ...el, x: el.x + dx, y: el.y + dy };
    };

    // The points an element offers to snapping: the vertices of a short path (only the ends of a long
    // one — a handwritten note is not a field of targets), the centre and quadrants of an ellipse, both
    // ends of an arrow or dimension, the corners and centre of a symbol. Texts and freehand offer none.
    const snapPointsOf = (el) => {
      switch (el.t) {
        case 'p': {
          const punti = forme.puntiDi(el.d);
          return punti.length <= 13 ? punti : [punti[0], punti[punti.length - 1]];
        }
        case 'e':
          return [
            [el.x, el.y],
            [el.x - el.rx, el.y],
            [el.x + el.rx, el.y],
            [el.x, el.y - el.ry],
            [el.x, el.y + el.ry],
          ];
        case 'a':
        case 'q':
          return [
            [el.x1, el.y1],
            [el.x2, el.y2],
          ];
        case 's':
          return [
            [el.x, el.y],
            ...[
              [0, 0],
              [100, 0],
              [100, 100],
              [0, 100],
            ].map(([u, v]) => forme.puntoSimbolo(el, u, v)),
          ];
        default:
          return [];
      }
    };

    return Object.freeze({
      offsetInside,
      pulito,
      valido,
      normalizza,
      pesoDi,
      anchorsOf,
      limitMove,
      moved,
      snapPointsOf,
    });
  };
})();
