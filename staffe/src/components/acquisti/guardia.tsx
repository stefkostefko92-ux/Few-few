import { redirect } from 'next/navigation';
import type { User } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { can, type Permission } from '@/lib/rbac';
import { EmptyState } from '@/components/ui';

/**
 * Controllo del permesso a livello di pagina.
 *
 * Non sostituisce il controllo nelle rotte API — quello è la difesa vera. Qui
 * si evita solo di mostrare una pagina che l'utente non potrebbe comunque usare:
 * nascondere un bottone non è sicurezza, ma mostrarne uno che darà 403 è una
 * bugia all'operatore.
 */
export async function utenteConPermesso(
  permesso: Permission,
): Promise<User | null> {
  const utente = await getSessionUser();
  if (!utente) redirect('/accesso');
  return can(utente.role, permesso) ? utente : null;
}

export function Vietato({ azione }: { azione?: string }) {
  return (
    <EmptyState
      title="Permesso negato"
      description={
        azione
          ? `Il tuo ruolo non consente di ${azione}. Se ti serve, chiedi all’amministratore.`
          : 'Il tuo ruolo non consente di accedere a questa sezione. Se ti serve, chiedi all’amministratore.'
      }
    />
  );
}
