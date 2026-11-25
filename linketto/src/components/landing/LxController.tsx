'use client';

import { useEffect, useRef, useState } from 'react';

// Едно място за всичко „живо“ по лендинга, което иска JS:
//  · бутонът „Спри движението“ (WCAG 2.2.2) → data-lx-motion на корена +
//    събитие `lx:motion` за шейдъра;
//  · курсор-капка (mix-blend: difference), магнитни бутони, 3D наклон на
//    картите, паралакс на hero-то, наклон на лентите по скоростта на скрола.
// Всичко посочващо е само за (pointer: fine) и мълчи при пауза. Един rAF
// цикъл, който спира, когато няма какво да се движи (пази INP/батерията).

const INTERACTIVE = 'a, button, summary, input, label, [data-magnet]';

export function LxController({
  pauseLabel,
  resumeLabel,
}: {
  pauseLabel: string;
  resumeLabel: string;
}) {
  const [paused, setPaused] = useState(false);
  const cursorRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
    const root = document.querySelector<HTMLElement>('[data-lx-root]');
    if (root) root.dataset.lxMotion = paused ? 'off' : 'on';
    window.dispatchEvent(new CustomEvent('lx:motion', { detail: { on: !paused } }));
  }, [paused]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-lx-root]');
    if (!root) return;
    const fine = window.matchMedia('(pointer: fine)').matches;
    const hero = root.querySelector<HTMLElement>('[data-lx-hero]');
    const ribbons = Array.from(root.querySelectorAll<HTMLElement>('.lx-ribbon'));
    const magnets = Array.from(root.querySelectorAll<HTMLElement>('[data-magnet]'));
    const cursor = cursorRef.current;

    let raf = 0;
    let px = 0;
    let py = 0;
    let tpx = 0;
    let tpy = 0;
    let cx = 0;
    let cy = 0;
    let tcx = 0;
    let tcy = 0;
    let skew = 0;
    let skewTarget = 0;
    let lastY = window.scrollY;
    let lastT = performance.now();
    let tiltEl: HTMLElement | null = null;

    const loop = () => {
      raf = 0;
      let busy = false;
      px += (tpx - px) * 0.08;
      py += (tpy - py) * 0.08;
      if (Math.abs(tpx - px) > 0.002 || Math.abs(tpy - py) > 0.002) busy = true;
      hero?.style.setProperty('--px', px.toFixed(3));
      hero?.style.setProperty('--py', py.toFixed(3));

      cx += (tcx - cx) * 0.22;
      cy += (tcy - cy) * 0.22;
      if (cursor) {
        cursor.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
      }
      if (Math.abs(tcx - cx) > 0.3 || Math.abs(tcy - cy) > 0.3) busy = true;

      skewTarget *= 0.9;
      skew += (skewTarget - skew) * 0.2;
      for (const ribbon of ribbons) ribbon.style.setProperty('--skew', `${skew.toFixed(2)}deg`);
      if (Math.abs(skew) > 0.02 || Math.abs(skewTarget) > 0.02) busy = true;

      if (busy) raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const onScroll = () => {
      if (pausedRef.current) return;
      const now = performance.now();
      const dy = window.scrollY - lastY;
      const dt = Math.max(now - lastT, 8);
      lastY = window.scrollY;
      lastT = now;
      // пространствен наклон до ±7°, не по-бърз от самия скрол на потребителя
      skewTarget = Math.max(-7, Math.min(7, (dy / dt) * -1.6));
      kick();
    };

    const resetTilt = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    };

    const onMove = (event: PointerEvent) => {
      if (pausedRef.current || event.pointerType === 'touch') return;
      tcx = event.clientX;
      tcy = event.clientY;
      if (cursor) {
        cursor.classList.add('is-live');
        const target = event.target as Element | null;
        cursor.classList.toggle('is-big', Boolean(target?.closest(INTERACTIVE)));
      }
      tpx = (event.clientX / window.innerWidth) * 2 - 1;
      tpy = (event.clientY / window.innerHeight) * 2 - 1;

      for (const el of magnets) {
        const rect = el.getBoundingClientRect();
        const mx = rect.left + rect.width / 2;
        const my = rect.top + rect.height / 2;
        const dx = event.clientX - mx;
        const dy = event.clientY - my;
        const near = Math.hypot(dx, dy) < Math.max(rect.width, rect.height) * 0.9 + 40;
        el.style.setProperty('--mx', near ? `${(dx * 0.32).toFixed(1)}px` : '0px');
        el.style.setProperty('--my', near ? `${(dy * 0.32).toFixed(1)}px` : '0px');
      }

      const card = (event.target as Element | null)?.closest<HTMLElement>('[data-tilt]') ?? null;
      if (card !== tiltEl) {
        resetTilt(tiltEl);
        tiltEl = card;
      }
      if (card) {
        const rect = card.getBoundingClientRect();
        const nx = (event.clientX - rect.left) / rect.width - 0.5;
        const ny = (event.clientY - rect.top) / rect.height - 0.5;
        card.style.setProperty('--ry', `${(nx * 9).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${(ny * -9).toFixed(2)}deg`);
      }
      kick();
    };
    const onLeave = () => {
      cursor?.classList.remove('is-live');
      resetTilt(tiltEl);
      tiltEl = null;
      for (const el of magnets) {
        el.style.setProperty('--mx', '0px');
        el.style.setProperty('--my', '0px');
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    if (fine) {
      window.addEventListener('pointermove', onMove, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
    }
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div ref={cursorRef} aria-hidden className="lx-cursor" />
      <button
        type="button"
        className="lx-pause"
        data-paused={paused}
        onClick={() => setPaused((value) => !value)}
        aria-label={paused ? resumeLabel : pauseLabel}
      >
        {/* На телефон — само икона (не покрива картите в героя); текстът остава за четците. */}
        <span aria-hidden className="lx-pause-icon">
          {paused ? '▶' : '❚❚'}
        </span>
        <span className="lx-pause-text">{paused ? resumeLabel : pauseLabel}</span>
      </button>
    </>
  );
}
