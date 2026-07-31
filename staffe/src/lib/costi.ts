import type { Role } from '@prisma/client';
import { can } from './rbac';

/**
 * Visibilità dei costi d'acquisto nelle risposte REST.
 *
 * Il magazziniere non deve vedere quanto è costata la merce: è un dato
 * commerciale, e il permesso `costi:leggi` esiste apposta. Le PAGINE lo
 * rispettavano già, ma diverse rotte API usavano `include`, che restituisce
 * TUTTI i campi scalari del modello — `unitCostCents` compreso. Il costo usciva
 * comunque, bastava aprire la rotta con la sessione di un magazziniere: un dato
 * nascosto nell'interfaccia ma servito dall'API non è nascosto.
 *
 * Per questo la selezione è esplicita: `include` prende tutto per definizione,
 * `select` prende solo ciò che si è deciso di dare.
 */

export function vedeCosti(role: Role): boolean {
  return can(role, 'costi:leggi');
}

/** Campi propri di un movimento di magazzino. */
export function selectMovimento(role: Role) {
  return {
    id: true,
    qty: true,
    type: true,
    reason: true,
    refType: true,
    refId: true,
    batchId: true,
    productId: true,
    fromLocationId: true,
    toLocationId: true,
    userId: true,
    createdAt: true,
    ...(vedeCosti(role) ? { unitCostCents: true } : {}),
  };
}

/** Campi di una riga di ordine d'acquisto. */
export function selectRigaAcquisto(role: Role) {
  return {
    id: true,
    productId: true,
    qty: true,
    receivedQty: true,
    note: true,
    ...(vedeCosti(role) ? { unitCostCents: true, discountBp: true, vatRateBp: true } : {}),
  };
}

/** Campi di una riga di ricevimento merce. */
export function selectRigaRicevimento(role: Role) {
  return {
    id: true,
    productId: true,
    locationId: true,
    batchId: true,
    qty: true,
    note: true,
    ...(vedeCosti(role) ? { unitCostCents: true } : {}),
  };
}
