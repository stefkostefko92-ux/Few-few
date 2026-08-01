import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';

/**
 * Controllo definitivo dell'accesso: il middleware verifica solo la firma del
 * token, qui si verifica che la sessione sia ancora viva e l'utente attivo.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/accesso');

  return (
    <AppShell user={{ name: user.name, role: user.role }}>{children}</AppShell>
  );
}
