/**
 * Dev-only live graphics tuning panel (lil-gui). Opt-in: press the backtick/
 * tilde key (`) or load any game with ?gfx=1. Lazy-imports lil-gui so it adds
 * nothing to the normal player bundle, and drives the currently mounted scene's
 * RenderCore params (exposure, tone mapping, IBL, shadows, AA, bloom, AO, SSR).
 */
import { activeCore } from "./gfxRegistry.js";

let panel: { destroy: () => void } | null = null;
let installed = false;

async function openPanel(): Promise<void> {
  const core = activeCore();
  if (!core || panel) return;
  const { GUI } = await import("lil-gui");
  const gui = new GUI({ title: "Графика (RenderCore)" });
  panel = gui;
  const p = core.params;
  const live = () => core.applyParams();
  const rebuild = () => core.applyParams({ rebuild: true });

  gui.add({ renderer: core.isWebGPU ? "WebGPU" : "WebGL2" }, "renderer").name("Рендерер").disable();

  const tone = gui.addFolder("Тон / Експозиция");
  tone.add(p, "toneMapping").name("ACES tone map").onChange(live);
  tone.add(p, "exposure", 0.2, 2.5, 0.01).name("Експозиция").onChange(live);
  tone.add(p, "environment", 0, 3, 0.05).name("IBL интензитет").onChange(live);
  tone.add(p, "shadows").name("Сенки").onChange(live);

  const aa = gui.addFolder("Anti-aliasing");
  aa.add(p, "aa", ["TAA", "SMAA", "none"]).name("Режим").onChange(rebuild);

  const bloom = gui.addFolder("Bloom");
  bloom.add(p.bloom, "enabled").name("Вкл.").onChange(rebuild);
  bloom.add(p.bloom, "strength", 0, 1.5, 0.01).name("Сила").onChange(live);
  bloom.add(p.bloom, "radius", 0, 1.5, 0.01).name("Радиус").onChange(live);
  bloom.add(p.bloom, "threshold", 0, 2, 0.01).name("Праг").onChange(live);

  const ao = gui.addFolder("Ambient Occlusion (GTAO)");
  ao.add(p.ao, "enabled").name("Вкл.").onChange(rebuild);
  ao.add(p.ao, "radius", 0.05, 2, 0.01).name("Радиус").onChange(live);
  ao.add(p.ao, "intensity", 0, 3, 0.05).name("Интензитет").onChange(live);

  const ssr = gui.addFolder("Reflections (SSR)");
  ssr.add(p.ssr, "enabled").name("Вкл.").onChange(rebuild);
}

function closePanel(): void {
  panel?.destroy();
  panel = null;
}

function toggle(): void {
  if (panel) closePanel();
  else void openPanel();
}

/** Wire the opt-in triggers once. Safe to call repeatedly. */
export function installGfxPanel(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("keydown", (e) => {
    // Backtick / tilde, ignored while typing in a field.
    if (e.code !== "Backquote") return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
    e.preventDefault();
    toggle();
  });
  if (new URLSearchParams(location.search).has("gfx")) {
    // Defer so a scene's RenderCore has time to register.
    setTimeout(() => void openPanel(), 800);
  }
}
