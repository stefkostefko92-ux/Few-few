// Annotations on the photos of a scheda (the owner, 12 November 2026 — point C5), on the page of the form,
// where the sketch editor is: "Annota" on a ready photo opens the editor full screen with the photo under
// the sheet (whole and centred — the place the server gives it, src/allegati/annotazioni.ts); "Fatto" sends
// the sheet on its own (fetch — the form of the scheda stays open with what is written in it) and the tile
// shows the drawing over the photo. The buttons are in the gallery for the people who write; without this
// file (or on the page of the scheda, without the editor) they stay hidden.
(() => {
  'use strict';

  const shared = window.rilieviSchizzo;
  const editor = document.querySelector('[data-schizzo-editor]');
  const testiEl = document.getElementById('annotazioni-testi');
  const csrf = document.body.dataset.bozzeCsrf;
  if (!shared || !editor || !testiEl || !csrf) return;
  let testi = {};
  try {
    testi = JSON.parse(testiEl.textContent || '{}');
  } catch {
    return;
  }
  const { view, primitivesOf } = shared;
  document.documentElement.classList.add('annota');

  // The window of the sheet a 4:3 tile shows — as viewBoxAnnotazioni(…, true) on the server.
  const finestra = (w0, h0) => {
    const W = view.larghezza;
    const H = view.altezza;
    let f = { x: 0, y: 0, w: W, h: H };
    if (w0 > 0 && h0 > 0) {
      if (w0 * H >= h0 * W) {
        const h = (W * h0) / w0;
        f = { x: 0, y: (H - h) / 2, w: W, h };
      } else {
        const w = (H * w0) / h0;
        f = { x: (W - w) / 2, y: 0, w, h: H };
      }
    }
    const a = 4 / 3;
    if (f.w / f.h > a) {
      const w = f.h * a;
      return { x: f.x + (f.w - w) / 2, y: f.y, w, h: f.h };
    }
    const h = f.w / a;
    return { x: f.x, y: f.y + (f.h - h) / 2, w: f.w, h };
  };

  // The overlay of the tile — the same SVG as views/schede/_annotazioni.ejs, from the same primitives.
  const NS = 'http://www.w3.org/2000/svg';
  const overlay = (foglio, w0, h0) => {
    const svg = document.createElementNS(NS, 'svg');
    const f = finestra(w0, h0);
    svg.setAttribute('class', 'annotazioni');
    svg.setAttribute('viewBox', [f.x, f.y, f.w, f.h].map((n) => Number(n.toFixed(3))).join(' '));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const child = (tag, attrs) => {
      const node = document.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
      svg.appendChild(node);
      return node;
    };
    const stroke = (p) => ({
      stroke: p.c,
      'stroke-width': p.w,
      fill: 'none',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      ...(p.k ? { 'stroke-dasharray': `${p.k[0]} ${p.k[1]}` } : {}),
    });
    foglio.e.flatMap(primitivesOf).forEach((p) => {
      if (p.p === 'l') child('path', { d: p.d, ...stroke(p) });
      else if (p.p === 'f') child('path', { d: p.d, fill: p.c });
      else if (p.p === 'e')
        child('ellipse', { cx: p.x, cy: p.y, rx: p.rx, ry: p.ry, ...stroke(p) });
      else
        child('text', {
          x: p.x,
          y: p.y,
          fill: p.c,
          'font-size': p.z,
          'font-family': 'Fira Sans, sans-serif',
          'font-weight': 500,
          ...(p.h !== 'start' ? { 'text-anchor': p.h } : {}),
          ...(p.a ? { transform: `rotate(${p.a} ${p.x} ${p.y})` } : {}),
        }).textContent = p.v;
    });
    return svg;
  };

  const salva = async (tile, foglio) => {
    const button = tile.querySelector('[data-annota]');
    const etichetta = button && button.querySelector('span');
    const body = new URLSearchParams({ _csrf: csrf, foglio: JSON.stringify(foglio) });
    let ok = false;
    try {
      const res = await fetch(`${tile.dataset.foto}/annotazioni`, {
        method: 'POST',
        body,
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    const stato = tile.querySelector('[data-annota-stato]') || document.createElement('p');
    stato.className = 'galleria__info';
    stato.setAttribute('role', 'status');
    stato.dataset.annotaStato = '';
    if (!stato.isConnected) tile.append(stato);
    if (!ok) {
      stato.textContent = testi.errore || '';
      return;
    }
    const vuoto = foglio.e.length === 0;
    tile.dataset.annotazioni = vuoto ? '' : JSON.stringify(foglio);
    const media = tile.querySelector('.galleria__media');
    media?.querySelector('.annotazioni')?.remove();
    if (!vuoto && media)
      media.append(overlay(foglio, Number(tile.dataset.larghezza), Number(tile.dataset.altezza)));
    if (etichetta) etichetta.textContent = vuoto ? testi.annota : testi.modifica;
    stato.textContent = vuoto ? testi.tolte : testi.salvate;
  };

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-annota]') : null;
    const tile = button && button.closest('[data-foto]');
    if (!tile) return;
    button.disabled = true;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      button.disabled = false;
      let foglio = { e: [] };
      try {
        if (tile.dataset.annotazioni) foglio = JSON.parse(tile.dataset.annotazioni);
      } catch {
        foglio = { e: [] };
      }
      document.dispatchEvent(
        new CustomEvent('rilievi:schizzo-apri', {
          detail: {
            foglio,
            n: 1,
            titolo: testi.titolo,
            sfondo: img,
            chiuso: (sheet) => {
              shared.sfondo.immagine = null;
              if (sheet) salva(tile, sheet);
              button.focus();
            },
          },
        }),
      );
    };
    img.onerror = () => {
      button.disabled = false;
    };
    img.src = tile.dataset.foto;
  });
})();
