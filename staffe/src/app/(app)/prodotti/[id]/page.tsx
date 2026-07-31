import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatBp, formatCents } from '@/lib/money';
import {
  ATTACHMENT_KIND_LABELS,
  formatDateTime,
  LOCATION_KIND_LABELS,
  MATERIAL_LABELS,
  MOVEMENT_LABELS,
  UOM_LABELS,
} from '@/lib/labels';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  StockIndicator,
  Table,
  Td,
  Th,
} from '@/components/ui';
import {
  GIACENZA_ZERO,
  giacenzePerProdotto,
  margineBp,
  ubicazioniDeiProdotti,
} from '@/components/prodotti/dati';
import { AccessoNegato, Dato, Vuoto } from '@/components/prodotti/comuni';

export const metadata: Metadata = { title: 'Scheda prodotto' };

const ULTIMI_MOVIMENTI = 15;

function misura(v: number | null, unita = 'mm') {
  return v === null ? <Vuoto /> : `${v} ${unita}`;
}

export default async function PaginaProdotto({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'prodotti:leggi')) {
    return <AccessoNegato cosa="la scheda prodotto" />;
  }
  const vedeCosti = can(user.role, 'costi:leggi');
  const puoScrivere = can(user.role, 'prodotti:scrivi');
  const puoMuovere = can(user.role, 'giacenze:muovi');

  const { id } = await params;
  const prodotto = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      defaultLocation: { select: { id: true, code: true } },
    },
  });
  if (!prodotto) notFound();

  const [giacenze, righe, movimenti, allegati] = await Promise.all([
    giacenzePerProdotto([id]),
    ubicazioniDeiProdotti([id]),
    prisma.stockMovement.findMany({
      where: { productId: id },
      include: {
        fromLocation: { select: { id: true, code: true } },
        toLocation: { select: { id: true, code: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: ULTIMI_MOVIMENTI,
    }),
    prisma.attachment.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const g = giacenze.get(id) ?? GIACENZA_ZERO;
  const margine = margineBp(prodotto.priceCents, prodotto.costCents);
  const um = UOM_LABELS[prodotto.uom];

  return (
    <>
      <PageHeader
        title={`${prodotto.sku} — ${prodotto.name}`}
        description={prodotto.category.name}
        actions={
          <>
            {puoScrivere && (
              <Link href={`/prodotti/${id}/modifica`}>
                <Button variant="secondario">Modifica</Button>
              </Link>
            )}
            {puoMuovere && (
              <Link href={`/giacenze/trasferimento?prodottoId=${id}`}>
                <Button>Trasferisci</Button>
              </Link>
            )}
          </>
        }
      />

      {!prodotto.active && (
        <p className="mb-4 rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="status">
          Prodotto disattivato: resta consultabile per lo storico, ma non va più
          ordinato né venduto.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Anagrafica
          </h2>
          <dl>
            <Dato etichetta="SKU">
              <span className="font-mono">{prodotto.sku}</span>
            </Dato>
            <Dato etichetta="Codice a barre">
              {prodotto.barcode ? (
                <span className="font-mono">{prodotto.barcode}</span>
              ) : (
                <Vuoto />
              )}
            </Dato>
            <Dato etichetta="Categoria">{prodotto.category.name}</Dato>
            <Dato etichetta="Marca">{prodotto.brand ?? <Vuoto />}</Dato>
            <Dato etichetta="Materiale">{MATERIAL_LABELS[prodotto.material]}</Dato>
            <Dato etichetta="Finitura">{prodotto.finish ?? <Vuoto />}</Dato>
            <Dato etichetta="Unità di misura">{um}</Dato>
            <Dato etichetta="Peso">
              {prodotto.weightGrams > 0 ? `${prodotto.weightGrams} g` : <Vuoto />}
            </Dato>
            <Dato etichetta="Lunghezza">{misura(prodotto.lengthMm)}</Dato>
            <Dato etichetta="Larghezza">{misura(prodotto.widthMm)}</Dato>
            <Dato etichetta="Altezza">{misura(prodotto.heightMm)}</Dato>
            <Dato etichetta="Spessore">{misura(prodotto.thicknessMm)}</Dato>
            <Dato etichetta="Compatibilità">{prodotto.compatibility ?? <Vuoto />}</Dato>
            <Dato etichetta="Gestito a lotti">
              {prodotto.batchTracked ? 'Sì' : 'No'}
            </Dato>
          </dl>

          {prodotto.description && (
            <p className="mt-3 whitespace-pre-line text-sm text-fg-muted">
              {prodotto.description}
            </p>
          )}
          {prodotto.notes && (
            <p className="mt-3 whitespace-pre-line rounded bg-muted px-3 py-2 text-sm">
              <span className="font-medium">Note: </span>
              {prodotto.notes}
            </p>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
              Giacenza
            </h2>
            <dl>
              <Dato etichetta="In magazzino">
                <StockIndicator qty={g.qty} minStock={prodotto.minStock} suffix={um} />
              </Dato>
              <Dato etichetta="Impegnato">
                <span className="tabular-nums">
                  {g.reservedQty} {um}
                </span>
              </Dato>
              <Dato etichetta="Disponibile">
                <span className="tabular-nums">
                  {g.availableQty} {um}
                </span>
              </Dato>
              <Dato etichetta="Scorta minima">
                <span className="tabular-nums">
                  {prodotto.minStock} {um}
                </span>
              </Dato>
              <Dato etichetta="Scorta massima">
                {prodotto.maxStock === null ? (
                  <Vuoto />
                ) : (
                  <span className="tabular-nums">
                    {prodotto.maxStock} {um}
                  </span>
                )}
              </Dato>
              <Dato etichetta="Ubicazione predefinita">
                {prodotto.defaultLocation ? (
                  <Link
                    href={`/ubicazioni/${prodotto.defaultLocation.id}`}
                    className="font-mono underline underline-offset-2"
                  >
                    {prodotto.defaultLocation.code}
                  </Link>
                ) : (
                  <Vuoto />
                )}
              </Dato>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
              {vedeCosti ? 'Prezzi e margine' : 'Prezzo'}
            </h2>
            <dl>
              {vedeCosti && (
                <Dato etichetta="Costo d'acquisto">
                  {formatCents(prodotto.costCents)}
                </Dato>
              )}
              <Dato etichetta="Prezzo di vendita (IVA esclusa)">
                {formatCents(prodotto.priceCents)}
              </Dato>
              <Dato etichetta="Aliquota IVA">{formatBp(prodotto.vatRateBp)}</Dato>
              {vedeCosti && (
                <Dato etichetta="Margine">
                  {margine === null ? <Vuoto /> : formatBp(margine)}
                </Dato>
              )}
              {vedeCosti && (
                <Dato etichetta="Valore a magazzino">
                  {formatCents(g.qty * prodotto.costCents)}
                </Dato>
              )}
              <Dato etichetta="Fornitore">
                {prodotto.supplier ? prodotto.supplier.name : <Vuoto />}
              </Dato>
            </dl>
          </Card>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Giacenza per ubicazione</h2>
        {righe.length === 0 ? (
          <EmptyState
            title="Nessuna giacenza"
            description="Il prodotto non è presente in nessuna ubicazione del magazzino."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Ubicazione</Th>
                <Th>Tipo</Th>
                <Th>Lotto</Th>
                <Th className="text-right">Quantità</Th>
                <Th className="text-right">Impegnato</Th>
                <Th className="text-right">Disponibile</Th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link
                      href={`/ubicazioni/${r.location.id}`}
                      className="font-mono underline underline-offset-2"
                    >
                      {r.location.code}
                    </Link>
                  </Td>
                  <Td>{LOCATION_KIND_LABELS[r.location.kind]}</Td>
                  <Td>{r.batch?.code ?? <Vuoto />}</Td>
                  <Td className="text-right tabular-nums">{r.qty}</Td>
                  <Td className="text-right tabular-nums">{r.reservedQty}</Td>
                  <Td className="text-right tabular-nums">{r.qty - r.reservedQty}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Ultimi movimenti</h2>
          <Link
            href={`/giacenze/movimenti?prodottoId=${id}`}
            className="text-sm underline underline-offset-2"
          >
            Vedi tutto il registro
          </Link>
        </div>
        {movimenti.length === 0 ? (
          <EmptyState
            title="Nessun movimento"
            description="Il prodotto non ha ancora avuto entrate o uscite."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Tipo</Th>
                <Th className="text-right">Quantità</Th>
                <Th>Da</Th>
                <Th>A</Th>
                <Th>Motivo</Th>
                <Th>Utente</Th>
              </tr>
            </thead>
            <tbody>
              {movimenti.map((m) => (
                <tr key={m.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(m.createdAt)}</Td>
                  <Td>
                    <Badge tone={m.type === 'RETTIFICA' ? 'avviso' : 'neutro'}>
                      {MOVEMENT_LABELS[m.type]}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{m.qty}</Td>
                  <Td className="font-mono text-xs">{m.fromLocation?.code ?? <Vuoto />}</Td>
                  <Td className="font-mono text-xs">{m.toLocation?.code ?? <Vuoto />}</Td>
                  <Td>{m.reason ?? <Vuoto />}</Td>
                  <Td>{m.user?.name ?? <Vuoto />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Allegati</h2>
        {allegati.length === 0 ? (
          <EmptyState
            title="Nessun allegato"
            description="Disegni tecnici, foto e istruzioni di montaggio compaiono qui una volta caricati."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Tipo</Th>
                <Th>File</Th>
                <Th className="text-right">Dimensione</Th>
                <Th>Caricato il</Th>
              </tr>
            </thead>
            <tbody>
              {allegati.map((a) => (
                <tr key={a.id}>
                  <Td>{ATTACHMENT_KIND_LABELS[a.kind]}</Td>
                  <Td>{a.filename}</Td>
                  <Td className="text-right tabular-nums">
                    {Math.max(1, Math.round(a.sizeBytes / 1024))} kB
                  </Td>
                  <Td>{formatDateTime(a.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  );
}
