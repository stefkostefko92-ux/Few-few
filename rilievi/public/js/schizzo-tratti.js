// What the sketch sheets share (schizzi.js — the previews, the editor's scripts): the sizes and colours
// from the server (`schizzi-vista`, the same the print and the PDF use, src/schizzi/model.ts), the
// geometry (schizzo-forme.js), painting an element on a canvas (as the SVG of a sheet,
// views/schede/_schizzo.ejs, schizzi.js) — from the same primitives —, the hit test of the eraser and of
// the selection, the box of an element, and what the server takes (fits).
(() => {
  'use strict';

  const dataEl = document.getElementById('schizzi-vista');
  if (!dataEl || typeof window.rilieviForme !== 'function') return;
  const view = Object.freeze(JSON.parse(dataEl.textContent));
  const forme = window.rilieviForme(view);

  // Elements never change (a change is a new object): their primitives and paths are cached.
  const cache = new WeakMap();
  const primitivesOf = (el) => {
    if (!cache.has(el)) cache.set(el, forme.primitivesOf(el));
    return cache.get(el);
  };
  const paths = new WeakMap();
  const pathOf = (p) => {
    if (!paths.has(p)) paths.set(p, new Path2D(p.d));
    return paths.get(p);
  };
  const ellipseOf = (p) => {
    if (!paths.has(p)) {
      const path = new Path2D();
      path.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
      paths.set(p, path);
    }
    return paths.get(p);
  };
  const fontOf = (z) => `500 ${z}px "Fira Sans", sans-serif`;
  const ALIGN = { start: 'left', middle: 'center', end: 'right' };

  const paintPrimitive = (target, p) => {
    if (p.p === 't') {
      target.font = fontOf(p.z);
      target.textBaseline = 'alphabetic';
      target.textAlign = ALIGN[p.h];
      target.fillStyle = p.c;
      if (p.a) {
        target.save();
        target.translate(p.x, p.y);
        target.rotate((p.a * Math.PI) / 180);
        target.fillText(p.v, 0, 0);
        target.restore();
      } else {
        target.fillText(p.v, p.x, p.y);
      }
      return;
    }
    if (p.p === 'f') {
      target.fillStyle = p.c;
      target.fill(pathOf(p));
      return;
    }
    target.lineCap = 'round';
    target.lineJoin = 'round';
    target.lineWidth = p.w;
    target.strokeStyle = p.c;
    target.setLineDash(p.k || []);
    target.stroke(p.p === 'l' ? pathOf(p) : ellipseOf(p));
    target.setLineDash([]);
  };

  const paint = (target, el) => {
    if (el.raw) {
      // The pen stroke still being drawn: the raw points, simplified only when the stroke ends.
      target.lineCap = 'round';
      target.lineJoin = 'round';
      target.lineWidth = view.spessori[el.s];
      target.strokeStyle = view.colori[el.c];
      target.setLineDash(el.k ? view.tratteggi[el.s] : []);
      target.beginPath();
      target.moveTo(el.raw[0].x, el.raw[0].y);
      el.raw.forEach((q) => target.lineTo(q.x, q.y));
      target.stroke();
      target.setLineDash([]);
      return;
    }
    primitivesOf(el).forEach((p) => paintPrimitive(target, p));
  };

  // White paper with the faint grid, in sheet units (the target is already scaled to them).
  const grid = new Path2D(view.griglia);
  const paintPaper = (target) => {
    target.fillStyle = '#ffffff';
    target.fillRect(0, 0, view.larghezza, view.altezza);
    target.lineWidth = 1;
    target.strokeStyle = view.coloreGriglia;
    target.stroke(grid);
  };

  // The biggest sheet that fits the free space of `area` (inside its padding), sharp on the screen's
  // pixels: sizes the canvases (the first one is on the page) and gives device pixels per sheet unit.
  const fitCanvases = (area, canvases) => {
    const style = getComputedStyle(area);
    const free = (size, a, b) => size - parseFloat(style[a]) - parseFloat(style[b]);
    const room = free(area.clientWidth, 'paddingLeft', 'paddingRight');
    const tall = free(area.clientHeight, 'paddingTop', 'paddingBottom');
    const ratio = view.altezza / view.larghezza;
    const width = Math.max(1, Math.min(room, tall / ratio));
    // Two device pixels per CSS pixel are sharp enough; three would only cost memory on a phone.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvases[0].style.width = `${Math.floor(width)}px`;
    canvases[0].style.height = `${Math.floor(width * ratio)}px`;
    canvases.forEach((c) => {
      c.width = Math.round(width * dpr);
      c.height = Math.round(width * ratio * dpr);
    });
    return canvases[0].width / view.larghezza;
  };

  // A small cross where the next text goes — 8 CSS pixels whatever the zoom (`px`: units per pixel).
  const paintMark = (target, p, colour, px = 1) => {
    target.lineWidth = 2 * px;
    target.strokeStyle = view.colori[colour];
    target.beginPath();
    target.moveTo(p.x - 8 * px, p.y);
    target.lineTo(p.x + 8 * px, p.y);
    target.moveTo(p.x, p.y - 8 * px);
    target.lineTo(p.x, p.y + 8 * px);
    target.stroke();
  };

  // The box of a text in its own frame (before its rotation): left, right, top and bottom of the glyphs.
  const probe = document.createElement('canvas').getContext('2d');
  const textBox = (p) => {
    probe.font = fontOf(p.z);
    const width = probe.measureText(p.v).width;
    const left = p.h === 'start' ? 0 : p.h === 'middle' ? -width / 2 : -width;
    return { left, right: left + width, top: -p.z, bottom: p.z * 0.3 };
  };
  // A point in the text's own frame: moved to its anchor, turned back by its angle.
  const inTextFrame = (p, q) => {
    const rad = (-p.a * Math.PI) / 180;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    return {
      x: dx * Math.cos(rad) - dy * Math.sin(rad),
      y: dx * Math.sin(rad) + dy * Math.cos(rad),
    };
  };

  // Does a point (radius in sheet units) touch the element? Lines by their stroke, arrowheads by their
  // area, texts by their box. The probe keeps the identity transform: everything is in sheet units.
  const hitOf = (el, q, radius) => {
    // The cached box first: most elements are far from the pointer.
    const box = boundsOf(el);
    if (
      q.x < box.x0 - radius ||
      q.x > box.x1 + radius ||
      q.y < box.y0 - radius ||
      q.y > box.y1 + radius
    )
      return false;
    return primitivesOf(el).some((p) => {
      if (p.p === 't') {
        const box = textBox(p);
        const r = inTextFrame(p, q);
        return (
          r.x >= box.left - radius &&
          r.x <= box.right + radius &&
          r.y >= box.top - radius &&
          r.y <= box.bottom + radius
        );
      }
      if (p.p === 'f') return probe.isPointInPath(pathOf(p), q.x, q.y);
      probe.lineCap = 'round';
      probe.lineJoin = 'round';
      probe.lineWidth = Math.max(p.w, radius * 2);
      return probe.isPointInStroke(p.p === 'l' ? pathOf(p) : ellipseOf(p), q.x, q.y);
    });
  };

  // The box around everything the element draws (selection frame, box selection), in sheet units.
  const pointsOfPath = (d) =>
    /l/.test(d)
      ? forme.puntiDi(d)
      : Array.from(d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g), (m) => [+m[1], +m[2]]);
  let boxes = new WeakMap();
  const boundsOf = (el) => {
    if (!boxes.has(el)) boxes.set(el, measure(el));
    return boxes.get(el);
  };
  // A font that arrives later measures the texts again.
  const resetMeasures = () => {
    boxes = new WeakMap();
  };
  const measure = (el) => {
    const xs = [];
    const ys = [];
    let pad = 0;
    primitivesOf(el).forEach((p) => {
      if (p.p === 'l' || p.p === 'f') {
        pointsOfPath(p.d).forEach(([x, y]) => {
          xs.push(x);
          ys.push(y);
        });
        if (p.p === 'l') pad = Math.max(pad, p.w / 2);
      } else if (p.p === 'e') {
        xs.push(p.x - p.rx, p.x + p.rx);
        ys.push(p.y - p.ry, p.y + p.ry);
        pad = Math.max(pad, p.w / 2);
      } else {
        const box = textBox(p);
        const rad = (p.a * Math.PI) / 180;
        [
          [box.left, box.top],
          [box.right, box.top],
          [box.right, box.bottom],
          [box.left, box.bottom],
        ].forEach(([x, y]) => {
          xs.push(p.x + x * Math.cos(rad) - y * Math.sin(rad));
          ys.push(p.y + x * Math.sin(rad) + y * Math.cos(rad));
        });
      }
    });
    return {
      x0: Math.min(...xs) - pad,
      y0: Math.min(...ys) - pad,
      x1: Math.max(...xs) + pad,
      y1: Math.max(...ys) + pad,
    };
  };

  // Does the sheet still fit what the server takes: the elements, the JSON, and its size exactly as the
  // form sends it (application/x-www-form-urlencoded — ! ' ( ) ~ are 3 bytes there, not 1).
  const fits = (sheet) => {
    const json = JSON.stringify({ e: sheet });
    return (
      sheet.length <= view.maxElementi &&
      json.length <= view.maxJson &&
      new URLSearchParams({ schizzo: json }).toString().length <= view.maxCodificato
    );
  };

  window.rilieviSchizzo = Object.freeze({
    view,
    forme,
    primitivesOf,
    paint,
    paintPaper,
    paintMark,
    fitCanvases,
    hitOf,
    boundsOf,
    resetMeasures,
    fits,
  });
})();
