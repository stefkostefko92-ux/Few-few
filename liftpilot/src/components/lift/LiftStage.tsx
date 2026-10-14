'use client';

// The 3D stage of an installation: three.js loads only here, lazily; the scene is built from the derived design and
// rebuilt a moment after the data stop changing; the render loop runs only while the stage is on screen and the tab
// visible. Without WebGPU or WebGL the stage says so and the charts carry the simulation. The canvas takes the keyboard
// (arrows pan, Shift or Ctrl with them orbit, + and − zoom); a view chosen again brings its framing back.
import { useEffect, useRef, useState } from 'react';
import type { LiftDerived } from '@/lib/lift';
import type { LiftHandle, View } from '../lift3d/boot';
import type { SimClock } from './clock';

interface Props {
  derived: LiftDerived;
  clock: SimClock;
  view: View;
  /** counts the times a view was chosen: the same view again goes back to its framing */
  reset?: number;
  zones: boolean;
  label: string;
  texts: { loading: string; failed: string; keys: string };
}

const REBUILD_MS = 450;

export default function LiftStage({ derived, clock, view, reset = 0, zones, label, texts }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null), wrapRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<LiftHandle | null>(null), viewRef = useRef(view), zonesRef = useRef(zones);
  const [state, setState] = useState<'loading' | 'live' | 'failed'>('loading');
  const designRef = useRef(derived), first = useRef(true);

  // the stage boots once per clock; a changed design swaps the world a moment after the data stop changing
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const controller = new AbortController();
    let visible = true, handle: LiftHandle | null = null;
    const sync = (): void => handle?.setActive(visible && document.visibilityState === 'visible');
    const booted = designRef.current, motion = matchMedia('(prefers-reduced-motion: reduce)');
    // the setting changed while the stage is up: the camera follows it
    motion.addEventListener('change', (e) => handle?.setReducedMotion(e.matches), { signal: controller.signal });
    import('../lift3d/boot')
      .then((m) => m.bootLift(canvas, booted, {
        signal: controller.signal, clock, view: viewRef.current, reducedMotion: motion.matches,
        onReady: () => setState('live'), onFail: () => setState('failed'),
      }))
      .then((h) => {
        if (controller.signal.aborted) { h?.dispose(); return; }
        if (!h) { setState('failed'); return; }
        handle = h;
        handleRef.current = h;
        h.setZones(zonesRef.current);
        // the data changed while the stage was loading: put on the latest
        if (designRef.current !== booted) void h.setDesign(designRef.current);
        sync();
      })
      .catch(() => setState('failed'));
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      sync();
    }, { rootMargin: '80px' });
    io.observe(wrap);
    document.addEventListener('visibilitychange', sync);
    return () => {
      controller.abort();
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      handle?.dispose();
      handleRef.current = null;
    };
  }, [clock]);

  useEffect(() => {
    designRef.current = derived;
    if (first.current) { first.current = false; return; }
    const timer = window.setTimeout(() => { void handleRef.current?.setDesign(derived); }, REBUILD_MS);
    return () => window.clearTimeout(timer);
  }, [derived]);

  useEffect(() => {
    viewRef.current = view;
    handleRef.current?.setView(view);
  }, [view, reset]);
  useEffect(() => {
    zonesRef.current = zones;
    handleRef.current?.setZones(zones);
  }, [zones]);

  return (
    <div ref={wrapRef} className={`lift-stage ${state}`}>
      <canvas ref={canvasRef} aria-label={`${label}. ${texts.keys}`} role="application" tabIndex={0} />
      {state !== 'live' ? <p className="stage-note" role="status">{state === 'failed' ? texts.failed : texts.loading}</p> : null}
    </div>
  );
}
