'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

type Line = { title: string; body: string };
type Props = { lines: Line[]; poster: string };

/** Кадрите са рендери на арената в Blender: на телефон са наполовина по брой и по-малки. */
const WIDE = { folder: '/thraex/descent/d', count: 96 };
const NARROW = { folder: '/thraex/descent/m', count: 48 };
const PARALLEL = 5;
const HOLD = 0.07;
const FADE = 0.05;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Първо през 16 кадъра, после все по-гъсто: превъртането работи, докато още се зарежда. */
function loadOrder(total: number): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  for (let step = 16; step >= 1; step = Math.floor(step / 2)) {
    for (let index = 0; index < total; index += step) {
      if (!seen.has(index)) {
        seen.add(index);
        order.push(index);
      }
    }
  }
  return order;
}

/**
 * Спускането в арената: кадрите следват превъртането върху canvas.
 *
 * Без JavaScript, при намалено движение и при пестене на данни страницата остава
 * проста: един кадър и изреченията едно под друго. Затова закачането се включва
 * от кода, а не е по подразбиране в разметката.
 */
export function ThraexDescent({ lines, poster }: Props) {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saving = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (!calm && !saving) setLive(true);
  }, []);

  useEffect(() => {
    if (!live || !section.current || !canvas.current) return;
    const area = section.current;
    const surface = canvas.current;
    const context = surface.getContext('2d', { alpha: true });
    if (!context) return;
    const source = window.matchMedia('(max-width: 767px)').matches ? NARROW : WIDE;
    const images: (HTMLImageElement | undefined)[] = new Array(source.count).fill(undefined);
    let stopped = false;
    let queued = false;
    let drawn: HTMLImageElement | undefined;

    function nearest(index: number) {
      for (let distance = 0; distance < source.count; distance += 1) {
        const image = images[index - distance] ?? images[index + distance];
        if (image) return image;
      }
      return undefined;
    }

    function paint() {
      queued = false;
      const rect = area.getBoundingClientRect();
      const progress = clamp(-rect.top / Math.max(1, rect.height - window.innerHeight));
      const image = nearest(Math.round(progress * (source.count - 1)));
      if (image && image !== drawn) {
        const scale = Math.max(surface.width / image.naturalWidth, surface.height / image.naturalHeight);
        const width = surface.width / scale;
        const height = surface.height / scale;
        context?.drawImage(image, (image.naturalWidth - width) / 2, (image.naturalHeight - height) / 2, width, height, 0, 0, surface.width, surface.height);
        drawn = image;
      }
      items.current.forEach((item, index) => {
        if (!item) return;
        const offset = progress - (index + 0.5) / lines.length;
        const opacity = clamp(1 - (Math.abs(offset) - HOLD) / FADE);
        item.style.opacity = String(opacity);
        item.style.visibility = opacity > 0 ? 'visible' : 'hidden';
        item.style.transform = `translate3d(0, ${(-offset * 180).toFixed(1)}px, 0)`;
      });
    }

    function request() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    }

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      surface.width = Math.round(surface.clientWidth * ratio);
      surface.height = Math.round(surface.clientHeight * ratio);
      drawn = undefined;
      request();
    }

    const order = loadOrder(source.count);
    let cursor = 0;
    function pump() {
      if (stopped || cursor >= order.length) return;
      const index = order[cursor] as number;
      cursor += 1;
      const image = new window.Image();
      image.decoding = 'async';
      image.onload = () => {
        images[index] = image;
        request();
        pump();
      };
      image.onerror = pump;
      image.src = `${source.folder}/f${String(index).padStart(3, '0')}.webp`;
    }

    // Кадрите тръгват едва когато секцията наближи: иначе героят чака за чужда работа.
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        watcher.disconnect();
        for (let slot = 0; slot < PARALLEL; slot += 1) pump();
      },
      { rootMargin: '120% 0px' },
    );
    watcher.observe(area);
    resize();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', resize);
    return () => {
      stopped = true;
      watcher.disconnect();
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', resize);
    };
  }, [live, lines.length]);

  return (
    <section ref={section} className="thraex-bleed relative" style={live ? { height: '500vh' } : undefined}>
      <div className={live ? 'sticky top-0 h-[100dvh] overflow-hidden' : 'relative isolate overflow-hidden'}>
        <Image src={poster} alt="" fill sizes="100vw" className={`object-cover ${live ? '' : '-z-20'}`} />
        <canvas ref={canvas} aria-hidden="true" className={`absolute inset-0 h-full w-full ${live ? '' : 'hidden'}`} />
        <div aria-hidden="true" className={`absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/15 to-ink-950/35 ${live ? '' : '-z-10'}`} />
        <ol className={live ? 'absolute inset-0' : 'relative mx-auto max-w-site space-y-20 px-4 py-28 sm:px-6'}>
          {lines.map((line, index) => (
            <li
              key={line.title}
              ref={(element) => {
                items.current[index] = element;
              }}
              className={live ? `absolute inset-x-0 bottom-[9%] mx-auto flex max-w-[110rem] flex-col px-5 sm:px-10 ${index % 2 ? 'items-end text-end' : 'items-start'}` : ''}
              style={live ? { opacity: 0, visibility: 'hidden' } : undefined}
            >
              <p className="thraex-beat max-w-[17ch] font-display font-bold text-ivory-100">{line.title}</p>
              <p className="lead mt-4 text-ivory-200">{line.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
