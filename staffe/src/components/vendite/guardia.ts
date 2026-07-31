import 'server-only';
import { redirect } from 'next/navigation';
import type { User } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { can, type Permission } from '@/lib/rbac';

/**
 * Guardia delle pagine: il permesso si verifica sul server anche qui.
 *
 * Nascondere una voce di menù non è una protezione — chi conosce l'indirizzo lo
 * digita. Chi non ha il permesso torna al cruscotto invece di vedere una pagina
 * di errore: non è un guasto, è un accesso che non gli spetta.
 */
export async function utenteConPermesso(permesso: Permission): Promise<User> {
  const utente = await getSessionUser();
  if (!utente) redirect('/accesso');
  if (!can(utente.role, permesso)) redirect('/pannello');
  return utente;
}
