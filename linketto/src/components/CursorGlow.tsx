'use client';

import { useEffect, useRef } from 'react';

// Прожектор, който следва курсора из целия сайт (mix-blend: screen — свети
// само върху тъмните секции). Лек: един слушател на pointermove, дроселиран
// през requestAnimationFrame (пази INP), нула външни зависимости. Само за
// посочващи устройства с курсор (мишка/трекпад) — на тъч няма курсор.
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    let raf = 0;
    const onMove = (event: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        el.style.setProperty('--mx', `${event.clientX}px`);
        el.style.setProperty('--my', `${event.clientY}px`);
        el.classList.add('is-live');
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} aria-hidden className="cursor-glow" />;
}
