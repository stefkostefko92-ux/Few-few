import React, { useEffect, useRef } from 'react';

/**
 * Mounts a cluster of cinematic landing-page effects:
 *  - cursor-following particle trail
 *  - mouse-tracked parallax background layers
 *  - intersection-observer driven scroll reveals
 *  - 3D tilt for feature/set/region cards
 *  - animated gradient mesh
 */
export default function LandingEffects(): React.ReactElement | null {
  const trailRef = useRef<HTMLDivElement>(null);

  // Cursor particle trail
  useEffect(() => {
    const layer = trailRef.current;
    if (!layer) return;
    const sparks: HTMLDivElement[] = [];
    let lastSpawn = 0;
    function onMove(e: MouseEvent) {
      const now = performance.now();
      if (now - lastSpawn < 18) return;
      lastSpawn = now;
      const s = document.createElement('div');
      s.className = 'cursor-spark';
      s.style.left = `${e.clientX}px`;
      s.style.top = `${e.clientY}px`;
      const tx = (Math.random() - 0.5) * 40;
      const ty = (Math.random() - 0.5) * 40 - 10;
      s.style.setProperty('--tx', `${tx}px`);
      s.style.setProperty('--ty', `${ty}px`);
      layer!.appendChild(s);
      sparks.push(s);
      setTimeout(() => {
        s.remove();
        sparks.shift();
      }, 900);
    }
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Parallax background layers
  useEffect(() => {
    const layers = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
    if (layers.length === 0) return;
    function onMove(e: MouseEvent) {
      const cx = e.clientX / window.innerWidth - 0.5;
      const cy = e.clientY / window.innerHeight - 0.5;
      for (const el of layers) {
        const depth = Number(el.dataset.parallax || '0');
        el.style.transform = `translate3d(${-cx * depth}px, ${-cy * depth}px, 0)`;
      }
    }
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Scroll reveals
  useEffect(() => {
    const targets = document.querySelectorAll('[data-reveal]');
    if (targets.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('revealed');
            obs.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    targets.forEach((t) => obs.observe(t));
    return () => obs.disconnect();
  }, []);

  // 3D tilt on cards
  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-tilt]'));
    if (cards.length === 0) return;
    function enter(this: HTMLElement) { this.style.transition = 'transform .12s ease-out'; }
    function move(this: HTMLElement, e: MouseEvent) {
      const rect = this.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      const intensity = 10;
      this.style.transform = `perspective(900px) rotateY(${x * intensity}deg) rotateX(${-y * intensity}deg) translateY(-4px)`;
      // Highlight follows cursor
      const hl = this.querySelector<HTMLElement>('.tilt-glare');
      if (hl) {
        hl.style.background = `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(255,255,255,.18), transparent 50%)`;
      }
    }
    function leave(this: HTMLElement) {
      this.style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1)';
      this.style.transform = 'perspective(900px) rotateY(0) rotateX(0) translateY(0)';
      const hl = this.querySelector<HTMLElement>('.tilt-glare');
      if (hl) hl.style.background = 'transparent';
    }
    for (const c of cards) {
      c.addEventListener('mouseenter', enter as any);
      c.addEventListener('mousemove', move as any);
      c.addEventListener('mouseleave', leave as any);
      // Add the glare overlay
      if (!c.querySelector('.tilt-glare')) {
        const g = document.createElement('div');
        g.className = 'tilt-glare';
        c.appendChild(g);
      }
    }
    return () => {
      for (const c of cards) {
        c.removeEventListener('mouseenter', enter as any);
        c.removeEventListener('mousemove', move as any);
        c.removeEventListener('mouseleave', leave as any);
      }
    };
  }, []);

  return (
    <>
      <div className="cursor-trail" ref={trailRef} />
      <div className="gradient-mesh" aria-hidden="true">
        <div className="mesh-blob mesh-1" />
        <div className="mesh-blob mesh-2" />
        <div className="mesh-blob mesh-3" />
        <div className="mesh-blob mesh-4" />
      </div>
      <div className="landing-grid" aria-hidden="true" />
    </>
  );
}
