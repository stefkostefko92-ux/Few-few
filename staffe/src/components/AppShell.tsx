import Link from 'next/link';
import type { Role } from '@prisma/client';
import { can, ROLE_LABELS, type Permission } from '@/lib/rbac';
import { ThemeToggle } from './ThemeToggle';
import { GlobalSearch } from './GlobalSearch';
import { LogoutButton } from './LogoutButton';

type Voce = { href: string; label: string; permesso: Permission };
type Gruppo = { titolo: string; voci: Voce[] };

const NAVIGAZIONE: Gruppo[] = [
  {
    titolo: 'Magazzino',
    voci: [
      { href: '/pannello', label: 'Cruscotto', permesso: 'giacenze:leggi' },
      { href: '/prodotti', label: 'Prodotti', permesso: 'prodotti:leggi' },
      { href: '/giacenze', label: 'Giacenze', permesso: 'giacenze:leggi' },
      { href: '/ubicazioni', label: 'Ubicazioni', permesso: 'ubicazioni:leggi' },
      { href: '/inventario', label: 'Inventario', permesso: 'inventario:leggi' },
    ],
  },
  {
    titolo: 'Acquisti',
    voci: [
      { href: '/acquisti', label: 'Ordini di acquisto', permesso: 'acquisti:leggi' },
      { href: '/ricevimenti', label: 'Ricevimento merce', permesso: 'acquisti:leggi' },
      { href: '/fornitori', label: 'Fornitori', permesso: 'acquisti:leggi' },
    ],
  },
  {
    titolo: 'Vendite',
    voci: [
      { href: '/vendite', label: 'Ordini di vendita', permesso: 'vendite:leggi' },
      { href: '/prelievi', label: 'Prelievo e imballaggio', permesso: 'prelievi:leggi' },
      { href: '/spedizioni', label: 'Spedizioni', permesso: 'vendite:leggi' },
      { href: '/clienti', label: 'Clienti', permesso: 'vendite:leggi' },
    ],
  },
  {
    titolo: 'Strumenti',
    voci: [
      { href: '/scanner', label: 'Scanner', permesso: 'giacenze:leggi' },
      { href: '/etichette', label: 'Etichette', permesso: 'prodotti:leggi' },
      { href: '/report', label: 'Report', permesso: 'report:leggi' },
      { href: '/notifiche', label: 'Notifiche', permesso: 'giacenze:leggi' },
      { href: '/impostazioni/utenti', label: 'Utenti', permesso: 'utenti:gestisci' },
      {
        href: '/impostazioni/audit',
        label: 'Traccia di controllo',
        permesso: 'audit:leggi',
      },
    ],
  },
];

export function AppShell({
  user,
  children,
}: {
  user: { name: string; role: Role };
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-brand focus:px-3 focus:py-2 focus:text-brand-fg"
      >
        Vai al contenuto
      </a>

      <aside className="border-b border-border bg-surface lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r no-print">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/pannello" className="text-lg font-semibold tracking-tight">
            Staffe
          </Link>
          <ThemeToggle />
        </div>

      {/*
        Su telefono il menu è CHIUSO di default. Aperto occupava circa mille
        pixel sopra il contenuto: l'addetto doveva scorrere l'intero elenco di
        voci per arrivare allo scanner, cioè proprio lo schermo che usa in
        corsia, con una mano sola e i guanti. Da `lg` in su la barra laterale
        torna sempre visibile (regole in `globals.css`).

        È un `<details>` nativo: nessun JavaScript, apertura da tastiera e
        stato annunciato dai lettori di schermo senza ARIA aggiunto a mano.
      */}
      <details className="menu-laterale">
        <summary className="cursor-pointer list-none border-t border-border px-4 py-3 text-sm font-medium">
          Menu
        </summary>

        <nav aria-label="Navigazione principale" className="px-2 pb-4">
          {NAVIGAZIONE.map((gruppo) => {
            const voci = gruppo.voci.filter((v) => can(user.role, v.permesso));
            if (voci.length === 0) return null;
            return (
              <div key={gruppo.titolo} className="mb-4">
                <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  {gruppo.titolo}
                </p>
                <ul className="space-y-0.5">
                  {voci.map((v) => (
                    <li key={v.href}>
                      <Link
                        href={v.href}
                        className="block rounded px-2 py-1.5 text-sm hover:bg-muted"
                      >
                        {v.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-border px-4 py-3 text-sm">
          <p className="font-medium">{user.name}</p>
          <p className="text-xs text-fg-muted">{ROLE_LABELS[user.role]}</p>
          {/* L'informativa sta dove l'operatore già guarda per capire «chi sono
              io in questo sistema» — non sepolta in un piè di pagina. */}
          <Link
            href="/informativa"
            className="mt-1 inline-block text-xs text-fg-muted underline hover:text-fg"
          >
            Trattamento dei dati
          </Link>
          <LogoutButton />
        </div>
      </details>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur no-print">
          <GlobalSearch />
        </header>
        <main id="contenuto" className="flex-1 px-4 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
