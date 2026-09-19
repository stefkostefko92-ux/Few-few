// Генерира перото на Piuma като светещ контур: централен ствол (крива на Безие) и
// барбули, чиято дължина и ъгъл следват крива — затова изглежда като истинско перо,
// а не като рибена кост. Нула текст в SVG-то (инвариант 13: текстът живее в речниците).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Коренът на продукта — скриптът работи отвсякъде, без зашит път. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const W = 520;
const H = 720;

// Стволът: от долу-дясно към горе-ляво, леко извит.
const stem = { x0: 430, y0: 690, x1: 300, y1: 430, x2: 210, y2: 190, x3: 150, y3: 40 };

/** Точка и допирателна по кубична крива на Безие при t. */
function onCurve(t) {
  const u = 1 - t;
  const x =
    u ** 3 * stem.x0 + 3 * u ** 2 * t * stem.x1 + 3 * u * t ** 2 * stem.x2 + t ** 3 * stem.x3;
  const y =
    u ** 3 * stem.y0 + 3 * u ** 2 * t * stem.y1 + 3 * u * t ** 2 * stem.y2 + t ** 3 * stem.y3;
  const dx =
    3 * u ** 2 * (stem.x1 - stem.x0) +
    6 * u * t * (stem.x2 - stem.x1) +
    3 * t ** 2 * (stem.x3 - stem.x2);
  const dy =
    3 * u ** 2 * (stem.y1 - stem.y0) +
    6 * u * t * (stem.y2 - stem.y1) +
    3 * t ** 2 * (stem.y3 - stem.y2);
  const len = Math.hypot(dx, dy) || 1;
  return { x, y, nx: -dy / len, ny: dx / len };
}

const barbs = [];
const COUNT = 42;
/** Повторим шум — перото трябва да е накъсано, но да изглежда еднакво при всяко генериране. */
const jitter = (i, k) => Math.sin(i * 12.9898 + k * 78.233) * 0.5 + 0.5;

for (let i = 0; i < COUNT; i++) {
  const t = 0.17 + (i / (COUNT - 1)) * 0.79; // основата остава гола — това е стволът
  const p = onCurve(t);
  // Дължината расте към средата и спада към върха — силуетът на перо.
  const bell = Math.sin(((t - 0.13) / 0.87) * Math.PI) ** 0.72;
  for (const side of [1, -1]) {
    // Истинското перо е асиметрично: външната ветрило е по-тясна от вътрешната.
    const width = side === 1 ? 1 : 0.72;
    const len = (22 + bell * 122) * width * (0.86 + jitter(i, side) * 0.24);
    // Барбулите сочат назад към основата; ъгълът се затваря към върха.
    const sweep = 0.52 + 0.26 * (1 - t);
    const back = { x: stem.x0 - p.x, y: stem.y0 - p.y };
    const bl = Math.hypot(back.x, back.y) || 1;
    const ex = p.x + side * p.nx * len * (1 - sweep) + (back.x / bl) * len * sweep;
    const ey = p.y + side * p.ny * len * (1 - sweep) + (back.y / bl) * len * sweep;
    // Леко увисване към средата на барбулата, не дъга до затваряне.
    const cx = p.x + (ex - p.x) * 0.55 + side * p.nx * len * 0.1;
    const cy = p.y + (ey - p.y) * 0.55 + side * p.ny * len * 0.1;
    // Тук-там барбула е разделена — така ръбът не е гладък конец.
    const gap = jitter(i, side + 3) > 0.82 ? 0.55 + jitter(i, side) * 0.2 : 1;
    const fx = p.x + (ex - p.x) * gap;
    const fy = p.y + (ey - p.y) * gap;
    barbs.push(
      `<path d="M${p.x.toFixed(1)} ${p.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${fx.toFixed(1)} ${fy.toFixed(1)}" stroke-width="${(0.8 + bell * 1.7).toFixed(2)}" opacity="${(0.3 + bell * 0.6).toFixed(2)}"/>`,
    );
  }
}

// Няколко барбули се откъсват и отлитат — публикациите, тръгнали от перото.
const motes = [];
for (let i = 0; i < 9; i++) {
  const t = 0.2 + i * 0.085;
  const p = onCurve(t);
  const dist = 150 + i * 26;
  const x = p.x - p.nx * dist * 0.75 + 40;
  const y = p.y - p.ny * dist * 0.75 - 20 - i * 6;
  const r = 1.6 + ((i * 7) % 5) * 0.55;
  motes.push(
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#plume-sweep)" opacity="${(0.75 - i * 0.06).toFixed(2)}"/>`,
  );
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" aria-hidden="true">
  <defs>
    <!-- Градиентът следва СТВОЛА (долу-дясно към горе-ляво). Перпендикулярно положен,
         той показваше само средния тон и трите цвята на марката се губеха. -->
    <linearGradient id="plume-sweep" x1="1" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ff2d78"/>
      <stop offset="0.5" stop-color="#8b5cf6"/>
      <stop offset="1" stop-color="#22d3ee"/>
    </linearGradient>
    <filter id="plume-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="7" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#plume-glow)">
    <g stroke="url(#plume-sweep)" stroke-linecap="round" fill="none">
${barbs.map((b) => `      ${b}`).join('\n')}
    </g>
    <path d="M${stem.x0} ${stem.y0} C${stem.x1} ${stem.y1} ${stem.x2} ${stem.y2} ${stem.x3} ${stem.y3}"
      stroke="url(#plume-sweep)" stroke-width="3.4" stroke-linecap="round"/>
${motes.map((m) => `    ${m}`).join('\n')}
  </g>
</svg>
`;

writeFileSync(join(ROOT, 'public', 'landing', 'plume.svg'), svg);
console.log('перо:', Math.round(Buffer.byteLength(svg) / 1024), 'KB,', barbs.length, 'барбули');
