import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { meta } from '@/lib/api';
import { formatCents } from '@/lib/money';
import { formatDateTime, MOVEMENT_LABELS } from '@/lib/labels';
import { TIPI_MOVIMENTO } from '@/lib/validation/prodotti';
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
import { AccessoNegato, Paginazione, Vuoto } from '@/components/prodotti/comuni';

export const metadata: Metadata = { title: 'Registro movimenti' };

const CHIAVI = ['tipo', 'prodottoId', 'ubicazioneId', 'da', 'a'] as const;

/** Il registro è immutabile: si legge, non si corregge. */
function dataValida(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function PaginaMovimenti({
  searchParams,
}: {
  searchParams: Promise<ParametriRicerca>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'giacenze:leggi')) {
    return <AccessoNegato cosa="il registro dei movimenti" />;
  }
  const vedeCosti = can(user.role, 'costi:leggi');

  const sp = await searchParams;
  const tipo = param(sp, 'tipo');
  const prodottoId = param(sp, 'prodottoId');
  const ubicazioneId = param(sp, 'ubicazioneId');
  const da = param(sp, 'da');
  const a = param(sp, 'a');
  const p = paginazioneDa(sp, 50);

  const where: Prisma.StockMovementWhereInput = {};
  if ((TIPI_MOVIMENTO as readonly string[]).includes(tipo)) {
    where.type = tipo as (typeof TIPI_MOVIMENTO)[number];
  }
  if (prodottoId) where.productId = prodottoId;
  if (ubicazioneId) {
    where.OR = [{ fromLocationId: ubicazioneId }, { toLocationId: ubicazioneId }];
  }
  const dal = dataValida(da);
  const al = dataValida(a);
  if (dal || al) {
    where.createdAt = {
      ...(dal ? { gte: dal } : {}),
      // Inclusivo sulla data finale: chi filtra «fino al 31» vuole vedere il 31.
      ...(al ? { lte: new Date(al.getTime() + 86_399_999) } : {}),
    };
  }

  const [prodotti, ubicazioni, total, movimenti] = await Promise.all([
    prisma.product.findMany({
      select: { id: true, sku: true, name: true },
      orderBy: { sku: 'asc' },
      take: 500,
    }),
    prisma.location.findMany({
      select: { id: true, code: true },
      orderBy: [{ pickOrder: 'asc' }, { code: 'asc' }],
    }),
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      include: {
        product: { select: { id: true, sku: true, name: true } },
        batch: { select: { id: true, code: true } },
        fromLocation: { select: { id: true, code: true } },
        toLocation: { select: { id: true, code: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: p.skip,
      take: p.take,
    }),
  ]);

  const m = meta(p, total);

  return (
    <>
      <PageHeader
        title="Registro movimenti"
        description="Ogni variazione di giacenza lascia una riga: il registro non si modifica, si compensa con un movimento opposto."
        actions={
          <Link href="/giacenze">
            <Button variant="secondario">Torna alle giacenze</Button>
          </Link>
        }
      />

      <Card className="mb-4 no-print">
        <form method="get" action="/giacenze/movimenti" className="grid gap-3 md:grid-cols-5">
          <Field label="Tipo" htmlFor="tipo">
            <Select id="tipo" name="tipo" defaultValue={tipo}>
              <option value="">Tutti</option>
              {TIPI_MOVIMENTO.map((t) => (
                <option key={t} value={t}>
                  {MOVEMENT_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Prodotto" htmlFor="prodottoId">
            <Select id="prodottoId" name="prodottoId" defaultValue={prodottoId}>
              <option value="">Tutti</option>
              {prodotti.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.sku} — {x.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Ubicazione" htmlFor="ubicazioneId">
            <Select id="ubicazioneId" name="ubicazioneId" defaultValue={ubicazioneId}>
              <option value="">Tutte</option>
              {ubicazioni.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Dal" htmlFor="da">
            <Input id="da" name="da" type="date" defaultValue={da} />
          </Field>

          <Field label="Al" htmlFor="a">
            <Input id="a" name="a" type="date" defaultValue={a} />
          </Field>

          <div className="flex items-end gap-3 md:col-span-5">
            <Button type="submit" variant="secondario">
              Filtra
            </Button>
            <Link
              href="/giacenze/movimenti"
              className="text-sm text-fg-muted underline underline-offset-2"
            >
              Azzera
            </Link>
          </div>
        </form>
      </Card>

      {movimenti.length === 0 ? (
        <EmptyState
          title="Nessun movimento"
          description="Nessuna riga corrisponde ai filtri selezionati."
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Data e ora</Th>
                <Th>Tipo</Th>
                <Th>Prodotto</Th>
                <Th className="text-right">Quantità</Th>
                <Th>Da</Th>
                <Th>A</Th>
                <Th>Lotto</Th>
                {vedeCosti && <Th className="text-right">Valore</Th>}
                <Th>Motivo</Th>
                <Th>Utente</Th>
              </tr>
            </thead>
            <tbody>
              {movimenti.map((mov) => (
                <tr key={mov.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(mov.createdAt)}</Td>
                  <Td>
                    <Badge tone={mov.type === 'RETTIFICA' ? 'avviso' : 'neutro'}>
                      {MOVEMENT_LABELS[mov.type]}
                    </Badge>
                  </Td>
                  <Td>
                    <Link
                      href={`/prodotti/${mov.product.id}`}
                      className="underline underline-offset-2"
                    >
                      <span className="font-mono text-xs">{mov.product.sku}</span>
                    </Link>
                    <span className="block text-xs text-fg-muted">{mov.product.name}</span>
                  </Td>
                  <Td className="text-right tabular-nums">{mov.qty}</Td>
                  <Td className="font-mono text-xs">{mov.fromLocation?.code ?? <Vuoto />}</Td>
                  <Td className="font-mono text-xs">{mov.toLocation?.code ?? <Vuoto />}</Td>
                  <Td>{mov.batch?.code ?? <Vuoto />}</Td>
                  {vedeCosti && (
                    <Td className="text-right tabular-nums">
                      {formatCents(mov.qty * mov.unitCostCents)}
                    </Td>
                  )}
                  <Td>{mov.reason ?? <Vuoto />}</Td>
                  <Td>{mov.user?.name ?? <Vuoto />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <Paginazione
            base="/giacenze/movimenti"
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
