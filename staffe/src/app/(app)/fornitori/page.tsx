import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { whereFornitori } from '@/lib/validation/acquisti';
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
import { Vietato, utenteConPermesso } from '@/components/acquisti/guardia';
import {
  Paginazione,
  primo,
  type ParametriRicerca,
} from '@/components/acquisti/elenco';

export const metadata: Metadata = {
  title: 'Fornitori',
  description:
    'Anagrafica fornitori: codice, partita IVA, contatti, termini di pagamento e tempo di consegna.',
};

const PER_PAGINA = 25;

export default async function ElencoFornitoriPage({
  searchParams,
}: {
  searchParams: Promise<ParametriRicerca>;
}) {
  const utente = await utenteConPermesso('acquisti:leggi');
  if (!utente) return <Vietato azione="consultare l’anagrafica fornitori" />;

  const sp = await searchParams;
  const filtri = { q: primo(sp, 'q'), attivo: primo(sp, 'attivo') };
  const pagina = Math.max(1, Number(primo(sp, 'page')) || 1);
  const where = whereFornitori(filtri);
  const puoScrivere = can(utente.role, 'anagrafiche:scrivi');

  const [fornitori, totale] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
      include: {
        _count: { select: { products: true, purchaseOrders: true } },
      },
    }),
    prisma.supplier.count({ where }),
  ]);

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));

  return (
    <>
      <PageHeader
        title="Fornitori"
        description="Chi ci fornisce, a quali condizioni e con quali tempi di consegna."
        actions={
          puoScrivere ? (
            <Link href="/fornitori/nuovo">
              <Button>Nuovo fornitore</Button>
            </Link>
          ) : undefined
        }
      />

      <Card className="mb-4 no-print">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Cerca" htmlFor="f-q" hint="Codice, ragione sociale, partita IVA, e-mail">
            <Input id="f-q" name="q" type="search" defaultValue={filtri.q} />
          </Field>
          <Field label="Stato" htmlFor="f-attivo">
            <Select id="f-attivo" name="attivo" defaultValue={filtri.attivo}>
              <option value="">Solo attivi</option>
              <option value="no">Solo disattivati</option>
              <option value="tutti">Tutti</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2 lg:col-span-2">
            <Button type="submit">Filtra</Button>
            <Link href="/fornitori">
              <Button type="button" variant="fantasma">
                Azzera
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      {fornitori.length === 0 ? (
        <EmptyState
          title="Nessun fornitore"
          description="Nessun fornitore corrisponde ai filtri impostati."
          action={
            puoScrivere ? (
              <Link href="/fornitori/nuovo">
                <Button>Nuovo fornitore</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Codice</Th>
              <Th>Ragione sociale</Th>
              <Th>Partita IVA</Th>
              <Th>Contatti</Th>
              <Th>Pagamento</Th>
              <Th className="text-right">Consegna</Th>
              <Th className="text-right">Prodotti</Th>
              <Th className="text-right">Ordini</Th>
              <Th>Stato</Th>
            </tr>
          </thead>
          <tbody>
            {fornitori.map((f) => (
              <tr key={f.id}>
                <Td>
                  <Link href={`/fornitori/${f.id}`} className="font-medium text-brand underline">
                    {f.code}
                  </Link>
                </Td>
                <Td>{f.name}</Td>
                <Td>{f.vatNumber ?? '—'}</Td>
                <Td>
                  {f.email ?? '—'}
                  {f.phone && <span className="block text-xs text-fg-muted">{f.phone}</span>}
                </Td>
                <Td>{f.paymentTerms ?? '—'}</Td>
                <Td className="text-right tabular-nums">{f.leadTimeDays} gg</Td>
                <Td className="text-right tabular-nums">{f._count.products}</Td>
                <Td className="text-right tabular-nums">{f._count.purchaseOrders}</Td>
                <Td>
                  {f.active ? (
                    <Badge tone="ok">Attivo</Badge>
                  ) : (
                    <Badge tone="neutro">Disattivato</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Paginazione
        base="/fornitori"
        filtri={filtri}
        pagina={pagina}
        pagine={pagine}
        totale={totale}
      />
    </>
  );
}
