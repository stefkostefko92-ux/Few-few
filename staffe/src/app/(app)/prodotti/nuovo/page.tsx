import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui';
import { AccessoNegato } from '@/components/prodotti/comuni';
import { FormProdotto, PRODOTTO_VUOTO } from '@/components/prodotti/FormProdotto';

export const metadata: Metadata = { title: 'Nuovo prodotto' };

export default async function PaginaNuovoProdotto() {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'prodotti:scrivi')) {
    return <AccessoNegato cosa="l’inserimento di nuovi prodotti" />;
  }

  const [categorie, fornitori, ubicazioni] = await Promise.all([
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

  return (
    <>
      <PageHeader
        title="Nuovo prodotto"
        description="Anagrafica completa: codici, misure, compatibilità, prezzi e soglie di scorta."
      />
      <FormProdotto
        iniziale={PRODOTTO_VUOTO}
        categorie={categorie}
        fornitori={fornitori}
        ubicazioni={ubicazioni}
        vedeCosti={can(user.role, 'costi:leggi')}
      />
    </>
  );
}
