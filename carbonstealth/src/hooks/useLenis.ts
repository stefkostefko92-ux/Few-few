import { useEffect } from 'react';
import Lenis from 'lenis';
import { setLenis } from '@/lib/scroll';

/**
 * Плавен инерционен скрол (Lenis).
 * Забележка: по изрично нареждане на собственика НЯМА reduced-motion изключване —
 * Lenis работи за всички. На touch устройства оставяме нативния скрол
 * (smoothTouch=false) за да не чупим импулса на мобилните браузъри.
 */
export function useLenis(): void {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });
    setLenis(lenis);

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      setLenis(null);
      lenis.destroy();
    };
  }, []);
}
