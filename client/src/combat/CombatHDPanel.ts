/**
 * lil-gui live-tuning panel for the combat photoreal pipeline.
 * Mounts only when `?debug=1` is on the URL. Production users never see it.
 *
 * All sliders mutate refs on the renderer + scene in place; no React
 * re-render is triggered, so the GUI is decoupled from the render loop.
 */

import GUI from 'lil-gui';
import * as THREE from 'three';
import type { RenderBackend, HDTuneables } from './CombatHD';

export function isDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1';
  } catch { return false; }
}

export function mountHDPanel(
  backend: RenderBackend,
  scene: THREE.Scene,
  keyLight: THREE.DirectionalLight | null,
): { dispose: () => void } {
  if (!isDebugMode()) return { dispose: () => {} };
  const gui = new GUI({ title: `Combat · ${backend.kind.toUpperCase()}`, width: 320 });
  gui.domElement.style.position = 'fixed';
  gui.domElement.style.top = '12px';
  gui.domElement.style.right = '12px';
  gui.domElement.style.zIndex = '9999';

  const t: HDTuneables = backend.tuneables;
  const r = backend.renderer;

  // --- Tone + IBL -----------------------------------------------------
  const fTone = gui.addFolder('Tone & IBL');
  fTone.add(t, 'exposure', 0.2, 2.5, 0.01).onChange((v: number) => {
    (r as any).toneMappingExposure = v;
  });
  fTone.add(t, 'iblIntensity', 0.0, 2.0, 0.01).onChange((v: number) => {
    scene.environmentIntensity = v;
  });

  // --- Bloom ----------------------------------------------------------
  if (backend.bloomPass) {
    const fBloom = gui.addFolder('Bloom');
    fBloom.add(t, 'bloomStrength', 0.0, 2.0, 0.01).onChange((v: number) => {
      backend.bloomPass!.strength = v;
    });
    fBloom.add(t, 'bloomRadius', 0.0, 1.5, 0.01).onChange((v: number) => {
      backend.bloomPass!.radius = v;
    });
    fBloom.add(t, 'bloomThreshold', 0.0, 1.0, 0.01).onChange((v: number) => {
      backend.bloomPass!.threshold = v;
    });
  }

  // --- GTAO -----------------------------------------------------------
  if (backend.gtaoPass) {
    const fGtao = gui.addFolder('GTAO');
    fGtao.add({ enabled: backend.gtaoPass.enabled }, 'enabled').onChange((v: boolean) => {
      backend.gtaoPass!.enabled = v;
    });
    fGtao.add(t, 'gtaoRadius', 0.05, 2.0, 0.01).onChange((v: number) => {
      const p = backend.gtaoPass! as any;
      if (p.updateGtaoMaterial) p.updateGtaoMaterial({ radius: v });
    });
    fGtao.add(t, 'gtaoIntensity', 0.0, 5.0, 0.05).onChange((v: number) => {
      const p = backend.gtaoPass! as any;
      if (p.aoMaterial?.uniforms?.intensity) p.aoMaterial.uniforms.intensity.value = v;
    });
  }

  // --- SSR ------------------------------------------------------------
  if (backend.ssrPass) {
    const fSsr = gui.addFolder('SSR');
    fSsr.add({ enabled: backend.ssrPass.enabled }, 'enabled').onChange((v: boolean) => {
      backend.ssrPass!.enabled = v;
    });
    fSsr.add(t, 'ssrThickness', 0.001, 0.1, 0.001).onChange((v: number) => {
      (backend.ssrPass! as any).thickness = v;
    });
    fSsr.add(t, 'ssrOpacity', 0.0, 1.0, 0.01).onChange((v: number) => {
      (backend.ssrPass! as any).opacity = v;
    });
  }

  // --- TAA ------------------------------------------------------------
  if (backend.taaPass) {
    const fTaa = gui.addFolder('TAA');
    fTaa.add({ enabled: backend.taaPass.enabled }, 'enabled').onChange((v: boolean) => {
      backend.taaPass!.enabled = v;
    });
    fTaa.add(t, 'taaSampleLevel', 0, 5, 1).onChange((v: number) => {
      (backend.taaPass! as any).sampleLevel = v;
    });
  }

  // --- Chromatic ------------------------------------------------------
  if (backend.rgbShift) {
    const fChroma = gui.addFolder('Chromatic');
    fChroma.add(t, 'rgbShiftAmount', 0.0, 0.02, 0.0001).onChange((v: number) => {
      backend.rgbShift!.uniforms['amount'].value = v;
    });
  }

  // --- Fog ------------------------------------------------------------
  const fFog = gui.addFolder('Fog');
  fFog.add(t, 'fogNear', 0, 30, 0.5).onChange((v: number) => {
    if (scene.fog && (scene.fog as any).near !== undefined) (scene.fog as any).near = v;
  });
  fFog.add(t, 'fogFar', 5, 60, 0.5).onChange((v: number) => {
    if (scene.fog && (scene.fog as any).far !== undefined) (scene.fog as any).far = v;
  });

  // --- Shadows --------------------------------------------------------
  if (keyLight) {
    const fSh = gui.addFolder('Shadow (key light)');
    fSh.add(keyLight.shadow.mapSize, 'x', [512, 1024, 2048, 4096]).name('map size').onChange((v: number) => {
      keyLight.shadow.mapSize.set(v, v);
      keyLight.shadow.map?.dispose();
      (keyLight.shadow as any).map = null;
    });
    fSh.add(keyLight.shadow, 'bias', -0.005, 0.005, 0.0001);
    fSh.add(keyLight.shadow, 'normalBias', 0.0, 0.1, 0.001);
    fSh.add(keyLight, 'intensity', 0.0, 5.0, 0.05);
  }

  // --- Backend info ---------------------------------------------------
  const fInfo = gui.addFolder('Backend');
  fInfo.add({ kind: backend.kind }, 'kind').disable();
  const stats = { fps: 0, drawCalls: 0 };
  let lastT = performance.now();
  let frames = 0;
  const fpsCtrl = fInfo.add(stats, 'fps').disable();
  const dcCtrl = fInfo.add(stats, 'drawCalls').disable();
  const statsTimer = window.setInterval(() => {
    const now = performance.now();
    const dt = now - lastT;
    stats.fps = Math.round((frames * 1000) / Math.max(1, dt));
    stats.drawCalls = (r as any).info?.render?.calls ?? 0;
    fpsCtrl.updateDisplay();
    dcCtrl.updateDisplay();
    lastT = now;
    frames = 0;
  }, 500);

  // Hook into the renderer to count frames per second.
  const origRender = backend.render;
  backend.render = () => {
    origRender();
    frames++;
  };

  return {
    dispose: () => {
      window.clearInterval(statsTimer);
      try { gui.destroy(); } catch {}
    },
  };
}
