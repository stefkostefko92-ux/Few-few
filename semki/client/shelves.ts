// Свързва 3D рисунката с разметката: за всеки рафт <canvas class="shelf-3d"> зад съдържанието му,
// прерисуване при смяна на размера. Без WebGL (или при загубен контекст) — простите стъкленици от CSS
// (html.no-3d), с нивото, зададено през CSSOM.
import type { ShelfData } from './data.js';
import { ShelfRenderer } from './shelves3d.js';

const RESIZE_DEBOUNCE_MS = 150;

function fallback(shelves: readonly ShelfData[]): void {
  document.documentElement.classList.add('no-3d');
  const levels = new Map<number, number>();
  for (const s of shelves) for (const v of s.vials) levels.set(v.id, v.level);
  for (const fill of document.querySelectorAll<HTMLElement>('.vial-fill')) {
    const level = levels.get(Number(fill.dataset.vial)) ?? 0;
    fill.style.height = `${(level * 100).toFixed(1)}%`; // CSSOM — CSP го позволява, style="" не
  }
}

export function mountShelves(shelves: readonly ShelfData[]): void {
  const sections = shelves
    .map((data) => ({ data, el: document.getElementById(`shelf-box-${data.key}`) }))
    .filter((s): s is { data: ShelfData; el: HTMLElement } => s.el !== null);
  if (sections.length === 0) return;

  const renderer = ShelfRenderer.create();
  if (!renderer) {
    fallback(shelves);
    return;
  }

  const canvases = new Map<HTMLElement, HTMLCanvasElement>();
  for (const { el } of sections) {
    const canvas = document.createElement('canvas');
    canvas.className = 'shelf-3d';
    canvas.setAttribute('aria-hidden', 'true');
    el.prepend(canvas);
    canvases.set(el, canvas);
  }

  let broken = false;
  const draw = (targets: ReadonlyArray<{ data: ShelfData; el: HTMLElement }>) => {
    for (const { data, el } of targets) {
      const canvas = canvases.get(el);
      if (!canvas || broken) continue;
      let ok = false;
      try {
        ok = renderer.draw(el, canvas, data);
      } catch {
        ok = false;
      }
      if (ok) {
        canvas.classList.add('is-ready');
      } else if (el.getBoundingClientRect().width > 0) {
        // WebGL отказа по средата — махаме 3D навсякъде и показваме простите стъкленици.
        broken = true;
        for (const c of canvases.values()) c.remove();
        fallback(shelves);
      }
    }
  };

  let pending = new Set<HTMLElement>();
  let timer: number | undefined;
  const observer = new ResizeObserver((entries) => {
    for (const e of entries) if (e.target instanceof HTMLElement) pending.add(e.target);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const due = pending;
      pending = new Set();
      draw(sections.filter((s) => due.has(s.el)));
    }, RESIZE_DEBOUNCE_MS);
  });
  for (const { el } of sections) observer.observe(el);
}
