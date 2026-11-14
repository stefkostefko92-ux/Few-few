'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type Props = { label: string; lead: ReactNode; children: ReactNode };

/**
 * Лента с плакатите. На голям екран вертикалното превъртане я движи хоризонтално.
 * На телефон и при намалено движение е обикновена лента с плъзгане.
 */
export function ThraexRail({ label, lead, children }: Props) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px) and (prefers-reduced-motion: no-preference)');
    const apply = () => setPinned(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const area = section.current;
    const strip = track.current;
    if (!area || !strip) return;
    if (!pinned) {
      area.style.height = '';
      strip.style.transform = '';
      return;
    }
    let queued = false;

    function paint() {
      queued = false;
      if (!area || !strip) return;
      const travel = strip.scrollWidth - window.innerWidth;
      const rect = area.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height - window.innerHeight)));
      strip.style.transform = `translate3d(${(-progress * travel).toFixed(1)}px, 0, 0)`;
    }

    function request() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    }

    function measure() {
      if (!area || !strip) return;
      area.style.height = `${strip.scrollWidth - window.innerWidth + window.innerHeight}px`;
      request();
    }

    // Плакатите се зареждат след изчисляването: размерът им е фиксиран, но шрифтът може да смени ширината на първата карта.
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    measure();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', measure);
    };
  }, [pinned]);

  return (
    <section ref={section} className="thraex-bleed relative" aria-label={label}>
      {/* На телефон заглавието стои над лентата, иначе първият екран е празно поле с текст. */}
      {pinned ? null : <div className="px-5 pt-20 sm:px-10">{lead}</div>}
      <div
        className={pinned ? 'sticky top-0 flex h-[100dvh] items-center overflow-hidden' : 'snap-x snap-mandatory overflow-x-auto pb-16 pt-10'}
        tabIndex={pinned ? undefined : 0}
        role={pinned ? undefined : 'group'}
        aria-label={pinned ? undefined : label}
      >
        <div ref={track} className="flex w-max items-stretch gap-4 pe-[8vw] ps-4 will-change-transform sm:gap-6 sm:ps-10">
          {pinned ? <div className="flex w-[46rem] shrink-0 flex-col justify-center">{lead}</div> : null}
          {children}
        </div>
      </div>
    </section>
  );
}
