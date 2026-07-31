import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { Card, PageHeader } from '@/components/ui';
import { AccessoNegato } from '@/components/inventario/comuni';
import { NuovoInventarioForm } from '@/components/inventario/NuovoInventarioForm';

export const metadata: Metadata = {
  title: 'Nuovo conteggio',
  description:
    'Apertura di un conteggio di inventario ciclico o totale con fotografia della giacenza attesa.',
  keywords: [
    'Carbon Stealth',
    'nuovo inventario',
    'conta ciclica magazzino',
    'giacenza attesa',
    'staffe ascensori',
    'gestionale WMS',
  ],
};

export default async function NuovoInventarioPage() {
  const utente = await getSessionUser();
  if (!utente) redirect('/accesso');
  if (!can(utente.role, 'inventario:scrivi')) {
    return <AccessoNegato cosa="l’apertura di un inventario" />;
  }

  const [zone, categorie] = await Promise.all([
    prisma.location.findMany({
      where: { active: true },
      select: { zone: true },
      distinct: ['zone'],
      orderBy: { zone: 'asc' },
    }),
    prisma.category.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Nuovo conteggio"
        description="Alla conferma il sistema fotografa la giacenza attesa: da quel momento ogni differenza è confrontata con questa fotografia."
      />
      <Card className="max-w-2xl">
        <NuovoInventarioForm
          zone={zone.map((z) => z.zone)}
          categorie={categorie}
        />
      </Card>
    </>
  );
}
