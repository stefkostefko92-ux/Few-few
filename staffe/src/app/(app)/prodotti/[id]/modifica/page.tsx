import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui';
import { AccessoNegato } from '@/components/prodotti/comuni';
import {
  centesimiInput,
  FormProdotto,
  type ValoriProdotto,
} from '@/components/prodotti/FormProdotto';

export const metadata: Metadata = { title: 'Modifica prodotto' };

/** Numero intero o campo vuoto: `null` in banca dati resta vuoto nel form. */
function num(v: number | null): string {
  return v === null ? '' : String(v);
}

export default async function PaginaModificaProdotto({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'prodotti:scrivi')) {
    return <AccessoNegato cosa="la modifica dei prodotti" />;
  }

  const { id } = await params;
  const [prodotto, categorie, fornitori, ubicazioni] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
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
    prisma.location.findMany({
      where: { active: true },
      select: { id: true, code: true },
      orderBy: [{ pickOrder: 'asc' }, { code: 'asc' }],
    }),
  ]);
  if (!prodotto) notFound();

  const iniziale: ValoriProdotto = {
    id: prodotto.id,
    sku: prodotto.sku,
    barcode: prodotto.barcode ?? '',
    name: prodotto.name,
    description: prodotto.description ?? '',
    categoryId: prodotto.categoryId,
    material: prodotto.material,
    finish: prodotto.finish ?? '',
    uom: prodotto.uom,
    weightGrams: String(prodotto.weightGrams),
    lengthMm: num(prodotto.lengthMm),
    widthMm: num(prodotto.widthMm),
    heightMm: num(prodotto.heightMm),
    thicknessMm: num(prodotto.thicknessMm),
    compatibility: prodotto.compatibility ?? '',
    brand: prodotto.brand ?? '',
    costo: centesimiInput(prodotto.costCents),
    prezzo: centesimiInput(prodotto.priceCents),
    vatRateBp: prodotto.vatRateBp,
    supplierId: prodotto.supplierId ?? '',
    minStock: String(prodotto.minStock),
    maxStock: num(prodotto.maxStock),
    defaultLocationId: prodotto.defaultLocationId ?? '',
    batchTracked: prodotto.batchTracked,
    notes: prodotto.notes ?? '',
    active: prodotto.active,
  };

  return (
    <>
      <PageHeader
        title={`Modifica ${prodotto.sku}`}
        description={prodotto.name}
      />
      <FormProdotto
        iniziale={iniziale}
        categorie={categorie}
        fornitori={fornitori}
        ubicazioni={ubicazioni}
        vedeCosti={can(user.role, 'costi:leggi')}
      />
    </>
  );
}
