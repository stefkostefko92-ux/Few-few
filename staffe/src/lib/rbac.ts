import type { Role } from '@prisma/client';

/**
 * Permessi per ruolo — un'unica tabella, nessun controllo sparso nelle pagine.
 *
 * Il permesso è la coppia `risorsa:azione`. `AMMINISTRATORE` ha tutto; gli altri
 * ruoli hanno esattamente ciò che serve al loro lavoro (privilegio minimo):
 * il magazziniere non vede i margini, il commerciale non rettifica le giacenze.
 */
export const PERMISSIONS = [
  'prodotti:leggi',
  'prodotti:scrivi',
  'giacenze:leggi',
  'giacenze:muovi', // ricevimento, prelievo, trasferimento
  'giacenze:rettifica', // correzione manuale della quantità
  'ubicazioni:leggi',
  'ubicazioni:scrivi',
  'acquisti:leggi',
  'acquisti:scrivi',
  'ricevimenti:scrivi',
  'vendite:leggi',
  'vendite:scrivi',
  'prelievi:leggi',
  'prelievi:scrivi',
  'spedizioni:scrivi',
  'anagrafiche:leggi',
  'anagrafiche:scrivi',
  'inventario:leggi',
  'inventario:scrivi',
  'report:leggi',
  'costi:leggi', // costi d'acquisto e marginalità
  'utenti:gestisci',
  'audit:leggi',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MAGAZZINO: readonly Permission[] = [
  'prodotti:leggi',
  'giacenze:leggi',
  'giacenze:muovi',
  'ubicazioni:leggi',
  'acquisti:leggi',
  'ricevimenti:scrivi',
  'vendite:leggi',
  'prelievi:leggi',
  'prelievi:scrivi',
  'spedizioni:scrivi',
  'inventario:leggi',
  'inventario:scrivi',
];

const VENDITE: readonly Permission[] = [
  'prodotti:leggi',
  'prodotti:scrivi',
  'giacenze:leggi',
  'ubicazioni:leggi',
  'acquisti:leggi',
  'acquisti:scrivi',
  'vendite:leggi',
  'vendite:scrivi',
  'prelievi:leggi',
  'anagrafiche:leggi',
  'anagrafiche:scrivi',
  'inventario:leggi',
  'report:leggi',
  'costi:leggi',
];

const BY_ROLE: Record<Role, readonly Permission[]> = {
  AMMINISTRATORE: PERMISSIONS,
  MAGAZZINO,
  VENDITE,
};

export function can(role: Role, permission: Permission): boolean {
  return BY_ROLE[role].includes(permission);
}

export function permissionsOf(role: Role): readonly Permission[] {
  return BY_ROLE[role];
}

/** Etichette italiane dei ruoli, per l'interfaccia. */
export const ROLE_LABELS: Record<Role, string> = {
  AMMINISTRATORE: 'Amministratore',
  MAGAZZINO: 'Addetto al magazzino',
  VENDITE: 'Vendite',
};
