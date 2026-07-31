import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui';

/**
 * Pezzi di interfaccia riusati dalle pagine di inventario, utenti e audit.
 *
 * Sono le stesse composizioni che il modulo prodotti tiene in
 * `components/prodotti/comuni.tsx`: quando i due moduli saranno stabili vanno
 * promosse a un unico `components/comuni.tsx` condiviso.
 */

/** Il permesso si verifica sul server anche nelle pagine, non solo nelle rotte. */
export function AccessoNegato({ cosa }: { cosa: string }) {
  return (
    <Card className="mx-auto max-w-md text-center">
      <h1 className="text-lg font-semibold">Permesso negato</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Il tuo ruolo non consente di consultare {cosa}. Se ti serve, chiedi
        all’amministratore.
      </p>
    </Card>
  );
}

/** Riga di una scheda: etichetta a sinistra, valore a destra. */
export function Dato({
  etichetta,
  children,
}: {
  etichetta: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-border py-1.5 last:border-b-0">
      <dt className="text-sm text-fg-muted">{etichetta}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

/** Valore assente: un trattino, mai una cella vuota che sembra un errore. */
export function Vuoto() {
  return <span className="text-fg-muted">—</span>;
}

function href(base: string, params: Record<string, string>, page: number): string {
  const q = new URLSearchParams(params);
  if (page > 1) q.set('page', String(page));
  else q.delete('page');
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * Paginazione a link: funziona senza JavaScript e resta navigabile da tastiera,
 * che in magazzino è anche il canale dello scanner.
 */
export function Paginazione({
  base,
  params,
  page,
  totalPages,
  totale,
}: {
  base: string;
  params: Record<string, string>;
  page: number;
  totalPages: number;
  totale: number;
}) {
  if (totalPages <= 1) {
    return (
      <p className="mt-3 text-sm text-fg-muted" aria-live="polite">
        {totale} risultati
      </p>
    );
  }
  return (
    <nav
      className="mt-3 flex items-center justify-between gap-3"
      aria-label="Paginazione dei risultati"
    >
      <p className="text-sm text-fg-muted">
        Pagina {page} di {totalPages} · {totale} risultati
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            href={href(base, params, page - 1)}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted"
            rel="prev"
          >
            ‹ Precedente
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link
            href={href(base, params, page + 1)}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted"
            rel="next"
          >
            Successiva ›
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
