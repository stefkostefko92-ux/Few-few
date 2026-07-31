import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatBp } from '@/lib/money';
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
import { utenteConPermesso } from '@/components/vendite/guardia';

export const metadata: Metadata = {
  title: 'Clienti',
  description:
    'Anagrafica clienti: partita IVA, codice destinatario SDI, PEC, indirizzi, termini di pagamento e sconto di listino.',
  keywords: [
    'Carbon Stealth',
    'anagrafica clienti',
    'codice destinatario SDI',
    'fatturazione elettronica',
    'sconto di listino',
    'gestionale magazzino ascensori',
  ],
};

const PER_PAGINA = 25;

export default async function ClientiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const utente = await utenteConPermesso('vendite:leggi');
  const sp = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

  const q = uno(sp.q).trim();
  const attivi = uno(sp.attivi) || 'si';
  const pagina = Math.max(1, Number.parseInt(uno(sp.pagina) || '1', 10) || 1);

  const contiene = { contains: q, mode: 'insensitive' as const };
  const where: Prisma.CustomerWhereInput = {
    ...(attivi === 'tutti' ? {} : { active: attivi !== 'no' }),
    ...(q
      ? {
          OR: [
            { code: contiene },
            { name: contiene },
            { vatNumber: contiene },
            { city: contiene },
            { email: contiene },
          ],
        }
      : {}),
  };

  const [clienti, totale] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { _count: { select: { salesOrders: true } } },
      orderBy: [{ name: 'asc' }],
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
    prisma.customer.count({ where }),
  ]);

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const puoScrivere = can(utente.role, 'anagrafiche:scrivi');

  return (
    <>
      <PageHeader
        title="Clienti"
        description="Chi compra, a quali condizioni e dove va la merce."
        actions={
          puoScrivere ? (
            <Link href="/clienti/nuovo">
              <Button>Nuovo cliente</Button>
            </Link>
          ) : undefined
        }
      />

      <Card className="mb-4 no-print">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="Cerca" htmlFor="f-q" hint="Codice, ragione sociale, partita IVA, città, e-mail.">
            <Input id="f-q" name="q" type="search" defaultValue={q} />
          </Field>
          <Field label="Stato" htmlFor="f-attivi">
            <Select id="f-attivi" name="attivi" defaultValue={attivi}>
              <option value="si">Attivi</option>
              <option value="no">Disattivati</option>
              <option value="tutti">Tutti</option>
            </Select>
          </Field>
          <Button type="submit">Filtra</Button>
          <Link href="/clienti">
            <Button type="button" variant="fantasma">
              Azzera
            </Button>
          </Link>
        </form>
      </Card>

      {clienti.length === 0 ? (
        <EmptyState
          title="Nessun cliente"
          description="Crea il primo cliente per poter emettere preventivi e ordini."
          action={
            puoScrivere ? (
              <Link href="/clienti/nuovo">
                <Button>Nuovo cliente</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Codice</Th>
                <Th>Ragione sociale</Th>
                <Th>Partita IVA</Th>
                <Th>Città</Th>
                <Th className="text-right">Sconto</Th>
                <Th className="text-right">Ordini</Th>
                <Th>Stato</Th>
              </tr>
            </thead>
            <tbody>
              {clienti.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/clienti/${c.id}`} className="font-medium underline">
                      {c.code}
                    </Link>
                  </Td>
                  <Td>{c.name}</Td>
                  <Td>{c.vatNumber ?? '—'}</Td>
                  <Td>{[c.postalCode, c.city, c.province].filter(Boolean).join(' ') || '—'}</Td>
                  <Td className="text-right tabular-nums">{formatBp(c.discountBp)}</Td>
                  <Td className="text-right tabular-nums">{c._count.salesOrders}</Td>
                  <Td>
                    {c.active ? (
                      <Badge tone="ok">Attivo</Badge>
                    ) : (
                      <Badge tone="errore">Disattivato</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <p className="mt-3 flex items-center gap-3 text-sm text-fg-muted">
            <span>
              {totale} clienti · pagina {pagina} di {pagine}
            </span>
            {pagina > 1 && (
              <Link
                className="underline"
                href={`/clienti?q=${encodeURIComponent(q)}&attivi=${attivi}&pagina=${pagina - 1}`}
              >
                Precedente
              </Link>
            )}
            {pagina < pagine && (
              <Link
                className="underline"
                href={`/clienti?q=${encodeURIComponent(q)}&attivi=${attivi}&pagina=${pagina + 1}`}
              >
                Successiva
              </Link>
            )}
          </p>
        </>
      )}
    </>
  );
}
