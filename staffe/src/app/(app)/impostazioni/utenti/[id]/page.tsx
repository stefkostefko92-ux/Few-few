import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ROLE_LABELS, can, permissionsOf } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/labels';
import { Badge, Card, PageHeader } from '@/components/ui';
import { AccessoNegato, Dato, Vuoto } from '@/components/inventario/comuni';
import { SchedaUtente } from '../SchedaUtente';

export const metadata: Metadata = {
  title: 'Scheda utente',
  description:
    'Ruolo, stato e reimpostazione della password di un utente del gestionale.',
  keywords: [
    'Carbon Stealth',
    'scheda utente',
    'ruoli e permessi',
    'revoca sessioni',
    'gestionale WMS',
    'staffe per ascensori',
  ],
};

export default async function UtenteDettaglioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const attore = await getSessionUser();
  if (!attore) redirect('/accesso');
  if (!can(attore.role, 'utenti:gestisci')) {
    return <AccessoNegato cosa="gli utenti" />;
  }

  const { id } = await params;
  const utente = await prisma.user.findUnique({
    where: { id },
    // `passwordHash` non entra mai in una pagina: non serve e non deve viaggiare.
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
      _count: { select: { sessions: true } },
    },
  });
  if (!utente) notFound();

  const sessioniVive = await prisma.session.count({
    where: { userId: utente.id, revokedAt: null, expiresAt: { gt: new Date() } },
  });

  return (
    <>
      <PageHeader
        title={utente.name}
        description={utente.email}
        actions={
          <Link
            href="/impostazioni/utenti"
            className="rounded border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Torna all’elenco
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <SchedaUtente
          utente={{
            id: utente.id,
            name: utente.name,
            email: utente.email,
            role: utente.role,
            active: utente.active,
          }}
          sonoIo={utente.id === attore.id}
        />

        <div className="space-y-6">
          <Card>
            <h2 className="font-semibold">Stato</h2>
            <dl className="mt-2">
              <Dato etichetta="Stato">
                {utente.active ? (
                  <Badge tone="ok">Attivo</Badge>
                ) : (
                  <Badge tone="errore">Disattivato</Badge>
                )}
              </Dato>
              <Dato etichetta="Ruolo">{ROLE_LABELS[utente.role]}</Dato>
              <Dato etichetta="Sessioni vive">{sessioniVive}</Dato>
              <Dato etichetta="Ultimo accesso">
                {utente.lastLoginAt ? formatDateTime(utente.lastLoginAt) : <Vuoto />}
              </Dato>
              <Dato etichetta="Creato il">{formatDateTime(utente.createdAt)}</Dato>
            </dl>
          </Card>

          <Card>
            <h2 className="font-semibold">Permessi del ruolo</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Sono decisi dal ruolo, non dal singolo utente: un solo posto da
              guardare quando ci si chiede «chi può fare cosa».
            </p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {permissionsOf(utente.role).map((p) => (
                <li key={p}>
                  <Badge>{p}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
