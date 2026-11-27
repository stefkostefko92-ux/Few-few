// Свързва 3D семената с плочките: <canvas> във всяка .tile-scene и .legend-scene, рисуване една по
// една (първо видимите), прерисуване при смяна на размера. Без WebGL остава CSS силуетът на семето.
import type { SceneData } from './data.js';
import { SeedRenderer, type SeedSceneSpec } from './seeds3d.js';

const SINGLE = [{ x: 0, z: 0, yaw: -0.35, tilt: 0 }];

interface Target {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  spec: SeedSceneSpec;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function mountSeeds(scene: SceneData): void {
  const targets: Target[] = [];
  const add = (el: Element | null, spec: SeedSceneSpec) => {
    if (!(el instanceof HTMLElement)) return;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    el.append(canvas);
    targets.push({ el, canvas, spec });
  };
  for (const t of scene.tiles) {
    add(document.querySelector(`[data-scene="${t.id}"]`), {
      type: t.type,
      decay: t.decay,
      dead: t.dead,
      layout: t.layout,
      seed: t.id,
    });
  }
  scene.legend.forEach((l, i) => {
    add(document.querySelector(`[data-legend="${CSS.escape(l.stage)}"]`), {
      type: scene.legendType,
      decay: l.decay,
      dead: l.dead,
      layout: SINGLE,
      seed: 9000 + i,
    });
  });
  if (targets.length === 0) return;

  const renderer = SeedRenderer.create();
  if (!renderer) {
    for (const t of targets) t.canvas.remove();
    return;
  }

  // Опашка: една сцена на кадър, за да не замръзва страницата при много партиди.
  const queue = new Set<Target>();
  let running = false;
  let broken = false;
  const pump = async () => {
    if (running) return;
    running = true;
    while (queue.size > 0 && !broken) {
      const [t] = queue;
      if (!t) break;
      queue.delete(t);
      await nextFrame();
      let ok = false;
      try {
        ok = renderer.draw(t.canvas, t.spec);
      } catch {
        ok = false;
      }
      if (ok) {
        t.canvas.classList.add('is-ready');
        t.el.classList.add('has-3d');
      } else if (t.canvas.clientWidth > 0) {
        // WebGL отказа (загубен контекст): остават CSS силуетите навсякъде.
        broken = true;
        for (const x of targets) {
          x.canvas.remove();
          x.el.classList.remove('has-3d');
        }
      }
    }
    running = false;
  };

  const byEl = new Map(targets.map((t) => [t.el, t]));
  const visible = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const t = byEl.get(e.target as HTMLElement);
        if (!t || !e.isIntersecting) continue;
        visible.unobserve(e.target);
        queue.add(t);
        resized.observe(t.el);
      }
      void pump();
    },
    { rootMargin: '300px 0px' },
  );
  // Прерисуване само при реална смяна на ширината (първото наблюдение е самото начало — пропуска се).
  const widths = new Map<Element, number>();
  let timer: number | undefined;
  const resized = new ResizeObserver((entries) => {
    let changed = false;
    for (const e of entries) {
      const w = Math.round(e.contentRect.width);
      const before = widths.get(e.target);
      widths.set(e.target, w);
      const t = byEl.get(e.target as HTMLElement);
      if (before !== undefined && before !== w && t) {
        queue.add(t);
        changed = true;
      }
    }
    if (!changed) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void pump(), 160);
  });
  for (const t of targets) visible.observe(t.el);
}
