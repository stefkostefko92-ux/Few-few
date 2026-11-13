'use client';

import { useEffect, useRef } from 'react';

type Props = { src: string; poster: string; fallback: string; label: string };

/**
 * Цялото видео от екрана при зареждане, от ръб до ръб.
 *
 * Тръгва без звук, щом се види, и спира, щом излезе от екрана. Спряно от човек
 * остава спряно. Контролите са на браузъра (WCAG 2.2.2). При намалено движение и
 * пестене на данни изобщо не тръгва само.
 */
export function ThraexFilm({ src, poster, fallback, label }: Props) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.muted = true;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saving = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (calm || saving) return;
    let stoppedByPerson = false;
    let stoppingOurselves = false;

    function onPause() {
      if (stoppingOurselves) stoppingOurselves = false;
      else if (!element?.ended) stoppedByPerson = true;
    }

    element.addEventListener('pause', onPause);
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (stoppedByPerson || !entry) return;
        if (entry.isIntersecting) {
          element.play().catch(() => undefined);
        } else if (!element.paused) {
          stoppingOurselves = true;
          element.pause();
        }
      },
      { threshold: 0.45 },
    );
    watcher.observe(element);
    return () => {
      watcher.disconnect();
      element.removeEventListener('pause', onPause);
    };
  }, []);

  return (
    <video ref={video} className="block aspect-video w-full bg-black object-cover" controls muted loop playsInline preload="none" poster={poster} aria-label={label}>
      <source src={src} type="video/webm" />
      {fallback}
    </video>
  );
}
