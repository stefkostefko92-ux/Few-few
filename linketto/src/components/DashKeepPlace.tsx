'use client';

import { useEffect } from 'react';

const KEY = 'linketto:dash-place';

/**
 * След „Запази“ таблото остава там, където си бил: при изпращане на форма
 * помни реда (блок) или раздела и отместването му от горния край; след
 * отговора на сървъра (нов `rev`) връща същото място. При грешка (?error=)
 * не връща — съобщението е горе и трябва да се види.
 */
export function DashKeepPlace({ rev }: { rev: string }) {
  useEffect(() => {
    const onSubmit = (event: Event) => {
      const form = event.target as HTMLElement | null;
      if (!form?.closest?.('#main')) return;
      const row = form.closest<HTMLElement>('li[data-id]');
      const section = form.closest<HTMLElement>('section[id]');
      const anchor = row ?? section;
      if (!anchor) return;
      try {
        sessionStorage.setItem(
          KEY,
          JSON.stringify({
            row: row?.dataset.id ?? null,
            section: section?.id ?? null,
            top: anchor.getBoundingClientRect().top,
            at: Date.now(),
          }),
        );
      } catch {
        // без sessionStorage (частен режим) — просто без връщане
      }
    };
    document.addEventListener('submit', onSubmit, true);
    return () => document.removeEventListener('submit', onSubmit, true);
  }, []);

  useEffect(() => {
    let saved: { row: string | null; section: string | null; top: number; at: number } | null = null;
    try {
      const raw = sessionStorage.getItem(KEY);
      sessionStorage.removeItem(KEY);
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      saved = null;
    }
    if (!saved || Date.now() - saved.at > 60_000) return;
    if (new URLSearchParams(window.location.search).has('error')) return;
    const place = saved;
    const restore = () => {
      const el =
        (place.row && document.querySelector<HTMLElement>(`li[data-id="${CSS.escape(place.row)}"]`)) ||
        (place.section && document.getElementById(place.section));
      if (!el) return;
      window.scrollBy({ top: el.getBoundingClientRect().top - place.top, behavior: 'instant' });
    };
    // След като рутерът е приключил своя скрол.
    requestAnimationFrame(() => requestAnimationFrame(restore));
  }, [rev]);

  return null;
}
