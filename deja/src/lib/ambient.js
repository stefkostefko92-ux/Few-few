// Общ „атмосферен“ слой за всички страници на Déjà: живият фон (nebula),
// SVG филтърът за пречупване на liquid glass и бликът, който следва курсора.
// Прогресивно подобрение: без JS страниците са четими (CSS градиент + стъкло без
// пречупване); canvas-ът е aria-hidden и не хваща кликове.

import { startNebula } from './nebula.js';

// елементите от стъкло, по които бликът следва курсора (с псевдоелемент ::before)
const GLASS = '.lg, .result, .card, .page-row, .block, .points li, .pill';

function injectRefraction() {
  // backdrop-filter: url(#…) (пречупване на фона) поддържа само Chromium —
  // в останалите браузъри стъклото остава с blur + saturate, без деформация
  if (!navigator.userAgentData) return;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  const filter = document.createElementNS(NS, 'filter');
  filter.id = 'lg-refract';
  for (const [k, v] of Object.entries({
    x: '0%',
    y: '0%',
    width: '100%',
    height: '100%',
    'color-interpolation-filters': 'sRGB',
  })) {
    filter.setAttribute(k, v);
  }
  const turb = document.createElementNS(NS, 'feTurbulence');
  for (const [k, v] of Object.entries({
    type: 'fractalNoise',
    baseFrequency: '0.008 0.012',
    numOctaves: '2',
    seed: '11',
    result: 'noise',
  })) {
    turb.setAttribute(k, v);
  }
  const soft = document.createElementNS(NS, 'feGaussianBlur');
  soft.setAttribute('in', 'noise');
  soft.setAttribute('stdDeviation', '3');
  soft.setAttribute('result', 'soft');
  const disp = document.createElementNS(NS, 'feDisplacementMap');
  for (const [k, v] of Object.entries({
    in: 'SourceGraphic',
    in2: 'soft',
    scale: '34',
    xChannelSelector: 'R',
    yChannelSelector: 'G',
  })) {
    disp.setAttribute(k, v);
  }
  filter.append(turb, soft, disp);
  svg.append(filter);
  document.body.append(svg);
  document.documentElement.classList.add('lg-refract');
}

// бликът на стъклото следва курсора — един делегиран слушател, rAF троттъл
function trackSpecular() {
  let pending = null;
  window.addEventListener(
    'pointermove',
    (e) => {
      const el = e.target instanceof Element ? e.target.closest(GLASS) : null;
      if (!el) return;
      pending = { el, x: e.clientX, y: e.clientY };
      requestAnimationFrame(() => {
        if (!pending) return;
        const r = pending.el.getBoundingClientRect();
        pending.el.style.setProperty('--mx', `${pending.x - r.left}px`);
        pending.el.style.setProperty('--my', `${pending.y - r.top}px`);
        pending = null;
      });
    },
    { passive: true },
  );
}

export function initAmbient() {
  const canvas = document.createElement('canvas');
  canvas.className = 'nebula';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  injectRefraction();
  trackSpecular();
  document.documentElement.classList.add('lg-ready');

  const nebula = startNebula(canvas);
  // „Жив фон“ (Настройки) — изричен контрол за спиране на движението (WCAG 2.2.2)
  chrome.storage.local
    .get('settings')
    .then(({ settings }) => nebula.setAnimate(settings?.ambientMotion !== false))
    .catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      nebula.setAnimate(changes.settings.newValue?.ambientMotion !== false);
    }
  });
  return nebula;
}
