// The geometry of the sketch elements in the browser — the same expansion into drawing primitives as
// src/schizzi/forme.ts (a unit test runs this file and compares the output). Pure functions of the sheet
// sizes and colours the server sends (`schizzi-vista`); no DOM; the rules of the elements (what the
// server takes, moving, snapping) are in schizzo-regole.js. Primitives: `l` stroked path, `f` filled
// path (arrowheads), `e` ellipse, `t` text (size z, angle a, anchor h); numbers rounded to 0.1.
(() => {
  'use strict';

  window.rilieviForme = (view) => {
    const r1 = (v) => Math.round(v * 10) / 10;
    const linea = (punti, chiusa = false) =>
      `M${punti.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}${chiusa ? 'Z' : ''}`;
    const dashOf = (el) => (el.k ? view.tratteggi[el.s] : null);

    // The absolute points of a path of the sheet ("M x y" and relative "l").
    const puntiDi = (d) => {
      const inizio = /^M(-?\d+) (-?\d+)/.exec(d);
      if (!inizio) return [];
      let x = Number(inizio[1]);
      let y = Number(inizio[2]);
      const punti = [[x, y]];
      for (const m of d.slice(inizio[0].length).matchAll(/l(-?\d+) (-?\d+)/g)) {
        x += Number(m[1]);
        y += Number(m[2]);
        punti.push([x, y]);
      }
      return punti;
    };

    const punta = (x, y, ux, uy, s, c) => {
      const [lungo, mezzo] = view.frecce[s];
      const bx = x - ux * lungo;
      const by = y - uy * lungo;
      return {
        p: 'f',
        d: linea(
          [
            [x, y],
            [bx - uy * mezzo, by + ux * mezzo],
            [bx + uy * mezzo, by - ux * mezzo],
          ],
          true,
        ),
        c,
      };
    };

    const angoloLettura = (ux, uy) => {
      let a = (Math.atan2(uy, ux) * 180) / Math.PI;
      if (a >= 90 - 1e-9) a -= 180;
      else if (a < -90 - 1e-9) a += 180;
      return a;
    };

    const quota = (el) => {
      const c = view.colori[el.c];
      const w = view.spessori[1];
      const [lungoFreccia] = view.frecce[el.s];
      const q = view.quota;
      const lungo = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
      const ux = (el.x2 - el.x1) / lungo;
      const uy = (el.y2 - el.y1) / lungo;
      const nx = -uy;
      const ny = ux;
      const raggio = el.m === 'r';
      const o = raggio ? 0 : el.o;
      const a = [el.x1 + nx * o, el.y1 + ny * o];
      const b = [el.x2 + nx * o, el.y2 + ny * o];
      const out = [];
      if (Math.abs(o) > q.stacco) {
        const sg = Math.sign(o);
        for (const [px, py, qx, qy] of [
          [el.x1, el.y1, a[0], a[1]],
          [el.x2, el.y2, b[0], b[1]],
        ]) {
          out.push({
            p: 'l',
            d: linea([
              [px + nx * sg * q.stacco, py + ny * sg * q.stacco],
              [qx + nx * sg * q.oltre, qy + ny * sg * q.oltre],
            ]),
            w,
            c,
            k: null,
          });
        }
      }
      if (lungo < (raggio ? 1 : 2) * lungoFreccia + 16) {
        // A short dimension: the arrows outside, pointing at the points; the line runs past both ends.
        const oltre = lungoFreccia + 10;
        const da = raggio ? a : [a[0] - ux * oltre, a[1] - uy * oltre];
        out.push({ p: 'l', d: linea([da, [b[0] + ux * oltre, b[1] + uy * oltre]]), w, c, k: null });
        if (!raggio) out.push(punta(a[0], a[1], ux, uy, el.s, c));
        out.push(punta(b[0], b[1], -ux, -uy, el.s, c));
      } else {
        const accorcia = lungoFreccia / 2;
        const da = raggio ? a : [a[0] + ux * accorcia, a[1] + uy * accorcia];
        const fino = [b[0] - ux * accorcia, b[1] - uy * accorcia];
        out.push({ p: 'l', d: linea([da, fino]), w, c, k: null });
        if (!raggio) out.push(punta(a[0], a[1], -ux, -uy, el.s, c));
        out.push(punta(b[0], b[1], ux, uy, el.s, c));
      }
      const angolo = angoloLettura(ux, uy);
      const rad = (angolo * Math.PI) / 180;
      const mx = (a[0] + b[0]) / 2 + Math.sin(rad) * q.testo;
      const my = (a[1] + b[1]) / 2 - Math.cos(rad) * q.testo;
      out.push({
        p: 't',
        x: r1(mx),
        y: r1(my),
        v: el.v,
        z: view.corpi[el.s],
        c,
        a: r1(angolo),
        h: 'middle',
      });
      return out;
    };

    const freccia = (el) => {
      const c = view.colori[el.c];
      const lungo = Math.hypot(el.x1 - el.x2, el.y1 - el.y2);
      const ux = (el.x1 - el.x2) / lungo;
      const uy = (el.y1 - el.y2) / lungo;
      const accorcia = view.frecce[el.s][0] / 2;
      const out = [];
      // A very short arrow is only its head — the line would come out behind the tail.
      if (lungo > accorcia) {
        out.push({
          p: 'l',
          d: linea([
            [el.x1 - ux * accorcia, el.y1 - uy * accorcia],
            [el.x2, el.y2],
          ]),
          w: view.spessori[el.v ? 1 : el.s],
          c,
          k: dashOf(el),
        });
      }
      out.push(punta(el.x1, el.y1, ux, uy, el.s, c));
      if (el.v) {
        const z = view.corpi[el.s];
        const destra = el.x2 >= el.x1;
        out.push({
          p: 't',
          x: el.x2 + (destra ? 10 : -10),
          y: r1(el.y2 + z * 0.35),
          v: el.v,
          z,
          c,
          a: 0,
          h: destra ? 'start' : 'end',
        });
      }
      return out;
    };

    // A point of the symbol's 100 x 100 box on the sheet: stretched to w x h, turned r quarters.
    const puntoSimbolo = (el, u, v) => {
      const lx = (el.f ? 0.5 - u / 100 : u / 100 - 0.5) * el.w;
      const ly = (v / 100 - 0.5) * el.h;
      const [gx, gy] =
        el.r === 1 ? [-ly, lx] : el.r === 2 ? [-lx, -ly] : el.r === 3 ? [ly, -lx] : [lx, ly];
      return [el.x + gx, el.y + gy];
    };

    const simbolo = (el) => {
      const c = view.colori[el.c];
      const w = view.spessori[el.s];
      const k = dashOf(el);
      return view.simboli[el.n].parti.map((parte) => {
        if (parte.d) {
          const punti = puntiDi(parte.d).map(([u, v]) => puntoSimbolo(el, u, v));
          return { p: 'l', d: linea(punti, parte.d.endsWith('z')), w, c, k };
        }
        const [cx, cy, rx, ry] = parte.e;
        const [x, y] = puntoSimbolo(el, cx, cy);
        const ex = (rx / 100) * el.w;
        const ey = (ry / 100) * el.h;
        const dritto = el.r % 2 === 0;
        return {
          p: 'e',
          x: r1(x),
          y: r1(y),
          rx: r1(dritto ? ex : ey),
          ry: r1(dritto ? ey : ex),
          w,
          c,
          k: parte.solido ? null : k,
        };
      });
    };

    const primitivesOf = (el) => {
      const c = view.colori[el.c];
      switch (el.t) {
        case 'p':
          return [{ p: 'l', d: el.d, w: view.spessori[el.s], c, k: dashOf(el) }];
        case 'x':
          return [{ p: 't', x: el.x, y: el.y, v: el.v, z: view.corpi[el.s], c, a: 0, h: 'start' }];
        case 'e':
          return [
            {
              p: 'e',
              x: el.x,
              y: el.y,
              rx: el.rx,
              ry: el.ry,
              w: view.spessori[el.s],
              c,
              k: dashOf(el),
            },
          ];
        case 'a':
          return freccia(el);
        case 'q':
          return quota(el);
        case 's':
          return simbolo(el);
        default:
          return [];
      }
    };

    return Object.freeze({ primitivesOf, puntiDi, puntoSimbolo, linea });
  };
})();
