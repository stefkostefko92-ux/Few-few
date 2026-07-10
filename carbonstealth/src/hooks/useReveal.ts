import { useEffect, useRef } from 'react';

/**
 * Scroll-driven разкриване чрез IntersectionObserver (GPU-евтино, без main-thread
 * scroll listener). Добавя класа `is-in` когато елементът влезе във viewport.
 * Работи и на контейнер: всички наследници с .cs-reveal се разкриват на каскади.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options?: { stagger?: number; threshold?: number },
) {
  const ref = useRef<T | null>(null);
  const stagger = options?.stagger ?? 60;
  const threshold = options?.threshold ?? 0.15;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets = root.classList.contains('cs-reveal')
      ? [root]
      : Array.from(root.querySelectorAll<HTMLElement>('.cs-reveal'));

    if (targets.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const i = targets.indexOf(el);
            el.style.transition = `opacity .7s cubic-bezier(0.16,1,0.3,1) ${
              i * stagger
            }ms, transform .7s cubic-bezier(0.16,1,0.3,1) ${i * stagger}ms`;
            el.classList.add('is-in');
            io.unobserve(el);
          }
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );

    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [stagger, threshold]);

  return ref;
}
