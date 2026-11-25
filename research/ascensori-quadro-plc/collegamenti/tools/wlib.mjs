// Libreria per le tavole di collegamento (schemi elettrici monocromatici, stile CAD).
// Foglio A3 orizzontale 1587×1122 px. Zone: colonne 1–16 (alto/basso), righe A–H (sinistra/destra).
// Simboli secondo IEC 60617 (semplificati). Designazioni: EN 81346 (-QS1, -KM1, -X1:1 …).
import { Sheet } from '../../tools/lib.mjs';

export const W = 1587;
export const H = 1122;
export const INK = '#111111';
export const GRID = '#9ca3af';
export const MUTE = '#4b5563';
export const FONT = 'DejaVu Sans, Arial, sans-serif';

// Area di disegno utile (dentro cornice e zone): x 50…1540, y 50…1000. Il cartiglio sta in basso a destra.
export const AREA = { x0: 50, y0: 50, x1: 1540, y1: 1000 };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class WSheet extends Sheet {
  // n = 'E04', total = 19, title = 'Catena di sicurezza — trazione', sub = riga sotto il titolo
  constructor({ n, total = 19, title, sub = '', rev = 'A' }) {
    super({ n, title, subtitle: sub, rev });
    this.total = total;
  }

  // --- primitive sottili ---
  ln(x1, y1, x2, y2, { w = 1, dash = '' } = {}) {
    return this.line(x1, y1, x2, y2, { c: INK, w, dash });
  }
  pl(pts, { w = 1, dash = '' } = {}) {
    return this.poly(pts, { c: INK, w, dash });
  }
  bx(x, y, w, h, { w: sw = 1, dash = '', fill = 'none' } = {}) {
    return this.rect(x, y, w, h, { c: INK, sw, dash, fill });
  }
  tx(x, y, s, { size = 9, anchor = 'start', weight = 400, rotate = 0, c = INK, italic = false } = {}) {
    return this.text(x, y, s, { size, anchor, weight, rotate, c, italic });
  }
  junction(x, y) {
    return this.dot(x, y, INK, 2.6);
  }

  // Etichetta di filo: numero sopra il tratto (orizzontale) o a lato (verticale)
  wire(pts, label = '', { w = 1, pos = 0.5, side = 'up', size = 8, dash = '' } = {}) {
    this.pl(pts, { w, dash });
    if (!label) return this;
    // trova il tratto più lungo
    let best = 0;
    let bi = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      if (d > best) {
        best = d;
        bi = i;
      }
    }
    const [x1, y1] = pts[bi];
    const [x2, y2] = pts[bi + 1];
    const mx = x1 + (x2 - x1) * pos;
    const my = y1 + (y2 - y1) * pos;
    if (Math.abs(y2 - y1) < 1) this.tx(mx, my + (side === 'up' ? -3 : 10), label, { size, anchor: 'middle' });
    else this.tx(mx + (side === 'up' ? -4 : 4), my, label, { size, anchor: side === 'up' ? 'end' : 'start' });
    return this;
  }

  // Riferimento incrociato (foglio/zona)
  xref(x, y, s, { anchor = 'start' } = {}) {
    this.tx(x, y, s, { size: 7.5, anchor, c: MUTE, italic: true });
    return this;
  }

  render() {
    const frame = `
<rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="${INK}" stroke-width="1.6"/>
<rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" stroke="${INK}" stroke-width="0.8"/>`;
    // zone
    let zones = '';
    const cw = (W - 44) / 16;
    for (let i = 0; i < 16; i++) {
      const x = 22 + i * cw;
      zones += `<line x1="${x}" y1="6" x2="${x}" y2="22" stroke="${INK}" stroke-width="0.6"/><line x1="${x}" y1="${H - 22}" x2="${x}" y2="${H - 6}" stroke="${INK}" stroke-width="0.6"/>`;
      zones += `<text x="${x + cw / 2}" y="18" font-size="9" text-anchor="middle" fill="${INK}">${i + 1}</text><text x="${x + cw / 2}" y="${H - 10}" font-size="9" text-anchor="middle" fill="${INK}">${i + 1}</text>`;
    }
    const rh = (H - 44) / 8;
    for (let j = 0; j < 8; j++) {
      const y = 22 + j * rh;
      const L = String.fromCharCode(65 + j);
      zones += `<line x1="6" y1="${y}" x2="22" y2="${y}" stroke="${INK}" stroke-width="0.6"/><line x1="${W - 22}" y1="${y}" x2="${W - 6}" y2="${y}" stroke="${INK}" stroke-width="0.6"/>`;
      zones += `<text x="14" y="${y + rh / 2 + 3}" font-size="9" text-anchor="middle" fill="${INK}">${L}</text><text x="${W - 14}" y="${y + rh / 2 + 3}" font-size="9" text-anchor="middle" fill="${INK}">${L}</text>`;
    }
    // cartiglio
    const bw = 720;
    const bh = 78;
    const bx = W - 22 - bw;
    const by = H - 22 - bh;
    const tb = `
<g font-family="${FONT}" fill="${INK}">
<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#fff" stroke="${INK}" stroke-width="1.2"/>
<line x1="${bx}" y1="${by + 22}" x2="${bx + bw}" y2="${by + 22}" stroke="${INK}" stroke-width="0.7"/>
<line x1="${bx + 470}" y1="${by}" x2="${bx + 470}" y2="${by + bh}" stroke="${INK}" stroke-width="0.7"/>
<line x1="${bx + 470}" y1="${by + 40}" x2="${bx + bw}" y2="${by + 40}" stroke="${INK}" stroke-width="0.7"/>
<line x1="${bx + 590}" y1="${by + 22}" x2="${bx + 590}" y2="${by + 40}" stroke="${INK}" stroke-width="0.7"/>
<text x="${bx + 8}" y="${by + 15}" font-size="9.5" font-weight="700">Carbon Stealth VCC · Quadro di manovra a PLC per ascensori (esempio di riferimento)</text>
<text x="${bx + 8}" y="${by + 43}" font-size="12.5" font-weight="700">${esc(this.title)}</text>
<text x="${bx + 8}" y="${by + 58}" font-size="9" fill="${MUTE}">${esc(this.subtitle)}</text>
<text x="${bx + 8}" y="${by + 71}" font-size="7.5" fill="${MUTE}">EN 81-20:2020 · EN 60204-1 · IEC 60617 · EN 81346 — valori di esempio, da verificare dal progettista; non per costruzione</text>
<text x="${bx + 476}" y="${by + 15}" font-size="9" font-weight="700">Foglio ${esc(this.n)} / E${String(this.total - 1).padStart(2, '0')}</text>
<text x="${bx + 476}" y="${by + 35}" font-size="9">Rev. ${esc(this.rev)}</text>
<text x="${bx + 596}" y="${by + 35}" font-size="9">2026-10-07</text>
<text x="${bx + 476}" y="${by + 54}" font-size="8" fill="${MUTE}">Disegnato: Carbon Stealth</text>
<text x="${bx + 476}" y="${by + 68}" font-size="8" fill="${MUTE}">Verificato: — (progettista)</text>
</g>`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(this.title)}">
<title>${esc(this.n)} — ${esc(this.title)}</title>
<rect width="${W}" height="${H}" fill="#ffffff"/>
${frame}${zones}
<g font-family="${FONT}">
${this.parts.join('\n')}
</g>
${tb}
</svg>
`;
  }
}

// ---------------------------------------------------------------------------------------------
// SIMBOLI. Convenzione: (x, y) = punto di ingresso in alto (verticali) o a sinistra (orizzontali).
// ---------------------------------------------------------------------------------------------

// Morsetto: cerchietto con numero. dir 'r' = etichetta a destra, 'l' = a sinistra.
export function term(s, x, y, label = '', { dir = 'r', size = 8 } = {}) {
  s.circle(x, y, 3.4, { fill: '#fff', c: INK, sw: 1 });
  if (label) s.tx(dir === 'r' ? x + 7 : x - 7, y + 3, label, { size, anchor: dir === 'r' ? 'start' : 'end' });
}

// Morsettiera verticale: ritorna le coordinate di ogni morsetto.
// rows = [{ t:'1', sig:'L1' }, …]; name = '-X1'
export function strip(s, x, y, name, rows, { cell = 17, w = 46, sigw = 120, side = 'right' } = {}) {
  const pts = {};
  s.tx(x + w / 2, y - 6, name, { size: 10, anchor: 'middle', weight: 700 });
  rows.forEach((r, i) => {
    const yy = y + i * cell;
    s.bx(x, yy, w, cell, { w: 0.8 });
    s.tx(x + w / 2, yy + cell / 2 + 3, String(r.t), { size: 8.5, anchor: 'middle', weight: 700 });
    if (r.sig) s.tx(side === 'right' ? x + w + 6 : x - 6, yy + cell / 2 + 3, r.sig, { size: 8, anchor: side === 'right' ? 'start' : 'end' });
    pts[r.t] = { l: [x, yy + cell / 2], r: [x + w, yy + cell / 2] };
  });
  return pts;
}

export function gnd(s, x, y) {
  s.ln(x, y, x, y + 8);
  s.ln(x - 9, y + 8, x + 9, y + 8);
  s.ln(x - 6, y + 12, x + 6, y + 12);
  s.ln(x - 3, y + 16, x + 3, y + 16);
}

// Simbolo PE (conduttore di protezione) con scritta
export function pe(s, x, y) {
  gnd(s, x, y);
  s.tx(x + 12, y + 14, 'PE', { size: 8 });
}

// Contatto verticale NA/NC. Ritorna { top:[x,y], bot:[x,y] }.
export function vcont(s, x, y, { nc = false, h = 40, label = '', safety = false, terms = ['', ''] } = {}) {
  s.ln(x, y, x, y + 10);
  s.ln(x, y + h - 10, x, y + h);
  s.ln(x, y + h - 10, x - 9, y + 12);
  if (nc) s.ln(x - 13, y + 11, x - 5, y + 11);
  if (safety) s.circle(x + 5, y + h / 2, 2.4, { c: INK, sw: 0.9 });
  if (terms[0]) s.tx(x + 4, y + 8, terms[0], { size: 7 });
  if (terms[1]) s.tx(x + 4, y + h - 3, terms[1], { size: 7 });
  if (label) s.tx(x + 14, y + h / 2 + 3, label, { size: 8.5 });
  return { top: [x, y], bot: [x, y + h] };
}

// Contatto orizzontale (NA/NC) — per catene
export function hcont(s, x, y, { nc = true, w = 40, label = '', safety = true, sub = '' } = {}) {
  s.ln(x, y, x + 9, y);
  s.ln(x + w - 9, y, x + w, y);
  s.junction(x + 9, y);
  s.junction(x + w - 9, y);
  s.ln(x + 9, y, x + w - 11, y - 11);
  if (nc) s.ln(x + w - 15, y - 11, x + w - 10, y - 11);
  if (safety) s.circle(x + w / 2, y - 13, 2.4, { c: INK, sw: 0.9 });
  if (label) s.tx(x + w / 2, y + 13, label, { size: 8.5, anchor: 'middle', weight: 700 });
  if (sub) s.tx(x + w / 2, y + 23, sub, { size: 7, anchor: 'middle', c: MUTE });
  return { l: [x, y], r: [x + w, y] };
}

// Bobina (relè/contattore/elettrovalvola). Ritorna { top, bot }.
export function coil(s, x, y, { label = '', h = 28, w = 22, t1 = 'A1', t2 = 'A2', sub = '' } = {}) {
  s.ln(x, y, x, y + 8);
  s.bx(x - w / 2, y + 8, w, h);
  s.ln(x, y + 8 + h, x, y + 16 + h);
  s.tx(x + 4, y + 7, t1, { size: 7 });
  s.tx(x + 4, y + 16 + h + 8, t2, { size: 7 });
  if (label) s.tx(x + w / 2 + 6, y + 8 + h / 2 + 3, label, { size: 9, weight: 700 });
  if (sub) s.tx(x + w / 2 + 6, y + 8 + h / 2 + 14, sub, { size: 7.5, c: MUTE });
  return { top: [x, y], bot: [x, y + 16 + h] };
}

// Tre poli verticali affiancati (distanza d): sezionatore/interruttore/contattore.
// kind: 'disc' (sezionatore), 'brk' (magnetotermico), 'kon' (contattore)
export function pole3(s, x, y, { kind = 'kon', d = 18, h = 46, label = '', n = 3, ratings = '' } = {}) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const xx = x + i * d;
    s.ln(xx, y, xx, y + 10);
    s.ln(xx, y + h - 10, xx, y + h);
    s.ln(xx, y + h - 10, xx - 9, y + 12);
    if (kind === 'brk') {
      s.bx(xx - 12, y + h / 2 - 3, 7, 7, { w: 0.8 });
    }
    if (kind === 'disc') s.ln(xx - 12, y + 11, xx - 6, y + 11);
    pts.push({ top: [xx, y], bot: [xx, y + h] });
  }
  // asta di collegamento meccanico
  s.ln(x - 6, y + h / 2, x + (n - 1) * d - 6, y + h / 2, { dash: '3 2', w: 0.8 });
  if (kind === 'kon') s.ln(x - 6, y + h / 2, x - 6, y + h / 2); // simbolo semplificato
  if (label) s.tx(x + (n - 1) * d + 14, y + h / 2 - 2, label, { size: 9.5, weight: 700 });
  if (ratings) s.tx(x + (n - 1) * d + 14, y + h / 2 + 10, ratings, { size: 7.5, c: MUTE });
  return pts;
}

export function fuse(s, x, y, { label = '', h = 24, rating = '' } = {}) {
  s.ln(x, y, x, y + 4);
  s.bx(x - 4, y + 4, 8, h - 8);
  s.ln(x, y + 4, x, y + h - 4, { w: 0.7 });
  s.ln(x, y + h - 4, x, y + h);
  if (label) s.tx(x + 9, y + h / 2 - 1, label, { size: 8.5, weight: 700 });
  if (rating) s.tx(x + 9, y + h / 2 + 9, rating, { size: 7.5, c: MUTE });
  return { top: [x, y], bot: [x, y + h] };
}

export function motor(s, x, y, { label = 'M1', sub = '3~', r = 22, extra = '' } = {}) {
  s.circle(x, y, r, { c: INK, sw: 1.2, fill: '#fff' });
  s.tx(x, y + 1, 'M', { size: 15, anchor: 'middle', weight: 700 });
  s.tx(x, y + 14, sub, { size: 8.5, anchor: 'middle' });
  s.tx(x + r + 6, y - 4, label, { size: 9.5, weight: 700 });
  if (extra) s.tx(x + r + 6, y + 7, extra, { size: 7.5, c: MUTE });
}

export function lamp(s, x, y, { label = '', r = 8 } = {}) {
  s.circle(x, y, r, { c: INK, sw: 1, fill: '#fff' });
  s.ln(x - r * 0.7, y - r * 0.7, x + r * 0.7, y + r * 0.7);
  s.ln(x - r * 0.7, y + r * 0.7, x + r * 0.7, y - r * 0.7);
  if (label) s.tx(x + r + 5, y + 3, label, { size: 8.5 });
}

export function buzzer(s, x, y, { label = '' } = {}) {
  s.circle(x, y, 8, { c: INK, sw: 1, fill: '#fff' });
  s.ln(x - 4, y + 2, x + 4, y + 2);
  s.arc?.(x, y);
  s.tx(x, y - 1, '♪', { size: 8, anchor: 'middle' });
  if (label) s.tx(x + 13, y + 3, label, { size: 8.5 });
}

// Pulsante (NA o NC), verticale, con comando a fungo opzionale
export function pushbutton(s, x, y, { nc = false, label = '', stop = false, h = 40 } = {}) {
  vcont(s, x, y, { nc, h });
  s.ln(x - 14, y + h / 2, x - 3, y + h / 2, { dash: '2 2', w: 0.8 });
  s.ln(x - 14, y + h / 2 - 5, x - 14, y + h / 2 + 5);
  s.ln(x - 14, y + h / 2 - 5, x - 20, y + h / 2 - 5);
  if (stop) s.circle(x - 20, y + h / 2 - 5, 3, { c: INK, sw: 1, fill: '#fff' });
  if (label) s.tx(x + 8, y + h / 2 + 3, label, { size: 8.5 });
}

// Interruttore a chiave / selettore (verticale)
export function keyswitch(s, x, y, { label = '', nc = false, h = 40 } = {}) {
  vcont(s, x, y, { nc, h });
  s.ln(x - 14, y + h / 2, x - 3, y + h / 2, { dash: '2 2', w: 0.8 });
  s.ln(x - 14, y + h / 2 - 5, x - 14, y + h / 2 + 5);
  s.ln(x - 17, y + h / 2 - 5, x - 11, y + h / 2 - 5);
  if (label) s.tx(x + 8, y + h / 2 + 3, label, { size: 8.5 });
}

// Interruttore di posizione (finecorsa), verticale
export function limit(s, x, y, { nc = true, label = '', h = 40 } = {}) {
  vcont(s, x, y, { nc, h });
  s.ln(x - 18, y + h / 2, x - 4, y + h / 2, { dash: '2 2', w: 0.8 });
  s.ln(x - 18, y + h / 2 - 5, x - 18, y + h / 2 + 5);
  s.ln(x - 18, y + h / 2 + 5, x - 24, y + h / 2 + 5);
  if (label) s.tx(x + 8, y + h / 2 + 3, label, { size: 8.5 });
}

// Blocco-dispositivo con piedini (apparecchio): pins = { left:[{t,n}], right:[…], top:[…], bottom:[…] }
// Ritorna le coordinate dei piedini per nome n.
export function device(s, x, y, w, h, name, { sub = '', left = [], right = [], top = [], bottom = [], dash = '', fillBg = '#fff' } = {}) {
  s.bx(x, y, w, h, { dash, fill: fillBg });
  s.tx(x + w / 2, y + 12, name, { size: 10, anchor: 'middle', weight: 700 });
  if (sub) s.tx(x + w / 2, y + 23, sub, { size: 7.5, anchor: 'middle', c: MUTE });
  const pts = {};
  const place = (arr, side) => {
    const n = arr.length;
    arr.forEach((p, i) => {
      const lab = typeof p === 'string' ? p : p.t;
      const key = typeof p === 'string' ? p : (p.n ?? p.t);
      let px;
      let py;
      if (side === 'left' || side === 'right') {
        const top0 = y + 32;
        const span = h - 40;
        py = top0 + (n === 1 ? span / 2 : (span * i) / (n - 1));
        px = side === 'left' ? x : x + w;
        s.ln(px, py, px + (side === 'left' ? 6 : -6), py, { w: 0.8 });
        s.tx(side === 'left' ? px + 9 : px - 9, py + 3, lab, { size: 7.5, anchor: side === 'left' ? 'start' : 'end' });
      } else {
        py = side === 'top' ? y : y + h;
        px = x + 14 + (n === 1 ? (w - 28) / 2 : ((w - 28) * i) / (n - 1));
        s.ln(px, py, px, py + (side === 'top' ? 6 : -6), { w: 0.8 });
        s.tx(px, side === 'top' ? py + 15 : py - 9, lab, { size: 7.5, anchor: 'middle' });
      }
      pts[key] = [px, py];
    });
  };
  place(left, 'left');
  place(right, 'right');
  place(top, 'top');
  place(bottom, 'bottom');
  return pts;
}

// Cavo: ellisse con sigla e dati (tag) posizionato su un percorso
export function cabletag(s, x, y, id, spec, { w = 150 } = {}) {
  s.rect(x, y, w, 22, { fill: '#fff', c: INK, sw: 0.9, r: 11 });
  s.tx(x + 10, y + 10, id, { size: 8.5, weight: 700 });
  s.tx(x + 10, y + 19, spec, { size: 7 });
}

// Parentesi quadra di gruppo con titolo (area funzionale)
export function area(s, x, y, w, h, title) {
  s.bx(x, y, w, h, { dash: '8 3 2 3', w: 0.9 });
  s.tx(x + 6, y + 11, title, { size: 8.5, weight: 700 });
}

// Tabella semplice: header + righe, larghezze colonne cw[]. Ritorna y finale.
export function table(s, x, y, cw, header, rows, { rh = 15, size = 8, hsize = 8.5 } = {}) {
  const tw = cw.reduce((a, b) => a + b, 0);
  s.bx(x, y, tw, rh, { fill: '#e5e7eb', w: 0.8 });
  let xx = x;
  header.forEach((h, i) => {
    s.tx(xx + 4, y + rh - 4, h, { size: hsize, weight: 700 });
    if (i) s.ln(xx, y, xx, y + rh * (rows.length + 1), { w: 0.6 });
    xx += cw[i];
  });
  rows.forEach((r, j) => {
    const yy = y + rh * (j + 1);
    s.ln(x, yy, x + tw, yy, { w: 0.5 });
    let x2 = x;
    r.forEach((c, i) => {
      s.tx(x2 + 4, yy + rh - 4, c, { size });
      x2 += cw[i];
    });
  });
  s.bx(x, y, tw, rh * (rows.length + 1), { w: 0.9 });
  return y + rh * (rows.length + 1);
}
