import Link from 'next/link';
import { cx } from '@/components/ui';

/**
 * Ferramenta condivisa degli elenchi del modulo acquisti: lettura dei parametri
 * di ricerca (in Next 15 sono una Promise) e paginazione a link — così una
 * pagina di risultati resta indirizzabile, condivisibile e stampabile.
 */

export type ParametriRicerca = Record<string, string | string[] | undefined>;

/** Primo valore utile di un parametro ripetibile. */
export function primo(sp: ParametriRicerca, chiave: string): string {
  const valore = sp[chiave];
  if (Array.isArray(valore)) return valore[0] ?? '';
  return valore ?? '';
}

function conPagina(base: string, filtri: Record<string, string>, pagina: number): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filtri)) if (v) qs.set(k, v);
  if (pagina > 1) qs.set('page', String(pagina));
  const stringa = qs.toString();
  return stringa ? `${base}?${stringa}` : base;
}

export function Paginazione({
  base,
  filtri,
  pagina,
  pagine,
  totale,
}: {
  base: string;
  filtri: Record<string, string>;
  pagina: number;
  pagine: number;
  totale: number;
}) {
  if (totale === 0) return null;
  const stile =
    'rounded border border-border px-3 py-1.5 text-sm hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-50';

  return (
    <nav
      aria-label="Paginazione dei risultati"
      className="mt-4 flex items-center justify-between gap-3 no-print"
    >
      <p className="text-sm text-fg-muted">
        {totale} risultati · pagina {pagina} di {pagine}
      </p>
      <div className="flex gap-2">
        <Link
          href={conPagina(base, filtri, Math.max(1, pagina - 1))}
          aria-disabled={pagina <= 1}
          tabIndex={pagina <= 1 ? -1 : undefined}
          className={cx(stile)}
        >
          Precedente
        </Link>
        <Link
          href={conPagina(base, filtri, Math.min(pagine, pagina + 1))}
          aria-disabled={pagina >= pagine}
          tabIndex={pagina >= pagine ? -1 : undefined}
          className={cx(stile)}
        >
          Successiva
        </Link>
      </div>
    </nav>
  );
}
