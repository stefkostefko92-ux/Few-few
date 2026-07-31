import type { Metadata } from 'next';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { meta } from '@/lib/api';
import { formatCents, formatQty } from '@/lib/money';
import { UOM_LABELS } from '@/lib/labels';
import { statoScortaSchema, type StatoScorta } from '@/lib/validation/prodotti';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  StockIndicator,
  Table,
  Td,
  Th,
} from '@/components/ui';
import {
  GIACENZA_ZERO,
  giacenzePerProdotto,
  paginazioneDa,
  param,
  parametriAttivi,
  ubicazioniDeiProdotti,
  whereProdotti,
  type ParametriRicerca,
} from '@/components/prodotti/dati';
import { AccessoNegato, Paginazione, Vuoto } from '@/components/prodotti/comuni';

export const metadata: Metadata = { title: 'Giacenze' };

const CHIAVI = ['q', 'categoriaId', 'ubicazioneId', 'stato'] as const;

export default async function PaginaGiacenze({
  searchParams,
}: {
  searchParams: Promise<ParametriRicerca>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'giacenze:leggi')) {
    return <AccessoNegato cosa="le giacenze di magazzino" />;
  }
  const vedeCosti = can(user.role, 'costi:leggi');
  const puoMuovere = can(user.role, 'giacenze:muovi');
  const puoRettificare = can(user.role, 'giacenze:rettifica');

  const sp = await searchParams;
  const q = param(sp, 'q');
  const categoriaId = param(sp, 'categoriaId');
  const ubicazioneId = param(sp, 'ubicazioneId');

  let stato: StatoScorta = statoScortaSchema.parse(param(sp, 'stato') || 'tutti');
  if (param(sp, 'sottoScorta') === '1') stato = 'sotto';
  if (param(sp, 'esaurito') === '1') stato = 'esaurito';

  const p = paginazioneDa(sp, 50);

  const where = whereProdotti({ q, categoriaId, soloAttivi: true });
  if (ubicazioneId) where.stockItems = { some: { locationId: ubicazioneId } };

  // Si legge l'intero insieme filtrato una volta sola: serve sia per applicare
  // la soglia di scorta (colonna del prodotto contro somma di un'altra tabella)
  // sia per la valorizzazione totale, che non può fermarsi alla pagina mostrata.
  const universo = await prisma.product.findMany({
    where,
    select: { id: true, costCents: true, minStock: true },
  });
  const giacenzeUniverso = await giacenzePerProdotto(universo.map((x) => x.id));

  const selezionati = universo.filter((prodotto) => {
    const qty = giacenzeUniverso.get(prodotto.id)?.qty ?? 0;
    if (stato === 'esaurito') return qty <= 0;
    if (stato === 'sotto') return qty > 0 && qty <= prodotto.minStock;
    if (stato === 'ok') return qty > prodotto.minStock;
    return true;
  });

  const totali = selezionati.reduce(
    (acc, prodotto) => {
      const qty = giacenzeUniverso.get(prodotto.id)?.qty ?? 0;
      acc.pezzi += qty;
      acc.valoreCents += qty * prodotto.costCents;
      if (qty <= 0) acc.esauriti += 1;
      else if (qty <= prodotto.minStock) acc.sottoScorta += 1;
      return acc;
    },
    { pezzi: 0, valoreCents: 0, sottoScorta: 0, esauriti: 0 },
  );

  const [categorie, ubicazioni, prodotti] = await Promise.all([
    prisma.category.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.location.findMany({
      where: { active: true },
      select: { id: true, code: true },
      orderBy: [{ pickOrder: 'asc' }, { code: 'asc' }],
    }),
    prisma.product.findMany({
      where: { id: { in: selezionati.map((x) => x.id) } },
      include: { category: { select: { name: true } } },
      orderBy: [{ sku: 'asc' }],
      skip: p.skip,
      take: p.take,
    }),
  ]);

  const dettaglio = await ubicazioniDeiProdotti(prodotti.map((x) => x.id));
  const m = meta(p, selezionati.length);

  return (
    <>
      <PageHeader
        title="Giacenze"
        description="Quantità fisica, impegnato e disponibile per ogni articolo, con il dettaglio per ubicazione."
        actions={
          <>
            <Link href="/giacenze/movimenti">
              <Button variant="secondario">Registro movimenti</Button>
            </Link>
            {puoMuovere && (
              <Link href="/giacenze/trasferimento">
                <Button>Trasferimento</Button>
              </Link>
            )}
            {puoRettificare && (
              <Link href="/giacenze/rettifica">
                <Button variant="secondario">Rettifica</Button>
              </Link>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-fg-muted">Articoli</p>
          <p className="text-2xl font-semibold tabular-nums">{formatQty(m.total)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-fg-muted">Pezzi totali</p>
          <p className="text-2xl font-semibold tabular-nums">{formatQty(totali.pezzi)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-fg-muted">Sotto scorta</p>
          <p className="text-2xl font-semibold tabular-nums text-warn">
            {formatQty(totali.sottoScorta)}
          </p>
          <p className="text-xs text-fg-muted">Esauriti: {formatQty(totali.esauriti)}</p>
        </Card>
        {vedeCosti ? (
          <Card>
            <p className="text-xs uppercase tracking-wide text-fg-muted">
              Valorizzazione
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatCents(totali.valoreCents)}
            </p>
            <p className="text-xs text-fg-muted">Quantità × costo d’acquisto</p>
          </Card>
        ) : (
          <Card>
            <p className="text-xs uppercase tracking-wide text-fg-muted">
              Valorizzazione
            </p>
            <p className="mt-2 text-sm text-fg-muted">
              Riservata ai ruoli abilitati ai costi.
            </p>
          </Card>
        )}
      </div>

      <Card className="mb-4 no-print">
        <form method="get" action="/giacenze" className="grid gap-3 md:grid-cols-4">
          <Field label="Cerca" htmlFor="q" hint="SKU, codice a barre, nome o compatibilità.">
            <Input id="q" name="q" type="search" defaultValue={q} autoFocus />
          </Field>

          <Field label="Categoria" htmlFor="categoriaId">
            <Select id="categoriaId" name="categoriaId" defaultValue={categoriaId}>
              <option value="">Tutte</option>
              {categorie.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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

          <Field label="Stato scorta" htmlFor="stato">
            <Select id="stato" name="stato" defaultValue={stato}>
              <option value="tutti">Tutti</option>
              <option value="sotto">Sotto scorta</option>
              <option value="esaurito">Esaurito</option>
              <option value="ok">Scorta regolare</option>
            </Select>
          </Field>

          <div className="flex items-end gap-3 md:col-span-4">
            <Button type="submit" variant="secondario">
              Applica filtri
            </Button>
            <Link
              href="/giacenze"
              className="text-sm text-fg-muted underline underline-offset-2"
            >
              Azzera
            </Link>
          </div>
        </form>
      </Card>

      {prodotti.length === 0 ? (
        <EmptyState
          title="Nessuna giacenza da mostrare"
          description="Nessun articolo corrisponde ai filtri selezionati."
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Prodotto</Th>
                <Th>Ubicazioni</Th>
                <Th className="text-right">Giacenza</Th>
                <Th className="text-right">Impegnato</Th>
                <Th className="text-right">Disponibile</Th>
                {vedeCosti && <Th className="text-right">Valore</Th>}
              </tr>
            </thead>
            <tbody>
              {prodotti.map((prodotto) => {
                const g = giacenzeUniverso.get(prodotto.id) ?? GIACENZA_ZERO;
                const righe = dettaglio.filter(
                  (r) =>
                    r.productId === prodotto.id &&
                    (!ubicazioneId || r.location.id === ubicazioneId),
                );
                return (
                  <tr key={prodotto.id}>
                    <Td className="font-mono text-xs">
                      <Link
                        href={`/prodotti/${prodotto.id}`}
                        className="underline underline-offset-2"
                      >
                        {prodotto.sku}
                      </Link>
                    </Td>
                    <Td>
                      <span className="font-medium">{prodotto.name}</span>
                      <span className="block text-xs text-fg-muted">
                        {prodotto.category.name}
                      </span>
                    </Td>
                    <Td>
                      {righe.length === 0 ? (
                        <Vuoto />
                      ) : (
                        <ul className="space-y-0.5">
                          {righe.map((r) => (
                            <li key={r.id} className="text-xs">
                              <Link
                                href={`/ubicazioni/${r.location.id}`}
                                className="font-mono underline underline-offset-2"
                              >
                                {r.location.code}
                              </Link>{' '}
                              <span className="tabular-nums">{r.qty}</span>
                              {r.batch ? (
                                <span className="text-fg-muted"> · lotto {r.batch.code}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Td>
                    <Td className="text-right">
                      <StockIndicator
                        qty={g.qty}
                        minStock={prodotto.minStock}
                        suffix={UOM_LABELS[prodotto.uom]}
                      />
                    </Td>
                    <Td className="text-right tabular-nums">{g.reservedQty}</Td>
                    <Td className="text-right tabular-nums">
                      {g.availableQty}
                      {g.availableQty <= 0 && (
                        <span className="ml-2">
                          <Badge tone="errore">Non disponibile</Badge>
                        </span>
                      )}
                    </Td>
                    {vedeCosti && (
                      <Td className="text-right tabular-nums">
                        {formatCents(g.qty * prodotto.costCents)}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <Paginazione
            base="/giacenze"
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
