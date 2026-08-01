import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/labels';
import { auditFiltriSchema, periodoAudit } from '@/lib/validation/inventario';
import {
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { AccessoNegato, Paginazione, Vuoto } from '@/components/inventario/comuni';

export const metadata: Metadata = {
  title: 'Traccia di controllo',
  description:
    'Registro di audit del gestionale: chi ha cambiato cosa e quando, con filtri per utente, entità e periodo.',
  keywords: [
    'Carbon Stealth',
    'traccia di controllo',
    'registro audit',
    'tracciabilità magazzino',
    'gestionale WMS',
    'staffe per ascensori',
  ],
};

const PER_PAGINA = 50;

/** Entità toccate dal gestionale, per il menù dei filtri. */
const ENTITA = [
  'User',
  'Product',
  'Location',
  'StockMovement',
  'PurchaseOrder',
  'SalesOrder',
  'GoodsReceipt',
  'PickList',
  'Shipment',
  'InventoryCount',
  'InventoryCountLine',
  'Attachment',
  'Supplier',
  'Customer',
];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    userId?: string;
    entity?: string;
    action?: string;
    da?: string;
    a?: string;
    page?: string;
  }>;
}) {
  const utente = await getSessionUser();
  if (!utente) redirect('/accesso');
  if (!can(utente.role, 'audit:leggi')) {
    return <AccessoNegato cosa="la traccia di controllo" />;
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  // I filtri malformati non devono far cadere la pagina: si ignorano.
  const filtri =
    auditFiltriSchema.safeParse({
      userId: sp.userId || undefined,
      entity: sp.entity || undefined,
      action: sp.action || undefined,
      da: sp.da || undefined,
      a: sp.a || undefined,
    }).data ?? auditFiltriSchema.parse({});
  const periodo = periodoAudit(filtri);

  const where: Prisma.AuditLogWhereInput = {};
  if (filtri.userId) where.userId = filtri.userId;
  if (filtri.entity) where.entity = filtri.entity;
  if (filtri.action) where.action = filtri.action;
  if (periodo.gte || periodo.lte) where.createdAt = periodo;

  const [totale, righe, utenti] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGINA,
      take: PER_PAGINA,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        summary: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const params: Record<string, string> = {};
  if (filtri.userId) params.userId = filtri.userId;
  if (filtri.entity) params.entity = filtri.entity;
  if (filtri.action) params.action = filtri.action;
  if (filtri.da) params.da = filtri.da;
  if (filtri.a) params.a = filtri.a;

  return (
    <>
      <PageHeader
        title="Traccia di controllo"
        description="Chi ha cambiato cosa e quando. Sola lettura: l’audit non si modifica e non si cancella dall’applicazione."
      />

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="userId" className="block text-sm font-medium">
              Utente
            </label>
            <Select
              id="userId"
              name="userId"
              defaultValue={filtri.userId ?? ''}
              className="mt-1 w-56"
            >
              <option value="">Tutti</option>
              {utenti.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="entity" className="block text-sm font-medium">
              Entità
            </label>
            <Select
              id="entity"
              name="entity"
              defaultValue={filtri.entity ?? ''}
              className="mt-1 w-56"
            >
              <option value="">Tutte</option>
              {ENTITA.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="action" className="block text-sm font-medium">
              Azione
            </label>
            <Input
              id="action"
              name="action"
              defaultValue={filtri.action ?? ''}
              className="mt-1 w-40"
              placeholder="CREATE, UPDATE…"
            />
          </div>
          <div>
            <label htmlFor="da" className="block text-sm font-medium">
              Dal
            </label>
            <Input
              id="da"
              name="da"
              type="date"
              defaultValue={filtri.da ?? ''}
              className="mt-1 w-44"
            />
          </div>
          <div>
            <label htmlFor="a" className="block text-sm font-medium">
              Al
            </label>
            <Input
              id="a"
              name="a"
              type="date"
              defaultValue={filtri.a ?? ''}
              className="mt-1 w-44"
            />
          </div>
          <Button type="submit" variant="secondario">
            Filtra
          </Button>
        </form>
      </Card>

      {righe.length === 0 ? (
        <EmptyState
          title="Nessun evento"
          description="Nessuna registrazione corrisponde ai filtri scelti."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Utente</Th>
              <Th>Azione</Th>
              <Th>Entità</Th>
              <Th>Dettaglio</Th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</Td>
                <Td>{r.user?.name ?? <Vuoto />}</Td>
                <Td className="font-medium">{r.action}</Td>
                <Td>
                  {r.entity}
                  {r.entityId && (
                    <span className="block text-xs text-fg-muted">{r.entityId}</span>
                  )}
                </Td>
                <Td>{r.summary ?? <Vuoto />}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Paginazione
        base="/impostazioni/audit"
        params={params}
        page={page}
        totalPages={Math.max(1, Math.ceil(totale / PER_PAGINA))}
        totale={totale}
      />
    </>
  );
}
