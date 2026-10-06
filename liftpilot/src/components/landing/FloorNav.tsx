'use client';

// The car operating panel of the landing page: one button per floor of the way from the survey to the documents, the
// floor being read lit on the display with the direction of travel. The links work without JavaScript (anchors); the
// script only lights the floor whose section crosses the middle of the window.
import { useEffect, useState } from 'react';

export interface Floor {
  /** the section's id */
  id: string;
  n: number;
  name: string;
}

interface Props {
  floors: readonly Floor[];
  label: string;
}

export default function FloorNav({ floors, label }: Props) {
  const [at, setAt] = useState<{ n: number; up: boolean } | null>(null);

  useEffect(() => {
    const els = floors.map((f) => document.getElementById(f.id)).filter((e): e is HTMLElement => e !== null);
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      const hit = entries.find((e) => e.isIntersecting);
      const n = hit ? floors.find((f) => f.id === hit.target.id)?.n : undefined;
      if (n !== undefined) setAt((prev) => (prev?.n === n ? prev : { n, up: prev === null || n > prev.n }));
    }, { rootMargin: '-45% 0px -50% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [floors]);

  return (
    <nav className="lp-cop" aria-label={label}>
      <div className="lp-cop-display" aria-hidden="true">
        <span className={`lp-cop-arrow${at ? (at.up ? ' up' : ' down') : ''}`}>▲</span>
        <span className="lp-cop-digit">{at ? at.n : '·'}</span>
      </div>
      <ol>
        {[...floors].reverse().map((f) => (
          <li key={f.id}>
            <a href={`#${f.id}`} aria-current={at?.n === f.n ? 'location' : undefined}>
              <span className="lp-cop-key" aria-hidden="true">{f.n}</span>
              <span className="lp-cop-name">{f.name}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
