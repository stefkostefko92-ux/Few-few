import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatCents } from '@/lib/money';
import { formatDateTime, LOCATION_KIND_LABELS, MOVEMENT_LABELS, UOM_LABELS } from '@/lib/labels';
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
import { AccessoNegato, Dato, Vuoto } from '@/components/prodotti/comuni';
import { FormUbicazione, type ValoriUbicazione } from '@/components/prodotti/FormUbicazione';

export const metadata: Metadata = { title: 'Ubicazione' };

const ULTIMI_MOVIMENTI = 15;

export default async function PaginaUbicazione({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ubicazioni:leggi')) {
    return <AccessoNegato cosa="il dettaglio delle ubicazioni" />;
  }
  const puoScrivere = can(user.role, 'ubicazioni:scrivi');
  const puoMuovere = can(user.role, 'giacenze:muovi');
  const vedeCosti = can(user.role, 'costi:leggi');

  const { id } = await params;
  const ubicazione = await prisma.location.findUnique({ where: { id } });
  if (!ubicazione) notFound();

  const [contenuto, movimenti, predefinitaPer] = await Promise.all([
    prisma.stockItem.findMany({
      where: { locationId: id },
      select: {
        id: true,
        qty: true,
        reservedQty: true,
        batch: { select: { id: true, code: true } },
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            uom: true,
            minStock: true,
            costCents: true,
          },
        },
      },
      orderBy: [{ qty: 'desc' }],
    }),
    prisma.stockMovement.findMany({
      where: { OR: [{ fromLocationId: id }, { toLocationId: id }] },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        fromLocation: { select: { id: true, code: true } },
        toLocation: { select: { id: true, code: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: ULTIMI_MOVIMENTI,
    }),
    prisma.product.count({ where: { defaultLocationId: id, active: true } }),
  ]);

  const pezzi = contenuto.reduce((s, r) => s + r.qty, 0);
  const valoreCents = contenuto.reduce((s, r) => s + r.qty * r.product.costCents, 0);

  const iniziale: ValoriUbicazione = {
    id: ubicazione.id,
    code: ubicazione.code,
    zone: ubicazione.zone,
    aisle: ubicazione.aisle,
    rack: ubicazione.rack,
    shelf: ubicazione.shelf,
    bin: ubicazione.bin,
    kind: ubicazione.kind,
    pickOrder: String(ubicazione.pickOrder),
    capacity: ubicazione.capacity === null ? '' : String(ubicazione.capacity),
    notes: ubicazione.notes ?? '',
    active: ubicazione.active,
  };

  return (
    <>
      <PageHeader
        title={ubicazione.code}
        description={`Zona ${ubicazione.zone} · corsia ${ubicazione.aisle} · scaffale ${ubicazione.rack} · ripiano ${ubicazione.shelf} · vano ${ubicazione.bin}`}
        actions={
          <>
            <Link href={`/giacenze?ubicazioneId=${id}`}>
              <Button variant="secondario">Giacenze qui</Button>
            </Link>
            {puoMuovere && (
              <Link href={`/giacenze/trasferimento?ubicazioneId=${id}`}>
                <Button>Trasferisci</Button>
              </Link>
            )}
          </>
        }
      />

      {!ubicazione.active && (
        <p className="mb-4 rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="status">
          Ubicazione disattivata: non compare nei giri di prelievo né nelle
          proposte di stoccaggio.
        </p>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Scheda
          </h2>
          <dl>
            <Dato etichetta="Codice">
              <span className="font-mono">{ubicazione.code}</span>
            </Dato>
            <Dato etichetta="Tipo">{LOCATION_KIND_LABELS[ubicazione.kind]}</Dato>
            <Dato etichetta="Ordine di percorrenza">{ubicazione.pickOrder}</Dato>
            <Dato etichetta="Capienza">
              {ubicazione.capacity === null ? <Vuoto /> : `${ubicazione.capacity} pz`}
            </Dato>
            <Dato etichetta="Stato">
              {ubicazione.active ? (
                <Badge tone="ok">Attiva</Badge>
              ) : (
                <Badge tone="errore">Disattivata</Badge>
              )}
            </Dato>
            <Dato etichetta="Predefinita per">{predefinitaPer} prodotti</Dato>
          </dl>
          {ubicazione.notes && (
            <p className="mt-3 whitespace-pre-line rounded bg-muted px-3 py-2 text-sm">
              {ubicazione.notes}
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Occupazione
          </h2>
          <dl>
            <Dato etichetta="Articoli diversi">{contenuto.length}</Dato>
            <Dato etichetta="Pezzi totali">
              <span className="tabular-nums">{pezzi}</span>
            </Dato>
            {ubicazione.capacity !== null && (
              <Dato etichetta="Capienza residua">
                <span className="tabular-nums">
                  {Math.max(0, ubicazione.capacity - pezzi)}
                </span>
              </Dato>
            )}
            {vedeCosti && (
              <Dato etichetta="Valore stoccato">{formatCents(valoreCents)}</Dato>
            )}
          </dl>
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Etichetta
          </h2>
          <p className="mt-2 rounded border border-dashed border-border px-3 py-6 text-center font-mono text-xl">
            {ubicazione.code}
          </p>
          <p className="mt-2 text-xs text-fg-muted">
            Questo è il codice che il lettore deve leggere: se la targa a muro
            non corrisponde, la merce finisce nel vano sbagliato.
          </p>
        </Card>
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Cosa c’è in questa ubicazione</h2>
        {contenuto.length === 0 ? (
          <EmptyState
            title="Ubicazione vuota"
            description="Nessun articolo è attualmente stoccato qui."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Prodotto</Th>
                <Th>Lotto</Th>
                <Th className="text-right">Quantità</Th>
                <Th className="text-right">Impegnato</Th>
                <Th className="text-right">Disponibile</Th>
                {vedeCosti && <Th className="text-right">Valore</Th>}
              </tr>
            </thead>
            <tbody>
              {contenuto.map((r) => (
                <tr key={r.id}>
                  <Td className="font-mono text-xs">
                    <Link
                      href={`/prodotti/${r.product.id}`}
                      className="underline underline-offset-2"
                    >
                      {r.product.sku}
                    </Link>
                  </Td>
                  <Td>{r.product.name}</Td>
                  <Td>{r.batch?.code ?? <Vuoto />}</Td>
                  <Td className="text-right">
                    <StockIndicator
                      qty={r.qty}
                      minStock={r.product.minStock}
                      suffix={UOM_LABELS[r.product.uom]}
                    />
                  </Td>
                  <Td className="text-right tabular-nums">{r.reservedQty}</Td>
                  <Td className="text-right tabular-nums">{r.qty - r.reservedQty}</Td>
                  {vedeCosti && (
                    <Td className="text-right tabular-nums">
                      {formatCents(r.qty * r.product.costCents)}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Ultimi movimenti</h2>
          <Link
            href={`/giacenze/movimenti?ubicazioneId=${id}`}
            className="text-sm underline underline-offset-2"
          >
            Vedi tutto il registro
          </Link>
        </div>
        {movimenti.length === 0 ? (
          <EmptyState
            title="Nessun movimento"
            description="Non è ancora entrata né uscita merce da questa ubicazione."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Data e ora</Th>
                <Th>Tipo</Th>
                <Th>Prodotto</Th>
                <Th className="text-right">Quantità</Th>
                <Th>Da</Th>
                <Th>A</Th>
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
                      className="font-mono text-xs underline underline-offset-2"
                    >
                      {mov.product.sku}
                    </Link>
                  </Td>
                  <Td className="text-right tabular-nums">{mov.qty}</Td>
                  <Td className="font-mono text-xs">{mov.fromLocation?.code ?? <Vuoto />}</Td>
                  <Td className="font-mono text-xs">{mov.toLocation?.code ?? <Vuoto />}</Td>
                  <Td>{mov.user?.name ?? <Vuoto />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {puoScrivere && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Modifica ubicazione</h2>
          <FormUbicazione iniziale={iniziale} />
        </section>
      )}
    </>
  );
}
