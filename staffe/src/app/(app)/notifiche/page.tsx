import type { Metadata } from 'next';
import type { NotificationType, Prisma } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { NOTIFICATION_LABELS } from '@/lib/labels';
import { formatQty } from '@/lib/money';
import { Card, PageHeader } from '@/components/ui';
import { AccessoNegato, Vuoto } from '@/components/report';
import {
  filtroLettura,
  letturaDi,
  selectNotifica,
  visibiliDa,
} from '@/lib/notifiche';
import { ElencoNotifiche, type NotificaVista } from './ElencoNotifiche';

export const metadata: Metadata = { title: 'Notifiche' };

const STATI = ['non_lette', 'lette', 'tutte'] as const;
type Stato = (typeof STATI)[number];

const ETICHETTE_STATO: Record<Stato, string> = {
  non_lette: 'Da leggere',
  lette: 'Lette',
  tutte: 'Tutte',
};

const LIMITE = 100;

function statoValido(v: string | undefined): v is Stato {
  return v !== undefined && (STATI as readonly string[]).includes(v);
}

function tipoValido(v: string | undefined, tipi: NotificationType[]): v is NotificationType {
  return v !== undefined && (tipi as string[]).includes(v);
}

export default async function PaginaNotifiche({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'giacenze:leggi')) {
    return <AccessoNegato cosa="il centro notifiche" />;
  }

  const sp = await searchParams;
  const primo = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const stato: Stato = statoValido(primo(sp.stato)) ? (primo(sp.stato) as Stato) : 'non_lette';

  // Visibilità: le notifiche generali (userId nullo) più le proprie. Mai quelle
  // di un collega — il filtro è nella query, non nell'interfaccia.
  const visibili: Prisma.NotificationWhereInput = visibiliDa(user.id);

  const perTipo = await prisma.notification.groupBy({
    by: ['type'],
    where: visibili,
    _count: { _all: true },
  });
  const tipiPresenti = perTipo.map((t) => t.type);
  const tipo = tipoValido(primo(sp.tipo), tipiPresenti) ? primo(sp.tipo) : undefined;

  const where: Prisma.NotificationWhereInput = {
    ...visibili,
    ...(tipo ? { type: tipo as NotificationType } : {}),
    ...filtroLettura(user.id, stato),
  };

  const [righe, totale, nonLette] = await Promise.all([
    prisma.notification.findMany({
      where,
      // Prima gli avvisi ancora aperti, poi i più recenti.
      orderBy: [{ resolvedAt: 'asc' }, { createdAt: 'desc' }],
      take: LIMITE,
      select: selectNotifica(user.id),
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: { ...visibili, reads: { none: { userId: user.id } } },
    }),
  ]);

  const notifiche: NotificaVista[] = righe.map(({ reads, ...n }) => ({
    ...n,
    readAt: letturaDi({ reads })?.toISOString() ?? null,
    resolvedAt: n.resolvedAt ? n.resolvedAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  }));

  const query = (nuovi: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const s = nuovi.stato ?? stato;
    const t = 'tipo' in nuovi ? nuovi.tipo : tipo;
    if (s) p.set('stato', s);
    if (t) p.set('tipo', t);
    return `/notifiche?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Notifiche"
        description={`${nonLette} da leggere in totale · ${totale} in questo elenco`}
      />

      <nav className="no-print mb-4 flex flex-wrap gap-2" aria-label="Filtri notifiche">
        {STATI.map((s) => (
          <a
            key={s}
            href={query({ stato: s })}
            aria-current={s === stato ? 'page' : undefined}
            className={
              s === stato
                ? 'rounded bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg'
                : 'rounded border border-border px-3 py-1.5 text-sm hover:bg-muted'
            }
          >
            {ETICHETTE_STATO[s]}
          </a>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="no-print">
          <Card>
            <h2 className="text-sm font-semibold">Per tipo</h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                <a
                  href={query({ tipo: undefined })}
                  className={tipo ? 'hover:underline' : 'font-medium'}
                >
                  Tutti i tipi
                </a>
              </li>
              {perTipo
                .slice()
                .sort((a, b) => b._count._all - a._count._all)
                .map((t) => (
                  <li key={t.type} className="flex justify-between gap-2">
                    <a
                      href={query({ tipo: t.type })}
                      className={t.type === tipo ? 'font-medium' : 'hover:underline'}
                    >
                      {NOTIFICATION_LABELS[t.type]}
                    </a>
                    <span className="tabular-nums text-fg-muted">
                      {formatQty(t._count._all)}
                    </span>
                  </li>
                ))}
            </ul>
            <p className="mt-4 text-xs text-fg-muted">
              Gli avvisi di scorta minima ed esaurito nascono dai movimenti di magazzino: non si
              ripetono finché la condizione resta aperta e si chiudono da soli quando la giacenza
              risale sopra il minimo.
            </p>
            <p className="mt-2 text-xs text-fg-muted">
              La lettura è personale: segnare letto un avviso generale non lo nasconde ai colleghi.
            </p>
          </Card>
        </aside>

        <div>
          {notifiche.length === 0 ? (
            <Vuoto
              testo={
                stato === 'non_lette'
                  ? 'Nessuna notifica da leggere.'
                  : 'Nessuna notifica con questi filtri.'
              }
            />
          ) : (
            <ElencoNotifiche notifiche={notifiche} />
          )}
          {totale > LIMITE && (
            <p className="mt-3 text-sm text-fg-muted">
              Mostrate le {LIMITE} più recenti di {totale}.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
