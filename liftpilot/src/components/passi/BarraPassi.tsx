'use client';

// The steps of a form, «passo per passo» (round 52): the bar over it — every step with what it still needs or its ✓,
// the step now (the first one still needing something) marked and named in the live line — and the same step now in the
// save bar, always in view while the form scrolls. A step's link goes to its first value still to enter, opening the
// group it is in; with nothing missing there, to the step's own section (src/lib/passi.ts).
import type { MouseEvent, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { passoOra, type Passo } from '@/lib/passi';
import { goToField } from '../MissingPanel';

/** Opens the closed groups round an element and its own, if it is one. */
function apri(el: HTMLElement): void {
  for (let p: HTMLElement | null = el; p; p = p.parentElement) if (p instanceof HTMLDetailsElement) p.open = true;
}

/** To the step's first value still to enter; else to its section by the link itself (the section is the page's target,
 *  its groups opened first), and a box that lays out its children only — the installation's results on a phone — by its
 *  first child. */
export function vaiAlPasso(p: Passo, e: MouseEvent): void {
  if (p.primo && document.getElementById(p.primo)) {
    e.preventDefault();
    goToField(p.primo);
    return;
  }
  const el = document.getElementById(p.id);
  if (!el) return;
  apri(el);
  if (getComputedStyle(el).display === 'contents' && el.firstElementChild instanceof HTMLElement) {
    e.preventDefault();
    el.firstElementChild.scrollIntoView({ block: 'start' });
  }
}

/** A section's number, as the bar gives it (decorative: the section's title names it). */
export function NumeroPasso({ n }: { n: number | undefined }) {
  return n ? <span className="passo-n" aria-hidden="true">{n}</span> : null;
}

export default function BarraPassi({ passi, label, stato, className, children }: {
  passi: readonly Passo[];
  /** the bar's name for assistive technology */
  label: string;
  /** the live line; absent: the step now, or that every value is in */
  stato?: string;
  className?: string;
  children?: ReactNode;
}) {
  const t = useTranslations('passi');
  const ora = passoOra(passi);
  return (
    <div className={className ? `passi-bar ${className}` : 'passi-bar'}>
      <nav className="seg-row passi-nav" aria-label={label}>
        {passi.map((p) => (
          <a key={p.id} href={`#${p.id}`} data-manca={p.manca || undefined} aria-current={p === ora ? 'step' : undefined} onClick={(e) => vaiAlPasso(p, e)}>
            {p.n} · {p.label}{p.manca ? ` (${t('manca', { n: p.manca })})` : p.manca === 0 ? ' ✓' : ''}
          </a>
        ))}
      </nav>
      <span className="note passi-live" role="status" aria-live="polite">{stato ?? (ora ? t('ora', { n: ora.n, passo: ora.label }) : t('fatto'))}</span>
      {children}
    </div>
  );
}

/** The step now in the save bar: its link, or nothing once every value is in. */
export function PassoOra({ passi }: { passi: readonly Passo[] }) {
  const t = useTranslations('passi');
  const ora = passoOra(passi);
  if (!ora) return null;
  return (
    <a className="passo-ora" href={`#${ora.primo ?? ora.id}`} onClick={(e) => vaiAlPasso(ora, e)}>
      {t('oraManca', { n: ora.n, passo: ora.label, manca: t('manca', { n: ora.manca ?? 0 }) })}
    </a>
  );
}
