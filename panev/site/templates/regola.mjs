// „Regola tu“: регулирането на сглобка от каталога кадър по кадър (прави ги
// `cd 3d && node scripts/frames.mjs`: една камера, движи се само регулирането). Посетителят влачи
// плъзгача или снимката и планката се движи като на обекта (js/regola.js). Без JS снимката остава в
// покой, а управлението не се показва (css/regola.css).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from './layout.mjs';
import { versioned } from './asset.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// kind: как се чете стойността (градуси със знак или mm); rest: стойността преди първото влачене.
const SEQUENCES = { porta: { kind: 'angle', rest: 0 }, guida: { kind: 'reach', rest: 95 } };

const MINUS = '−';
export function regolaValue(kind, v) {
  if (kind === 'reach') return `${v} mm`;
  return v === 0 ? '0°' : `${v > 0 ? '+' : MINUS}${Math.abs(v)}°`;
}

// `name`: porta (A + B, ± 8°) или guida (SU + SG, 45–155 mm). `priority`: главната снимка на страницата.
export function regola(t, name, { priority = false } = {}) {
  const seq = SEQUENCES[name];
  const meta = JSON.parse(readFileSync(join(ROOT, 'img', 'regola', `${name}.json`), 'utf8'));
  const frames = meta.values.map((_, k) => versioned(`img/regola/${name}-${String(k).padStart(2, '0')}.webp`));
  const rest = meta.values.reduce((best, v, k) => (Math.abs(v - seq.rest) < Math.abs(meta.values[best] - seq.rest) ? k : best), 0);
  const label = t.regola[name].label;
  const value = regolaValue(seq.kind, meta.values[rest]);
  const id = `regola-${name}`;
  const data = esc(JSON.stringify({ kind: seq.kind, frames, values: meta.values }));
  const last = meta.values.length - 1;
  return `<figure class="regola regola-${name}" data-regola="${data}">
  <div class="regola-stage">
    <img src="${frames[rest]}" alt="${esc(t.regola[name].alt)}" width="${meta.width}" height="${meta.height}"${priority ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}>
  </div>
  <figcaption class="regola-ctl">
    <span class="regola-head"><label for="${id}">${esc(label)}</label><output id="${id}-out" for="${id}">${esc(value)}</output></span>
    <input type="range" id="${id}" min="0" max="${last}" step="1" value="${rest}" aria-valuetext="${esc(value)}">
    <span class="regola-scale" aria-hidden="true"><span>${esc(regolaValue(seq.kind, meta.values[0]))}</span><span>${esc(t.regola.hint)}</span><span>${esc(regolaValue(seq.kind, meta.values[last]))}</span></span>
  </figcaption>
</figure>`;
}

// Скриптът — веднъж на страница (defer: тръгва, когато документът е разчетен).
export const regolaScript = () => `<script src="${versioned('js/regola.js')}" defer></script>`;
