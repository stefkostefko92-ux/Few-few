import type { Metadata } from 'next';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { meta } from '@/lib/api';
import { formatCents } from '@/lib/money';
import { MATERIAL_LABELS, UOM_LABELS } from '@/lib/labels';
import { statoScortaSchema } from '@/lib/validation/prodotti';
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
  idsPerStatoScorta,
  paginazioneDa,
  param,
  parametriAttivi,
  whereProdotti,
  type ParametriRicerca,
} from '@/components/prodotti/dati';
import { AccessoNegato, Paginazione } from '@/components/prodotti/comuni';

export const metadata: Metadata = { title: 'Prodotti' };

const CHIAVI = ['q', 'categoriaId', 'fornitoreId', 'stato', 'attivi'] as const;

export default async function PaginaProdotti({
  searchParams,
}: {
  searchParams: Promise<ParametriRicerca>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'prodotti:leggi')) {
    return <AccessoNegato cosa="il catalogo prodotti" />;
  }
  const vedeCosti = can(user.role, 'costi:leggi');
  const puoScrivere = can(user.role, 'prodotti:scrivi');

  const sp = await searchParams;
  const q = param(sp, 'q');
  const categoriaId = param(sp, 'categoriaId');
  const fornitoreId = param(sp, 'fornitoreId');
  const soloAttivi = param(sp, 'attivi') !== '0';
  const stato = statoScortaSchema.parse(param(sp, 'stato') || 'tutti');

  const p = paginazioneDa(sp, 25);

  const where = whereProdotti({ q, categoriaId, fornitoreId, soloAttivi });
  const idsStato = await idsPerStatoScorta(stato, where);
  if (idsStato !== null) where.id = { in: idsStato };

  const [categorie, fornitori, total, prodotti] = await Promise.all([
    prisma.category.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.supplier.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: { select: { name: true } } },
      orderBy: [{ sku: 'asc' }],
      skip: p.skip,
      take: p.take,
    }),
  ]);

  const giacenze = await giacenzePerProdotto(prodotti.map((x) => x.id));
  const m = meta(p, total);

  return (
    <>
      <PageHeader
        title="Prodotti"
        description="Catalogo di staffe e accessori: codici, misure, compatibilità e giacenza in tempo reale."
        actions={
          puoScrivere ? (
            <Link href="/prodotti/nuovo">
              <Button>Nuovo prodotto</Button>
            </Link>
          ) : null
        }
      />

      <Card className="mb-4 no-print">
        <form method="get" action="/prodotti" className="grid gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <Field
              label="Cerca"
              htmlFor="q"
              hint="SKU, codice a barre, nome, categoria, materiale, marca o modello compatibile. Il lettore di codici a barre scrive qui."
            >
              <Input
                id="q"
                name="q"
                type="search"
                defaultValue={q}
                autoFocus
                placeholder="es. STF-GUI-070 oppure Sematic"
              />
            </Field>
          </div>

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

          <Field label="Fornitore" htmlFor="fornitoreId">
            <Select id="fornitoreId" name="fornitoreId" defaultValue={fornitoreId}>
              <option value="">Tutti</option>
              {fornitori.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
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

          <div className="flex items-end gap-3 md:col-span-5">
            <label className="flex items-center gap-2 text-sm" htmlFor="attivi">
              <input
                id="attivi"
                name="attivi"
                type="checkbox"
                value="0"
                defaultChecked={!soloAttivi}
                className="h-4 w-4 rounded border-border"
              />
              Mostra anche i prodotti disattivati
            </label>
            <Button type="submit" variant="secondario">
              Applica filtri
            </Button>
            <Link
              href="/prodotti"
              className="text-sm text-fg-muted underline underline-offset-2"
            >
              Azzera
            </Link>
          </div>
        </form>
      </Card>

      {prodotti.length === 0 ? (
        <EmptyState
          title="Nessun prodotto trovato"
          description="Cambia i filtri di ricerca oppure inserisci un nuovo articolo a catalogo."
          action={
            puoScrivere ? (
              <Link href="/prodotti/nuovo">
                <Button>Nuovo prodotto</Button>
              </Link>
            ) : null
          }
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Prodotto</Th>
                <Th>Categoria</Th>
                <Th>Materiale</Th>
                <Th className="text-right">Giacenza</Th>
                <Th className="text-right">Disponibile</Th>
                {vedeCosti && <Th className="text-right">Costo</Th>}
                <Th className="text-right">Prezzo</Th>
                <Th>Stato</Th>
              </tr>
            </thead>
            <tbody>
              {prodotti.map((prodotto) => {
                const g = giacenze.get(prodotto.id) ?? GIACENZA_ZERO;
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
                      {prodotto.compatibility && (
                        <span className="block text-xs text-fg-muted">
                          Compatibile: {prodotto.compatibility}
                        </span>
                      )}
                    </Td>
                    <Td>{prodotto.category.name}</Td>
                    <Td>{MATERIAL_LABELS[prodotto.material]}</Td>
                    <Td className="text-right">
                      <StockIndicator
                        qty={g.qty}
                        minStock={prodotto.minStock}
                        suffix={UOM_LABELS[prodotto.uom]}
                      />
                    </Td>
                    <Td className="text-right tabular-nums">{g.availableQty}</Td>
                    {vedeCosti && (
                      <Td className="text-right tabular-nums">
                        {formatCents(prodotto.costCents)}
                      </Td>
                    )}
                    <Td className="text-right tabular-nums">
                      {formatCents(prodotto.priceCents)}
                    </Td>
                    <Td>
                      {prodotto.active ? (
                        <Badge tone="ok">Attivo</Badge>
                      ) : (
                        <Badge tone="errore">Disattivato</Badge>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <Paginazione
            base="/prodotti"
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
