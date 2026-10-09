// Drawing kit: A3 landscape sheet (mm), frame and title block, first-angle projection symbol, linear and ordinate
// dimensions, scale choice and the self-contained SVG wrapper (styles inside, prefixed so they never touch the page).
import { esc, dimTxt } from './util.js';

// ISO 5455: the recommended scales only (1:25 and 1:4 are not in the series)
export const SCALES = [1, 2, 5, 10, 20, 50, 100];
export const pickScale = (wMm, hMm, boxW, boxH) => SCALES.find((s) => wMm / s <= boxW && hMm / s <= boxH) ?? SCALES.at(-1);

const INK = '#18200f';
const DIM = '#2c6a10';
// the paper; whatever frames a drawing on a page matches it (--drawing-paper in public/css/base.css and
// print/brochure.css)
export const PAPER = '#fbfcf9';
// The faces the site loads (public/css/base.css, the brochure): Geologica for text, JetBrains Mono for numbers; a
// drawing opened on its own falls back to the system's.
export const STYLE = `svg.rdw{font-family:'Geologica',Inter,system-ui,sans-serif;font-feature-settings:'locl' 0}
svg.rdw .d-paper{fill:${PAPER}}
svg.rdw .d-frm,svg.rdw .d-tb rect,svg.rdw .d-tb line{fill:none;stroke:${INK};stroke-width:.5}
svg.rdw .d-vis{fill:${PAPER};stroke:${INK};stroke-width:.35}
svg.rdw .d-front{fill:#f3efe6;stroke:${INK};stroke-width:.5}
svg.rdw .d-out{fill:none;stroke:${INK};stroke-width:.5}
svg.rdw .d-hid{fill:none;stroke:${INK};stroke-width:.2;stroke-dasharray:2 1.2}
svg.rdw .d-cut{stroke:${INK};stroke-width:.35}
svg.rdw .d-hl{stroke:${INK};stroke-width:.16}
svg.rdw .d-dim,svg.rdw .d-ext{fill:none;stroke:${DIM};stroke-width:.18}
svg.rdw .d-arwh{fill:${DIM}}
svg.rdw .d-dt{font:500 2.9px 'JetBrains Mono',ui-monospace,monospace;fill:${DIM}}
svg.rdw .d-vt{font:600 3.6px 'Geologica',system-ui,sans-serif;fill:${INK}}
svg.rdw .d-note{font:400 2.6px 'Geologica',system-ui,sans-serif;fill:#2b3527}
svg.rdw .d-small{font:400 2.2px 'Geologica',system-ui,sans-serif;fill:#2b3527}
svg.rdw .d-tag{font:700 2.4px 'JetBrains Mono',ui-monospace,monospace;fill:${INK}}
svg.rdw .d-tl{font:400 2.1px 'Geologica',system-ui,sans-serif;fill:#5b6656}
svg.rdw .d-tv{font:500 3px 'JetBrains Mono',ui-monospace,monospace;fill:${INK}}
svg.rdw .d-tv.d-big{font:600 3.6px 'Geologica',system-ui,sans-serif}
svg.rdw .d-open{fill:none;stroke:${INK};stroke-width:.16;stroke-dasharray:1.2 1}
svg.rdw .d-gnd{stroke:${INK};stroke-width:.35}
svg.rdw .d-cpl{stroke:${INK};stroke-width:.25;stroke-dasharray:6 1 1 1}
svg.rdw .d-cplt{stroke:${INK};stroke-width:.7}
svg.rdw .d-cpa{stroke:${INK};stroke-width:.25}
svg.rdw .d-cpah{fill:${INK}}
svg.rdw .d-alert{font:600 2.8px 'Geologica',system-ui,sans-serif;fill:#b42318}
svg.rdw .d-cl{stroke:${INK};stroke-width:.16;stroke-dasharray:1.5 .6 .3 .6}
svg.rdw .d-hole{fill:none;stroke:${INK};stroke-width:.22}
svg.rdw .d-thru{fill:rgba(24,32,15,.18);stroke:${INK};stroke-width:.22}
svg.rdw .d-key{fill:none;stroke:#a8510f;stroke-width:.3}
svg.rdw .d-key.d-thru{fill:rgba(196,98,24,.16)}
svg.rdw .d-mark{fill:none;stroke:#a8510f;stroke-width:.25}
svg.rdw .d-edgeop{fill:none;stroke:#3b5bdb;stroke-width:.3}
svg.rdw .d-groove{fill:rgba(24,32,15,.12);stroke:${INK};stroke-width:.2}
svg.rdw .d-band{stroke:#b0742f;stroke-width:.9}
svg.rdw .d-grain{stroke:${INK};stroke-width:.25}
svg.rdw .d-box{fill:none;stroke:${INK};stroke-width:.25}
svg.rdw .d-proj path,svg.rdw .d-proj circle{fill:none;stroke:${INK};stroke-width:.3}`;

const DEFS = `<marker id="ARW" viewBox="0 0 10 10" refX="10" refY="5" markerUnits="userSpaceOnUse" markerWidth="2.4" markerHeight="2.4" orient="auto-start-reverse"><path d="M0 2.2 L10 5 L0 7.8 z" class="d-arwh"/></marker>
<pattern id="HATCH" patternUnits="userSpaceOnUse" width="2.2" height="2.2" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2.2" class="d-hl"/></pattern>`;

export function dimH(x1, x2, y, label, o = {}) {
  const t = o.textBelow ? y + 3.6 : y - 1.2;
  let s = '';
  for (const [x, y0] of o.ext ?? []) s += `<line class="d-ext" x1="${x}" y1="${y0}" x2="${x}" y2="${y + (y > y0 ? 1.5 : -1.5)}"/>`;
  s += `<line class="d-dim" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" marker-start="url(#ARW)" marker-end="url(#ARW)"/>`;
  return `${s}<text class="d-dt" x="${(x1 + x2) / 2}" y="${t}" text-anchor="middle">${esc(label)}</text>`;
}

export function dimV(y1, y2, x, label, o = {}) {
  let s = '';
  for (const [x0, y] of o.ext ?? []) s += `<line class="d-ext" x1="${x0}" y1="${y}" x2="${x + (x > x0 ? 1.5 : -1.5)}" y2="${y}"/>`;
  s += `<line class="d-dim" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" marker-start="url(#ARW)" marker-end="url(#ARW)"/>`;
  const ty = (y1 + y2) / 2;
  return `${s}<text class="d-dt" x="${x - 1.2}" y="${ty}" text-anchor="middle" transform="rotate(-90 ${x - 1.2} ${ty})">${esc(label)}</text>`;
}

// Ordinate dimensions along one axis. pts: [{ at, from, label }] where `at` is the paper coordinate along the axis
// and `from` the paper coordinate of the feature across it. Labels that would collide are pushed apart with jogs.
export function ordinates(pts, o) {
  const { axis, base, line, gap = 3.2, dir = 1 } = o; // axis 'x' (labels below/above) or 'y' (labels left/right)
  const sorted = [...pts].sort((a, b) => a.at - b.at);
  let last = -Infinity;
  let s = '';
  for (const p of sorted) {
    const t = Math.max(p.at, last + gap);
    last = t;
    const jog = line - dir * 2.2;
    if (axis === 'x') {
      s += `<polyline class="d-ext" points="${p.at},${p.from} ${p.at},${base} ${p.at},${jog} ${t},${line}"/>`;
      s += `<text class="d-dt" x="${t}" y="${line + dir * 0.8}" transform="rotate(-90 ${t} ${line + dir * 0.8})" text-anchor="${dir > 0 ? 'end' : 'start'}" dominant-baseline="middle">${esc(p.label)}</text>`;
    } else {
      s += `<polyline class="d-ext" points="${p.from},${p.at} ${base},${p.at} ${jog},${p.at} ${line},${t}"/>`;
      s += `<text class="d-dt" x="${line + dir * 0.8}" y="${t}" text-anchor="${dir > 0 ? 'start' : 'end'}" dominant-baseline="middle">${esc(p.label)}</text>`;
    }
  }
  return s;
}

function projectionSymbol(x, y) {
  return `<g class="d-proj" transform="translate(${x} ${y})"><path d="M0 -2.4 L6 -3.6 L6 3.6 L0 2.4 Z"/><line x1="-1" y1="0" x2="7" y2="0" class="d-cl"/><circle cx="12" cy="0" r="3.6"/><circle cx="12" cy="0" r="2.4"/><line x1="7.6" y1="0" x2="16.4" y2="0" class="d-cl"/></g>`;
}

// A title-block value cut to what its cell holds: a 60 mm cell takes 30 characters of the 3 px monospace.
export const fit = (text, n) => {
  const s = String(text ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

// Frame (20 mm binding margin left, 10 mm elsewhere) and a 180 × 36 title block at the bottom right. sheetNo null:
// a part without a sheet of its own (its drilling map only) — the drawing number has no sheet and the sheet is „—“.
export function frame(title, meta, scale, sheetNo, sheetCount, material) {
  const x = 230;
  const y = 251;
  const drawingNo = meta.hash.slice(0, 8).toUpperCase() + (sheetNo == null ? '' : `-${sheetNo}`);
  const cell = (cx, cy, label, value, cls = 'd-tv') => `<text class="d-tl" x="${cx + 2}" y="${cy + 3.6}">${label}</text><text class="${cls}" x="${cx + 2}" y="${cy + 9.2}">${esc(value)}</text>`;
  return `<rect class="d-frm" x="20" y="10" width="390" height="277"/>
<g class="d-tb"><rect x="${x}" y="${y}" width="180" height="36"/>
<line x1="${x}" y1="${y + 12}" x2="${x + 180}" y2="${y + 12}"/><line x1="${x}" y1="${y + 24}" x2="${x + 180}" y2="${y + 24}"/>
<line x1="${x + 60}" y1="${y + 12}" x2="${x + 60}" y2="${y + 36}"/><line x1="${x + 110}" y1="${y + 12}" x2="${x + 110}" y2="${y + 36}"/><line x1="${x + 145}" y1="${y + 12}" x2="${x + 145}" y2="${y + 36}"/>
${cell(x, y, 'Наименование', fit(title, 58), 'd-tv d-big')}
${cell(x, y + 12, 'Собственик', fit(meta.owner, 30))}${cell(x + 60, y + 12, 'Чертеж №', drawingNo)}
${cell(x + 110, y + 12, 'Мащаб', `1:${scale}`)}${cell(x + 145, y + 12, 'Лист', sheetNo == null ? '—' : `${sheetNo}/${sheetCount}`)}
${cell(x, y + 24, 'Материал', fit(material, 30))}${cell(x + 60, y + 24, 'Дата', meta.date)}
${cell(x + 110, y + 24, 'Размери', 'mm')}<text class="d-tl" x="${x + 147}" y="${y + 27.6}">Проекция</text>${projectionSymbol(x + 158, y + 31.2)}</g>`;
}

let seq = 0;
// `sheet` — the sheet's own id (the part id, or `assembly`): two parts may share a name (the left and right side of a
// drawer), and the full-screen view tells sheets apart by it.
export function svgDoc(inner, label, sheet = '') {
  seq += 1;
  const uid = `r${seq}`;
  const body = inner.replaceAll('url(#ARW)', `url(#arw-${uid})`).replaceAll('url(#HATCH)', `url(#hatch-${uid})`);
  const defs = DEFS.replace('id="ARW"', `id="arw-${uid}"`).replace('id="HATCH"', `id="hatch-${uid}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 297" class="rdw" role="img" aria-label="${esc(label)}"${sheet ? ` data-sheet="${esc(sheet)}"` : ''}><style>${STYLE}</style><defs>${defs}</defs><rect class="d-paper" x="0" y="0" width="420" height="297"/>${body}</svg>`;
}

export const fmt = dimTxt;

// The line every drawing of a model with errors carries: it is not for production, the CNC files are withheld.
export function errorAlert(model, x, y) {
  const n = model.warnings.filter((w) => w.level === 'error').length;
  if (!n) return '';
  return `<text class="d-alert" x="${x}" y="${y}">ВНИМАНИЕ: ${n === 1 ? '1 грешка' : `${n} грешки`} в проверките на конструкцията — не е за производство; файловете за CNC не се издават.</text>`;
}
