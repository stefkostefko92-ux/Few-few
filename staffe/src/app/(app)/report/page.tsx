import type { Metadata } from 'next';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { Card, PageHeader } from '@/components/ui';
import { AccessoNegato } from '@/components/report';
import { DEFINIZIONI } from '@/lib/report';

export const metadata: Metadata = { title: 'Report' };

const VOCI = [
  {
    href: '/report/valorizzazione',
    titolo: 'Valorizzazione',
    testo: 'Quanto vale la merce a magazzino, per categoria e per prodotto.',
    definizione: DEFINIZIONI.valorizzazione,
    costi: true,
  },
  {
    href: '/report/movimenti',
    titolo: 'Movimenti e rotazione',
    testo: 'Entrate, uscite e indice di rotazione per prodotto.',
    definizione: DEFINIZIONI.movimenti,
    costi: false,
  },
  {
    href: '/report/vendite',
    titolo: 'Vendite',
    testo: 'Fatturato, ordini, ordine medio, per cliente e per categoria.',
    definizione: DEFINIZIONI.vendite,
    costi: false,
  },
  {
    href: '/report/acquisti',
    titolo: 'Acquisti',
    testo: 'Spesa per fornitore e per categoria.',
    definizione: DEFINIZIONI.acquisti,
    costi: true,
  },
  {
    href: '/report/fornitori',
    titolo: 'Prestazione dei fornitori',
    testo: 'Lead time reale, ordini completi, ritardi.',
    definizione: DEFINIZIONI.fornitori,
    costi: false,
  },
  {
    href: '/report/scorte',
    titolo: 'Stato delle scorte',
    testo: 'Sotto scorta, esauriti e giacenza morta.',
    definizione: DEFINIZIONI.scorte,
    costi: false,
  },
  {
    href: '/report/previsioni',
    titolo: 'Previsioni e riordino',
    testo: 'Consumo previsto, copertura, punto di riordino e quantità suggerita.',
    definizione: DEFINIZIONI.previsioni,
    costi: false,
  },
] as const;

export default async function PaginaReport() {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'report:leggi')) {
    return <AccessoNegato cosa="i report" />;
  }
  const vedeCosti = can(user.role, 'costi:leggi');
  const voci = VOCI.filter((v) => !v.costi || vedeCosti);

  return (
    <>
      <PageHeader
        title="Report"
        description="Ogni report dichiara il proprio metodo di calcolo e si esporta in CSV o si stampa in PDF."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {voci.map((v) => (
          <Card key={v.href}>
            <h2 className="text-base font-semibold">
              <Link href={v.href} className="hover:underline">
                {v.titolo}
              </Link>
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{v.testo}</p>
            <p className="mt-3 text-xs text-fg-muted">
              <span className="font-medium">Finestra:</span> {v.definizione.finestra}
            </p>
          </Card>
        ))}
      </div>

      {!vedeCosti && (
        <p className="mt-6 text-sm text-fg-muted">
          I report che espongono costi e margini non sono visibili al tuo ruolo.
        </p>
      )}
    </>
  );
}
