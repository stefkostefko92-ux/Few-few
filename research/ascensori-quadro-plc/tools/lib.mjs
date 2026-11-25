// Libreria minima per disegnare le tavole (SVG, zero dipendenze).
// Convenzioni: A3 orizzontale 1587x1122 px, cartiglio in basso a destra.

export const W = 1587;
export const H = 1122;

export const COL = {
  ink: '#111827',
  grid: '#e5e7eb',
  p400: '#111827', // potenza 400 V c.a.
  p230: '#b91c1c', // 230 V c.a.
  sic: '#15803d', // circuito di sicurezza 48 V c.c.
  v24: '#1d4ed8', // 24 V c.c. logica
  can: '#c2410c', // bus CAN
  eth: '#7e22ce', // Ethernet
  rf: '#be185d', // radio 5G / Wi-Fi
  hyd: '#0e7490', // idraulica
  mute: '#6b7280',
  warn: '#b45309',
  fillA: '#f1f5f9',
  fillB: '#ecfdf5',
  fillC: '#eff6ff',
  fillD: '#fff7ed',
  fillE: '#faf5ff',
  fillR: '#fef2f2',
};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class Sheet {
  constructor({ n, title, subtitle = '', rev = 'A', note = '' }) {
    this.n = n;
    this.title = title;
    this.subtitle = subtitle;
    this.rev = rev;
    this.note = note;
    this.parts = [];
  }

  raw(s) {
    this.parts.push(s);
    return this;
  }

  line(x1, y1, x2, y2, { c = COL.ink, w = 1.6, dash = '' } = {}) {
    return this.raw(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linecap="round"/>`,
    );
  }

  poly(pts, { c = COL.ink, w = 1.6, dash = '', arrow = false, fill = 'none' } = {}) {
    const d = pts.map((p) => p.join(',')).join(' ');
    return this.raw(
      `<polyline points="${d}" fill="${fill}" stroke="${c}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"${arrow ? ` marker-end="url(#ah-${c.slice(1)})"` : ''}/>`,
    );
  }

  rect(x, y, w, h, { fill = 'none', c = COL.ink, sw = 1.4, r = 0, dash = '' } = {}) {
    return this.raw(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${c}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`,
    );
  }

  circle(x, y, r, { fill = 'none', c = COL.ink, sw = 1.4 } = {}) {
    return this.raw(`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${c}" stroke-width="${sw}"/>`);
  }

  dot(x, y, c = COL.ink, r = 3) {
    return this.raw(`<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`);
  }

  text(x, y, s, { size = 12, anchor = 'start', weight = 400, c = COL.ink, rotate = 0, italic = false } = {}) {
    const lines = String(s).split('\n');
    const tr = rotate ? ` transform="rotate(${rotate} ${x} ${y})"` : '';
    const tsp = lines
      .map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : size * 1.25}">${esc(l)}</tspan>`)
      .join('');
    return this.raw(
      `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}" fill="${c}"${italic ? ' font-style="italic"' : ''}${tr}>${tsp}</text>`,
    );
  }

  // Blocco con titolo e righe di dettaglio. Restituisce i punti di aggancio.
  box(x, y, w, h, title, { sub = '', fill = COL.fillA, c = COL.ink, size = 13, sw = 1.6, dash = '', r = 6 } = {}) {
    this.rect(x, y, w, h, { fill, c, sw, r, dash });
    const wide = Math.max(title.length * 0.64, ...(sub ? sub.split('\n').map((l) => l.length * 0.56 * (size - 2) / size) : [0]));
    if (wide * size > w - 10) size = Math.max(8.5, Math.floor(((w - 10) / wide) * 10) / 10);
    const lines = sub ? sub.split('\n').length : 0;
    const total = size * 1.25 + lines * (size - 1) * 1.25;
    let ty = y + (h - total) / 2 + size;
    this.text(x + w / 2, ty, title, { size, anchor: 'middle', weight: 700, c });
    if (sub) {
      ty += size * 1.25;
      this.text(x + w / 2, ty, sub, { size: size - 2, anchor: 'middle', c: COL.mute });
    }
    return {
      l: [x, y + h / 2],
      r: [x + w, y + h / 2],
      t: [x + w / 2, y],
      b: [x + w / 2, y + h],
      x, y, w, h,
    };
  }

  group(x, y, w, h, title, { c = COL.mute, dash = '6 4', fill = 'none' } = {}) {
    this.rect(x, y, w, h, { c, dash, sw: 1.2, r: 8, fill });
    this.text(x + 10, y + 16, title, { size: 12, weight: 700, c });
  }

  // Freccia / collegamento ortogonale con etichetta opzionale.
  link(pts, { c = COL.ink, w = 2, dash = '', label = '', lx = 0, ly = 0, arrow = true, both = false, size = 11 } = {}) {
    this.need = this.need || new Set();
    this.need.add(c);
    this.poly(pts, { c, w, dash, arrow });
    if (both) {
      const r = [...pts].reverse();
      this.poly([r[0], r[1]], { c, w, dash, arrow: true });
    }
    if (label) {
      const mid = pts[Math.floor((pts.length - 1) / 2)];
      const nxt = pts[Math.floor((pts.length - 1) / 2) + 1];
      const mx = (mid[0] + nxt[0]) / 2 + lx;
      const my = (mid[1] + nxt[1]) / 2 + ly;
      this.text(mx, my, label, { size, anchor: 'middle', c, weight: 600 });
    }
    return this;
  }

  legend(x, y, items) {
    this.rect(x, y, 230, 22 + items.length * 18, { fill: '#fff', c: COL.mute, sw: 1, r: 4 });
    this.text(x + 8, y + 15, 'Legenda', { size: 11, weight: 700 });
    items.forEach(([c, s, dash], i) => {
      this.line(x + 10, y + 32 + i * 18, x + 46, y + 32 + i * 18, { c, w: 3, dash });
      this.text(x + 54, y + 36 + i * 18, s, { size: 10.5 });
    });
  }

  render() {
    const colors = [...(this.need || [])];
    const markers = colors
      .map(
        (c) =>
          `<marker id="ah-${c.slice(1)}" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`,
      )
      .join('');
    const frame = `
<rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="none" stroke="#111827" stroke-width="2"/>
<rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="#111827" stroke-width="0.8"/>`;
    const tb = `
<g font-family="DejaVu Sans, Arial, sans-serif">
<rect x="${W - 760}" y="${H - 112}" width="746" height="98" fill="#fff" stroke="#111827" stroke-width="1.2"/>
<line x1="${W - 760}" y1="${H - 80}" x2="${W - 14}" y2="${H - 80}" stroke="#111827" stroke-width="0.8"/>
<line x1="${W - 150}" y1="${H - 112}" x2="${W - 150}" y2="${H - 14}" stroke="#111827" stroke-width="0.8"/>
<line x1="${W - 150}" y1="${H - 47}" x2="${W - 14}" y2="${H - 47}" stroke="#111827" stroke-width="0.8"/>
<text x="${W - 750}" y="${H - 94}" font-size="10" fill="#6b7280">QUADRO DI MANOVRA A PLC — PROGETTO DI FATTIBILITÀ · Carbon Stealth VCC</text>
<text x="${W - 750}" y="${H - 60}" font-size="17" font-weight="700" fill="#111827">${esc(this.title)}</text>
<text x="${W - 750}" y="${H - 38}" font-size="11" fill="#374151">${esc(this.subtitle)}</text>
<text x="${W - 750}" y="${H - 22}" font-size="10" fill="#b45309">${esc(this.note || 'Schema di principio: non è un esecutivo. Lo firma un progettista abilitato.')}</text>
<text x="${W - 142}" y="${H - 96}" font-size="10" fill="#6b7280">Tavola</text>
<text x="${W - 142}" y="${H - 66}" font-size="26" font-weight="700">${esc(this.n)}</text>
<text x="${W - 142}" y="${H - 32}" font-size="10" fill="#6b7280">Rev. ${esc(this.rev)} · 2026-10-07</text>
<text x="${W - 142}" y="${H - 19}" font-size="10" fill="#6b7280">A3 · senza scala</text>
</g>`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(this.title)}">
<title>${esc(this.n)} — ${esc(this.title)}</title>
<defs>${markers}</defs>
<rect width="${W}" height="${H}" fill="#ffffff"/>
${frame}
<g font-family="DejaVu Sans, Arial, sans-serif">
${this.parts.join('\n')}
</g>
${tb}
</svg>
`;
  }
}

// ---------- simboli (verticali, ingresso in alto, uscita in basso) ----------

export function vContact(s, x, y, { nc = false, label = '', safety = false, c = COL.ink, h = 44 } = {}) {
  // terminale fisso in alto, lama in basso che si apre verso sinistra
  s.line(x, y, x, y + 12, { c, w: 2 });
  s.line(x, y + h - 12, x, y + h, { c, w: 2 });
  s.line(x, y + h - 12, x - 10, y + 12, { c, w: 2 });
  if (nc) s.line(x - 14, y + 11, x - 5, y + 11, { c, w: 2 });
  if (safety) s.circle(x + 14, y + h / 2, 3.2, { c, sw: 1.2 });
  if (label) s.text(x + 24, y + h / 2 + 4, label, { size: 11 });
}

export function vCoil(s, x, y, label = '', { c = COL.ink, h = 34, w = 24 } = {}) {
  s.line(x, y, x, y + 6, { c });
  s.rect(x - w / 2, y + 6, w, h, { c });
  s.line(x, y + 6 + h, x, y + h + 12, { c });
  if (label) s.text(x + w / 2 + 6, y + 6 + h / 2 + 4, label, { size: 11 });
}

export function vBreaker(s, x, y, label = '', { c = COL.ink } = {}) {
  s.line(x, y, x, y + 8, { c });
  s.line(x, y + 8, x - 10, y + 36, { c, w: 1.8 });
  s.line(x, y + 36, x, y + 46, { c });
  s.line(x - 4, y + 18, x + 4, y + 26, { c });
  s.line(x - 4, y + 26, x + 4, y + 18, { c });
  s.rect(x - 13, y + 14, 26, 18, { c, sw: 0.9 });
  if (label) s.text(x + 22, y + 28, label, { size: 11 });
}

export function motor(s, x, y, label = 'M', sub = '3~', { r = 24, c = COL.ink } = {}) {
  s.circle(x, y, r, { c, sw: 1.8 });
  s.text(x, y + 2, label, { size: 17, anchor: 'middle', weight: 700, c });
  s.text(x, y + 17, sub, { size: 11, anchor: 'middle', c });
}

export function ground(s, x, y, c = COL.ink) {
  s.line(x, y, x, y + 8, { c });
  s.line(x - 9, y + 8, x + 9, y + 8, { c });
  s.line(x - 6, y + 12, x + 6, y + 12, { c });
  s.line(x - 3, y + 16, x + 3, y + 16, { c });
}

// ---------- simboli orizzontali (per la catena di sicurezza) ----------

export function hSafety(s, x, y, label = '', { c = COL.sic, w = 46, below = true, size = 10 } = {}) {
  // contatto NC di sicurezza: ingresso a sinistra (x,y), uscita a destra (x+w,y)
  s.line(x, y, x + 10, y, { c, w: 2 });
  s.line(x + w - 10, y, x + w, y, { c, w: 2 });
  s.dot(x + 10, y, c, 2.4);
  s.dot(x + w - 10, y, c, 2.4);
  s.line(x + 10, y, x + w - 10, y - 12, { c, w: 2 });
  s.line(x + w - 14, y - 12, x + w - 10, y - 12, { c, w: 2 });
  s.circle(x + w / 2, y - 14, 2.8, { c, sw: 1 });
  if (label) s.text(x + w / 2, y + (below ? 17 : -22), label, { size, anchor: 'middle' });
}

export function hBox(s, x, y, w, h, label, { c = COL.sic, fill = '#fff', size = 10 } = {}) {
  s.rect(x, y, w, h, { c, fill, sw: 1.6, r: 3 });
  s.text(x + w / 2, y + h / 2 + 4, label, { size, anchor: 'middle', weight: 600 });
}
