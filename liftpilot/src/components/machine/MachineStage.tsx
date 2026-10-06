'use client';

import { useEffect, useRef, useState } from 'react';
import type { MachineHandle } from './boot';

export interface StagePicture {
  alt: string;
  /** missing: the page writes the caption itself (the landing's hero, under the checks docked on the picture) */
  caption?: string;
}

// The poster is the same frame the 3D stage starts from (scripts/render-poster.mjs), so the switch is seamless.
const POSTER = { src: '/img/argano-machine-1200.webp', srcSet: '/img/argano-machine-800.webp 800w, /img/argano-machine-1200.webp 1200w, /img/argano-machine-1800.webp 1800w', width: 1200, height: 900 };

interface Props extends StagePicture {
  /** Live 3D on top of the picture (landing); false keeps the still (sign-in, which people open every day). */
  live?: boolean;
  priority?: boolean;
  sizes: string;
}

// Progressive enhancement: the picture is plain HTML and always there; three.js loads only on a screen with a mouse,
// after the reader's first movement, click or key (nothing heavy runs while the page loads), when the stage is on
// screen, the browser is idle and nobody asked for less motion or less data. A touch screen keeps the picture, the same
// frame. Any failure keeps the picture.
export default function MachineStage({ alt, caption, live = true, priority = false, sizes }: Props) {
  const stageRef = useRef<HTMLElement>(null), canvasRef = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const stage = stageRef.current, canvas = canvasRef.current;
    if (!live || !stage || !canvas) return;
    // Hook for the poster renderer only; nothing on the page sets it.
    const still = Reflect.get(window, '__arganoStill') === true;
    const connection: unknown = Reflect.get(navigator, 'connection');
    const saveData = typeof connection === 'object' && connection !== null && Reflect.get(connection, 'saveData') === true;
    if (!still && (matchMedia('(prefers-reduced-motion: reduce)').matches || saveData || !matchMedia('(pointer: fine)').matches)) return;

    const controller = new AbortController();
    // the poster renderer starts at once; a reader, at the first sign of one
    let handle: MachineHandle | null = null, visible = false, started = false, engaged = still;
    const sync = (): void => handle?.setActive(visible && document.visibilityState === 'visible');
    const start = (): void => {
      if (started) return;
      started = true;
      const idle = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback : (cb: () => void) => window.setTimeout(cb, 300);
      idle(() => {
        import('./boot')
          .then((m) => m.bootMachine(canvas, { signal: controller.signal, still, onReady: () => setRunning(true), onFail: () => setRunning(false) }))
          .then((h) => {
            if (controller.signal.aborted) h?.dispose();
            else if (h) { handle = h; sync(); }
          })
          .catch(() => setRunning(false));
      });
    };
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible && engaged) start();
      sync();
    }, { rootMargin: '120px' });
    io.observe(stage);
    const engage = (): void => {
      engaged = true;
      if (visible) start();
    };
    for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const) {
      window.addEventListener(type, engage, { once: true, passive: true, signal: controller.signal });
    }
    document.addEventListener('visibilitychange', sync);
    return () => {
      controller.abort();
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      handle?.dispose();
      handle = null;
    };
  }, [live]);

  return (
    <figure ref={stageRef} className={`stage${running ? ' is-live' : ''}`}>
      <div className="stage-frame">
        {/* Pre-sized WebP set (scripts/render-poster.mjs); no image optimizer at runtime. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="stage-poster" src={POSTER.src} srcSet={POSTER.srcSet} sizes={sizes} width={POSTER.width} height={POSTER.height} alt={alt}
          decoding="async" fetchPriority={priority ? 'high' : 'auto'} loading={priority ? 'eager' : 'lazy'} />
        {live ? <canvas ref={canvasRef} className="stage-canvas" aria-hidden="true" /> : null}
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
