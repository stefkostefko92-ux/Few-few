import { useEffect, useRef, useState } from 'react';

/**
 * Наблюдава видимостта на елемент през IntersectionObserver — за да паузираме
 * тежките canvas/SVG rAF лупове, докато ефектът е извън екрана (пести GPU/батерия).
 * `margin` разширява наблюдавания правоъгълник, за да стартираме малко преди да се види.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  margin = '160px',
): [React.MutableRefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);

  return [ref, inView];
}
