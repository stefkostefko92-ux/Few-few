import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { meta } from '@/lib/api';
import { LOCATION_KIND_LABELS } from '@/lib/labels';
import { TIPI_UBICAZIONE } from '@/lib/validation/prodotti';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui';
import {
  paginazioneDa,
  param,
  parametriAttivi,
  type ParametriRicerca,
} from '@/components/prodotti/dati';
import { AccessoNegato, Paginazione } from '@/components/prodotti/comuni';

export const metadata: Metadata = { title: 'Ubicazioni' };

const CHIAVI = ['q', 'zona', 'tipo', 'attive'] as const;

export default async function PaginaUbicazioni({
  searchParams,
}: {
  searchParams: Promise<ParametriRicerca>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ubicazioni:leggi')) {
    return <AccessoNegato cosa="la mappa delle ubicazioni" />;
  }
  const puoScrivere = can(user.role, 'ubicazioni:scrivi');

  const sp = await searchParams;
  const q = param(sp, 'q');
  const zona = param(sp, 'zona');
  const tipo = param(sp, 'tipo');
  const soloAttive = param(sp, 'attive') !== '0';
  const p = paginazioneDa(sp, 50);

  const where: Prisma.LocationWhereInput = {};
  if (soloAttive) where.active = true;
  if (zona) where.zone = zona;
  if ((TIPI_UBICAZIONE as readonly string[]).includes(tipo)) {
    where.kind = tipo as (typeof TIPI_UBICAZIONE)[number];
  }
  if (q) {
    const contiene = { contains: q, mode: 'insensitive' as const };
    where.OR = [
      { code: contiene },
      { zone: contiene },
      { aisle: contiene },
      { rack: contiene },
      { notes: contiene },
    ];
  }

  const [zone, total, ubicazioni] = await Promise.all([
    prisma.location.findMany({
      distinct: ['zone'],
      select: { zone: true },
      orderBy: { zone: 'asc' },
    }),
    prisma.location.count({ where }),
    prisma.location.findMany({
      where,
      orderBy: [{ pickOrder: 'asc' }, { code: 'asc' }],
      skip: p.skip,
      take: p.take,
    }),
  ]);

  const occupazione = await prisma.stockItem.groupBy({
    by: ['locationId'],
    where: { locationId: { in: ubicazioni.map((u) => u.id) } },
    _sum: { qty: true },
    _count: { _all: true },
  });
  const perId = new Map(
    occupazione.map((o) => [
      o.locationId,
      { articoli: o._count._all, pezzi: o._sum.qty ?? 0 },
    ]),
  );

  const m = meta(p, total);

  // Raggruppamento per zona: in magazzino si ragiona per zone, non per righe.
  const perZona = ubicazioni.reduce<Record<string, typeof ubicazioni>>((acc, u) => {
    (acc[u.zone] ??= []).push(u);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Ubicazioni"
        description="Gerarchia Zona → Corsia → Scaffale → Ripiano → Vano. Il codice è l’etichetta da scansionare, l’ordine di percorrenza guida il giro di prelievo."
        actions={
          puoScrivere ? (
            <Link href="/ubicazioni/nuovo">
              <Button>Nuova ubicazione</Button>
            </Link>
          ) : null
        }
      />

      <Card className="mb-4 no-print">
        <form method="get" action="/ubicazioni" className="grid gap-3 md:grid-cols-4">
          <Field label="Cerca" htmlFor="q" hint="Codice, zona, corsia o note. Si può scansionare l’etichetta.">
            <Input id="q" name="q" type="search" defaultValue={q} autoFocus />
          </Field>

          <Field label="Zona" htmlFor="zona">
            <Select id="zona" name="zona" defaultValue={zona}>
              <option value="">Tutte</option>
              {zone.map((z) => (
                <option key={z.zone} value={z.zone}>
                  {z.zone}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Tipo" htmlFor="tipo">
            <Select id="tipo" name="tipo" defaultValue={tipo}>
              <option value="">Tutti</option>
              {TIPI_UBICAZIONE.map((k) => (
                <option key={k} value={k}>
                  {LOCATION_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm" htmlFor="attive">
              <input
                id="attive"
                name="attive"
                type="checkbox"
                value="0"
                defaultChecked={!soloAttive}
                className="h-4 w-4 rounded border-border"
              />
              Mostra disattivate
            </label>
          </div>

          <div className="flex items-end gap-3 md:col-span-4">
            <Button type="submit" variant="secondario">
              Applica filtri
            </Button>
            <Link
              href="/ubicazioni"
              className="text-sm text-fg-muted underline underline-offset-2"
            >
              Azzera
            </Link>
          </div>
        </form>
      </Card>

      {ubicazioni.length === 0 ? (
        <EmptyState
          title="Nessuna ubicazione"
          description="Crea la prima ubicazione per poter ricevere e stoccare la merce."
          action={
            puoScrivere ? (
              <Link href="/ubicazioni/nuovo">
                <Button>Nuova ubicazione</Button>
              </Link>
            ) : null
          }
        />
      ) : (
        <>
          {Object.entries(perZona).map(([nomeZona, righe]) => (
            <section key={nomeZona} className="mb-6">
              <h2 className="mb-2 text-lg font-semibold">Zona {nomeZona}</h2>
              <Table>
                <thead>
                  <tr>
                    <Th>Codice</Th>
                    <Th>Corsia</Th>
                    <Th>Scaffale</Th>
                    <Th>Ripiano</Th>
                    <Th>Vano</Th>
                    <Th>Tipo</Th>
                    <Th className="text-right">Percorso</Th>
                    <Th className="text-right">Articoli</Th>
                    <Th className="text-right">Pezzi</Th>
                    <Th>Stato</Th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((u) => {
                    const occ = perId.get(u.id) ?? { articoli: 0, pezzi: 0 };
                    return (
                      <tr key={u.id}>
                        <Td className="font-mono text-xs">
                          <Link
                            href={`/ubicazioni/${u.id}`}
                            className="underline underline-offset-2"
                          >
                            {u.code}
                          </Link>
                        </Td>
                        <Td>{u.aisle}</Td>
                        <Td>{u.rack}</Td>
                        <Td>{u.shelf}</Td>
                        <Td>{u.bin}</Td>
                        <Td>{LOCATION_KIND_LABELS[u.kind]}</Td>
                        <Td className="text-right tabular-nums">{u.pickOrder}</Td>
                        <Td className="text-right tabular-nums">{occ.articoli}</Td>
                        <Td className="text-right tabular-nums">
                          {occ.pezzi}
                          {u.capacity !== null && (
                            <span className="text-fg-muted"> / {u.capacity}</span>
                          )}
                        </Td>
                        <Td>
                          {u.active ? (
                            <Badge tone="ok">Attiva</Badge>
                          ) : (
                            <Badge tone="errore">Disattivata</Badge>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </section>
          ))}

          <Paginazione
            base="/ubicazioni"
            params={parametriAttivi(sp, CHIAVI)}
            page={m.page}
            totalPages={m.totalPages}
            totale={m.total}
          />
        </>
      )}
    </>
  );
}
