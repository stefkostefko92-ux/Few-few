import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatCents } from '@/lib/money';
import { formatDateTime } from '@/lib/labels';
import { whereRicevimenti } from '@/lib/validation/acquisti';
import {
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
import { Vietato, utenteConPermesso } from '@/components/acquisti/guardia';
import {
  Paginazione,
  primo,
  type ParametriRicerca,
} from '@/components/acquisti/elenco';

export const metadata: Metadata = {
  title: 'Ricevimento merce',
  description:
    'Documenti di ricevimento merce: fornitore, ordine collegato, fattura e pezzi entrati in magazzino.',
};

const PER_PAGINA = 25;

export default async function ElencoRicevimentiPage({
  searchParams,
}: {
  searchParams: Promise<ParametriRicerca>;
}) {
  const utente = await utenteConPermesso('acquisti:leggi');
  if (!utente) return <Vietato azione="consultare i ricevimenti" />;

  const sp = await searchParams;
  const filtri = {
    fornitore: primo(sp, 'fornitore'),
    dal: primo(sp, 'dal'),
    al: primo(sp, 'al'),
    q: primo(sp, 'q'),
  };
  const pagina = Math.max(1, Number(primo(sp, 'page')) || 1);
  const where = whereRicevimenti(filtri);
  const vedeCosti = can(utente.role, 'costi:leggi');
  const puoRicevere = can(utente.role, 'ricevimenti:scrivi');

  const [ricevimenti, totale, fornitori] = await Promise.all([
    prisma.goodsReceipt.findMany({
      where,
      orderBy: [{ receivedAt: 'desc' }],
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
      include: {
        supplier: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, number: true } },
        user: { select: { name: true } },
        lines: { select: { qty: true, unitCostCents: true } },
      },
    }),
    prisma.goodsReceipt.count({ where }),
    prisma.supplier.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));

  return (
    <>
      <PageHeader
        title="Ricevimento merce"
        description="Ogni documento è la spiegazione di un aumento di giacenza: righe, ubicazioni e movimenti nascono insieme."
        actions={
          puoRicevere ? (
            <Link href="/ricevimenti/nuovo">
              <Button>Nuovo ricevimento</Button>
            </Link>
          ) : undefined
        }
      />

      <Card className="mb-4 no-print">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Fornitore" htmlFor="f-fornitore">
            <Select id="f-fornitore" name="fornitore" defaultValue={filtri.fornitore}>
              <option value="">Tutti</option>
              {fornitori.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.code} — {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dal" htmlFor="f-dal">
            <Input id="f-dal" type="date" name="dal" defaultValue={filtri.dal} />
          </Field>
          <Field label="Al" htmlFor="f-al">
            <Input id="f-al" type="date" name="al" defaultValue={filtri.al} />
          </Field>
          <Field label="Cerca" htmlFor="f-q" hint="Numero documento, fattura o ordine">
            <Input id="f-q" name="q" type="search" defaultValue={filtri.q} />
          </Field>
          <div className="flex items-end gap-2 lg:col-span-4">
            <Button type="submit">Filtra</Button>
            <Link href="/ricevimenti">
              <Button type="button" variant="fantasma">
                Azzera
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      {ricevimenti.length === 0 ? (
        <EmptyState
          title="Nessun ricevimento"
          description="Nessun documento corrisponde ai filtri impostati."
          action={
            puoRicevere ? (
              <Link href="/ricevimenti/nuovo">
                <Button>Nuovo ricevimento</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Documento</Th>
              <Th>Data</Th>
              <Th>Fornitore</Th>
              <Th>Ordine</Th>
              <Th>Fattura / DDT</Th>
              <Th className="text-right">Pezzi</Th>
              {vedeCosti && <Th className="text-right">Valore</Th>}
              <Th>Registrato da</Th>
            </tr>
          </thead>
          <tbody>
            {ricevimenti.map((r) => {
              const pezzi = r.lines.reduce((a, l) => a + l.qty, 0);
              const valore = r.lines.reduce((a, l) => a + l.qty * l.unitCostCents, 0);
              return (
                <tr key={r.id}>
                  <Td>
                    <Link href={`/ricevimenti/${r.id}`} className="font-medium text-brand underline">
                      {r.number}
                    </Link>
                  </Td>
                  <Td>{formatDateTime(r.receivedAt)}</Td>
                  <Td>{r.supplier.name}</Td>
                  <Td>
                    {r.purchaseOrder ? (
                      <Link href={`/acquisti/${r.purchaseOrder.id}`} className="text-brand underline">
                        {r.purchaseOrder.number}
                      </Link>
                    ) : (
                      <span className="text-fg-muted">senza ordine</span>
                    )}
                  </Td>
                  <Td>{r.invoiceNumber ?? '—'}</Td>
                  <Td className="text-right tabular-nums">{pezzi}</Td>
                  {vedeCosti && (
                    <Td className="text-right tabular-nums">{formatCents(valore)}</Td>
                  )}
                  <Td>{r.user?.name ?? '—'}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Paginazione
        base="/ricevimenti"
        filtri={filtri}
        pagina={pagina}
        pagine={pagine}
        totale={totale}
      />
    </>
  );
}
