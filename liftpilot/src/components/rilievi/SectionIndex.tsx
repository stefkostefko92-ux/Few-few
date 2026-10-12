'use client';

// The index of the sheet's sections (rilievi _index.ejs + app.js): beside the form or the sheet on a wide screen, with
// the paper form's numbers; its links go to `#s-<section>` and work without JavaScript. With it, the first section on
// the screen is marked (aria-current) as the page scrolls.
import { useEffect, useRef } from 'react';

export default function SectionIndex({ label, titles }: { label: string; titles: readonly { key: string; title: string }[] }) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const box = nav.current;
    if (!box || !('IntersectionObserver' in window)) return;
    const links = new Map(Array.from(box.querySelectorAll<HTMLAnchorElement>('a[href^="#s-"]'), (a) => [a.hash.slice(1), a]));
    const onScreen = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) onScreen.add(e.target.id);
        else onScreen.delete(e.target.id);
      }
      const first = Array.from(links.keys()).find((id) => onScreen.has(id));
      links.forEach((a, id) => (id === first ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    }, { rootMargin: '-16px 0px -55% 0px' });
    links.forEach((_, id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, []);
  return (
    <nav ref={nav} className="rv-index" aria-label={label}>
      <p className="rv-index-title" aria-hidden="true">{label}</p>
      <ol>
        {titles.map((s, i) => (
          <li key={s.key}><a href={`#s-${s.key}`}><span className="rv-secnum" aria-hidden="true">{i + 1}</span><span>{s.title}</span></a></li>
        ))}
      </ol>
    </nav>
  );
}
