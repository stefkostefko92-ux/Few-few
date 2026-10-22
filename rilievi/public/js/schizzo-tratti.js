// What the sketch sheets share (schizzi.js — the previews, schizzo-editor.js — the editor): the sizes
// and colours from the server (`schizzi-vista`, the same the print and the PDF use, src/schizzi/model.ts),
// painting an element on a canvas, the SVG of a sheet (as views/schede/_schizzo.ejs), turning the points
// of a stroke into the paths the server accepts, and the eraser's hit test.
(() => {
  'use strict';

  const dataEl = document.getElementById('schizzi-vista');
  if (!dataEl) return;
  const view = Object.freeze(JSON.parse(dataEl.textContent));

  const paths = new WeakMap();
  const pathOf = (el) => {
    if (!paths.has(el)) paths.set(el, new Path2D(el.d));
    return paths.get(el);
  };
  const fontOf = (el) => `500 ${view.corpi[el.s]}px "Fira Sans", sans-serif`;

  const paint = (target, el) => {
    if (el.t === 'x') {
      target.font = fontOf(el);
      target.textBaseline = 'alphabetic';
      target.fillStyle = view.colori[el.c];
      target.fillText(el.v, el.x, el.y);
      return;
    }
    target.lineCap = 'round';
    target.lineJoin = 'round';
    target.lineWidth = view.spessori[el.s];
    target.strokeStyle = view.colori[el.c];
    if (el.raw) {
      // The pen stroke still being drawn: the raw points, simplified only when the stroke ends.
      target.beginPath();
      target.moveTo(el.raw[0].x, el.raw[0].y);
      el.raw.forEach((p) => target.lineTo(p.x, p.y));
      target.stroke();
    } else {
      target.stroke(pathOf(el));
    }
  };

  // A small cross where the next text goes.
  const paintMark = (target, p, colour) => {
    target.lineWidth = 3;
    target.strokeStyle = view.colori[colour];
    target.beginPath();
    target.moveTo(p.x - 14, p.y);
    target.lineTo(p.x + 14, p.y);
    target.moveTo(p.x, p.y - 14);
    target.lineTo(p.x, p.y + 14);
    target.stroke();
  };

  // The point of a pointer event on the canvas, in whole sheet units, inside the sheet.
  const pointOn = (canvas, event) => {
    const box = canvas.getBoundingClientRect();
    const x = Math.round(((event.clientX - box.left) / box.width) * view.larghezza);
    const y = Math.round(((event.clientY - box.top) / box.height) * view.altezza);
    return {
      x: Math.min(view.larghezza, Math.max(0, x)),
      y: Math.min(view.altezza, Math.max(0, y)),
    };
  };

  // The text as the server keeps it: no control or invisible characters, single spaces, the limit.
  const cleanText = (value) =>
    value
      .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, view.maxTesto);

  const NS = 'http://www.w3.org/2000/svg';
  const svgOf = (sheet, label) => {
    const svg = document.createElementNS(NS, 'svg');
    const child = (tag, attrs) => {
      const node = document.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
      svg.appendChild(node);
      return node;
    };
    svg.setAttribute('class', 'schizzo');
    svg.setAttribute('viewBox', `0 0 ${view.larghezza} ${view.altezza}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
    child('rect', { width: view.larghezza, height: view.altezza, fill: '#ffffff' });
    child('path', { d: view.griglia, stroke: view.coloreGriglia, 'stroke-width': 1, fill: 'none' });
    sheet.e.forEach((el) => {
      if (el.t === 'p') {
        child('path', {
          d: el.d,
          stroke: view.colori[el.c],
          'stroke-width': view.spessori[el.s],
          fill: 'none',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        });
      } else {
        child('text', {
          x: el.x,
          y: el.y,
          fill: view.colori[el.c],
          'font-size': view.corpi[el.s],
          'font-family': 'Fira Sans, sans-serif',
          'font-weight': 500,
        }).textContent = el.v;
      }
    });
    return svg;
  };

  // Ramer–Douglas–Peucker: the points that keep the shape of the stroke within `eps` sheet units.
  const simplify = (pts, eps) => {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const dx = pts[b].x - pts[a].x;
      const dy = pts[b].y - pts[a].y;
      const length = Math.hypot(dx, dy);
      let far = 0;
      let index = -1;
      for (let i = a + 1; i < b; i += 1) {
        const px = pts[i].x - pts[a].x;
        const py = pts[i].y - pts[a].y;
        const d = length ? Math.abs(dx * py - dy * px) / length : Math.hypot(px, py);
        if (d > far) {
          far = d;
          index = i;
        }
      }
      if (far > eps) {
        keep[index] = 1;
        stack.push([a, index], [index, b]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  };

  // The paths of a stroke: "M x y" and relative "l dx dy", at most `maxSegmenti` segments each (the
  // server's limit) — each next one starts where the last one ended. A dot is "l0 0".
  const strokesOf = (pts) => {
    const strokes = [];
    for (let from = 0; from === 0 || from < pts.length - 1; from += view.maxSegmenti) {
      const part = pts.slice(from, from + view.maxSegmenti + 1);
      let d = `M${part[0].x} ${part[0].y}`;
      if (part.length === 1) d += 'l0 0';
      for (let i = 1; i < part.length; i += 1) {
        d += `l${part[i].x - part[i - 1].x} ${part[i].y - part[i - 1].y}`;
      }
      strokes.push(d);
    }
    return strokes;
  };

  // A straight line from `a` to `b`, or the rectangle they span (closed with "z").
  const shapeOf = (kind, a, b) => {
    if (kind === 'linea') return `M${a.x} ${a.y}l${b.x - a.x} ${b.y - a.y}`;
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    return `M${Math.min(a.x, b.x)} ${Math.min(a.y, b.y)}l${w} 0l0 ${h}l${-w} 0z`;
  };

  // Does the eraser at `p` (radius in sheet units) touch the element? Paths by their stroke, texts by
  // their box. The probe keeps the identity transform: everything is in sheet units.
  const probe = document.createElement('canvas').getContext('2d');
  const hitOf = (el, p, radius) => {
    if (el.t === 'p') {
      probe.lineCap = 'round';
      probe.lineJoin = 'round';
      probe.lineWidth = Math.max(view.spessori[el.s], radius * 2);
      return probe.isPointInStroke(pathOf(el), p.x, p.y);
    }
    probe.font = fontOf(el);
    const width = probe.measureText(el.v).width;
    const height = view.corpi[el.s];
    return (
      p.x >= el.x - radius &&
      p.x <= el.x + width + radius &&
      p.y >= el.y - height - radius &&
      p.y <= el.y + height * 0.3 + radius
    );
  };

  window.rilieviSchizzo = Object.freeze({
    view,
    paint,
    paintMark,
    pointOn,
    cleanText,
    svgOf,
    simplify,
    strokesOf,
    shapeOf,
    hitOf,
  });
})();
