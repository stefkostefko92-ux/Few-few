import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatCents, formatQty } from '@/lib/money';
import {
  COUNT_STATUS_LABELS,
  COUNT_TYPE_LABELS,
  UOM_LABELS,
  formatDateTime,
} from '@/lib/labels';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { AccessoNegato, Dato, Vuoto } from '@/components/inventario/comuni';
import { ChiusuraInventario } from '@/components/inventario/ChiusuraInventario';
import { SchermoConta, type RigaConta } from '@/components/inventario/SchermoConta';
import {
  SOGLIA_VALORE_CENTS,
  differenza,
  ordinaPerImpatto,
  riepiloga,
  valoreDifferenzaCents,
} from '@/components/inventario/rapporto';

export const metadata: Metadata = {
  title: 'Conteggio di inventario',
  description:
    'Schermo di conteggio e rapporto delle discrepanze di un inventario: differenze per quantità e per valore.',
  keywords: [
    'Carbon Stealth',
    'rapporto discrepanze',
    'conteggio inventario',
    'rettifica giacenza',
    'staffe per ascensori',
    'gestionale WMS',
  ],
};

const TONO_STATO = {
  APERTO: 'neutro',
  IN_CORSO: 'corso',
  CHIUSO: 'ok',
  ANNULLATO: 'errore',
} as const;

export default async function InventarioDettaglioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const utente = await getSessionUser();
  if (!utente) redirect('/accesso');
  if (!can(utente.role, 'inventario:leggi')) {
    return <AccessoNegato cosa="gli inventari" />;
  }

  const { id } = await params;
  const conteggio = await prisma.inventoryCount.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      type: true,
      status: true,
      startedAt: true,
      closedAt: true,
      notes: true,
      user: { select: { name: true } },
      lines: {
        select: {
          id: true,
          expectedQty: true,
          countedQty: true,
          verified: true,
          note: true,
          locationId: true,
          location: { select: { code: true, zone: true } },
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              barcode: true,
              uom: true,
              costCents: true,
            },
          },
        },
        orderBy: [{ location: { pickOrder: 'asc' } }, { product: { sku: 'asc' } }],
      },
    },
  });
  if (!conteggio) notFound();

  // Il magazziniere conta i pezzi; la valorizzazione è affare di chi vede i costi.
  const vedeCosti = can(utente.role, 'costi:leggi');
  const puoScrivere = can(utente.role, 'inventario:scrivi');
  const aperto = conteggio.status === 'APERTO' || conteggio.status === 'IN_CORSO';

  const righeCalcolo = conteggio.lines.map((r) => ({
    id: r.id,
    expectedQty: r.expectedQty,
    countedQty: r.countedQty,
    costCents: vedeCosti ? r.product.costCents : 0,
  }));
  const riepilogo = riepiloga(righeCalcolo);

  const discrepanze = ordinaPerImpatto(
    conteggio.lines
      .filter((r) => r.countedQty !== null && r.countedQty !== r.expectedQty)
      .map((r) => ({
        id: r.id,
        expectedQty: r.expectedQty,
        countedQty: r.countedQty,
        costCents: vedeCosti ? r.product.costCents : 0,
        sku: r.product.sku,
        nome: r.product.name,
        uom: UOM_LABELS[r.product.uom],
        ubicazione: r.location.code,
        verified: r.verified,
      })),
  );

  // Alla conta aperta il browser NON riceve la quantità attesa: la conta è cieca
  // (vedi `SchermoConta`). Il rapporto qui sotto mostra solo righe già contate.
  const righeConta: RigaConta[] = conteggio.lines.map((r) => ({
    id: r.id,
    sku: r.product.sku,
    nome: r.product.name,
    barcode: r.product.barcode,
    uom: UOM_LABELS[r.product.uom],
    locationId: r.locationId,
    ubicazione: r.location.code,
    zona: r.location.zone,
    countedQty: r.countedQty,
    verified: r.verified,
    note: r.note,
  }));

  return (
    <>
      <PageHeader
        title={`Inventario ${conteggio.number}`}
        description={`${COUNT_TYPE_LABELS[conteggio.type]} · aperto il ${formatDateTime(conteggio.startedAt)}`}
        actions={
          <Link
            href="/inventario"
            className="rounded border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Torna all’elenco
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <dl>
            <Dato etichetta="Stato">
              <Badge tone={TONO_STATO[conteggio.status]}>
                {COUNT_STATUS_LABELS[conteggio.status]}
              </Badge>
            </Dato>
            <Dato etichetta="Tipo">{COUNT_TYPE_LABELS[conteggio.type]}</Dato>
            <Dato etichetta="Operatore">{conteggio.user?.name ?? <Vuoto />}</Dato>
            <Dato etichetta="Chiuso il">
              {conteggio.closedAt ? formatDateTime(conteggio.closedAt) : <Vuoto />}
            </Dato>
            <Dato etichetta="Note">{conteggio.notes ?? <Vuoto />}</Dato>
          </dl>
        </Card>

        <Card>
          <dl>
            <Dato etichetta="Righe">{formatQty(riepilogo.righe)}</Dato>
            <Dato etichetta="Contate">{formatQty(riepilogo.contate)}</Dato>
            <Dato etichetta="Da contare">
              {riepilogo.nonContate > 0 ? (
                <span className="text-warn">{formatQty(riepilogo.nonContate)}</span>
              ) : (
                formatQty(0)
              )}
            </Dato>
            <Dato etichetta="Righe con differenza">
              {formatQty(riepilogo.discordanti)}
            </Dato>
          </dl>
        </Card>

        <Card>
          <dl>
            <Dato etichetta="Pezzi in più">{formatQty(riepilogo.pezziInPiu)}</Dato>
            <Dato etichetta="Pezzi in meno">{formatQty(riepilogo.pezziInMeno)}</Dato>
            {vedeCosti && (
              <>
                <Dato etichetta="Impatto netto">
                  {formatCents(riepilogo.valoreNettoCents)}
                </Dato>
                <Dato etichetta="Valore assoluto">
                  {formatCents(riepilogo.valoreAssolutoCents)}
                </Dato>
              </>
            )}
          </dl>
          {vedeCosti && riepilogo.valoreAssolutoCents >= SOGLIA_VALORE_CENTS && (
            <p className="mt-2 text-xs text-warn">
              Oltre la soglia di {formatCents(SOGLIA_VALORE_CENTS)}: alla chiusura
              parte la notifica di discrepanza.
            </p>
          )}
        </Card>
      </div>

      {aperto && puoScrivere && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">Conteggio</h2>
          <SchermoConta inventarioId={conteggio.id} righe={righeConta} />
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Rapporto discrepanze</h2>
        {discrepanze.length === 0 ? (
          <EmptyState
            title="Nessuna differenza"
            description={
              riepilogo.contate === 0
                ? 'Il conteggio non è ancora iniziato.'
                : 'Le righe contate finora corrispondono alla giacenza a sistema.'
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Articolo</Th>
                <Th>Ubicazione</Th>
                <Th className="text-right">Atteso</Th>
                <Th className="text-right">Contato</Th>
                <Th className="text-right">Differenza</Th>
                {vedeCosti && <Th className="text-right">Valore</Th>}
                <Th>Verifica</Th>
              </tr>
            </thead>
            <tbody>
              {discrepanze.map((r) => {
                const d = differenza(r) ?? 0;
                const valore = valoreDifferenzaCents(r);
                return (
                  <tr key={r.id}>
                    <Td>
                      <span className="font-medium">{r.sku}</span>
                      <span className="block text-xs text-fg-muted">{r.nome}</span>
                    </Td>
                    <Td>{r.ubicazione}</Td>
                    <Td className="text-right tabular-nums">
                      {formatQty(r.expectedQty)} {r.uom}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatQty(r.countedQty ?? 0)} {r.uom}
                    </Td>
                    <Td
                      className={`text-right font-medium tabular-nums ${d < 0 ? 'text-danger' : 'text-ok'}`}
                    >
                      {d > 0 ? '+' : ''}
                      {formatQty(d)}
                    </Td>
                    {vedeCosti && (
                      <Td
                        className={`text-right tabular-nums ${valore < 0 ? 'text-danger' : 'text-ok'}`}
                      >
                        {formatCents(valore)}
                      </Td>
                    )}
                    <Td>
                      {r.verified ? (
                        <Badge tone="ok">Scansionato</Badge>
                      ) : (
                        <Badge tone="neutro">A vista</Badge>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <p className="mt-2 text-xs text-fg-muted">
          Ordinate per impatto: prima ciò che pesa di più
          {vedeCosti ? ' in valore' : ' in quantità'}.
        </p>
      </section>

      {aperto && puoScrivere && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">Chiusura</h2>
          <ChiusuraInventario
            inventarioId={conteggio.id}
            numero={conteggio.number}
            righeNonContate={riepilogo.nonContate}
          />
        </section>
      )}

      {conteggio.status === 'CHIUSO' && (
        <p className="mt-6 text-sm text-fg-muted">
          Conteggio chiuso: le differenze sono già diventate movimenti di
          rettifica sul registro delle giacenze e il documento non è più
          modificabile.
        </p>
      )}
    </>
  );
}
