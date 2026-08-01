import type {
  AttachmentKind,
  InventoryCountStatus,
  InventoryCountType,
  LocationKind,
  Material,
  MovementType,
  NotificationLevel,
  NotificationType,
  PickListStatus,
  PurchaseOrderStatus,
  SalesOrderStatus,
  Uom,
} from '@prisma/client';

/**
 * Etichette italiane di tutti gli enum del dominio — l'interfaccia non mostra
 * mai il valore grezzo del database. Unico posto da toccare per rinominare una
 * voce: se una traduzione manca qui, manca ovunque (e si vede subito).
 */

export const UOM_LABELS: Record<Uom, string> = {
  PZ: 'pz',
  MT: 'm',
  KG: 'kg',
  CF: 'conf.',
};

export const MATERIAL_LABELS: Record<Material, string> = {
  ACCIAIO_ZINCATO: 'Acciaio zincato',
  ACCIAIO_INOX: 'Acciaio inox',
  ACCIAIO_VERNICIATO: 'Acciaio verniciato',
  ALLUMINIO: 'Alluminio',
  GHISA: 'Ghisa',
  ALTRO: 'Altro',
};

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  STOCCAGGIO: 'Stoccaggio',
  RICEVIMENTO: 'Ricevimento',
  SPEDIZIONE: 'Spedizione',
  QUARANTENA: 'Quarantena',
  PRODUZIONE: 'Produzione',
};

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  RICEVIMENTO: 'Ricevimento',
  PRELIEVO: 'Prelievo',
  TRASFERIMENTO: 'Trasferimento',
  RETTIFICA: 'Rettifica',
  RESO_CLIENTE: 'Reso da cliente',
  RESO_FORNITORE: 'Reso a fornitore',
  INVENTARIO: 'Inventario',
  SPEDIZIONE: 'Spedizione',
  SCARTO: 'Scarto',
};

export const PURCHASE_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  BOZZA: 'Bozza',
  ORDINATO: 'Ordinato',
  RICEVUTO_PARZIALE: 'Ricevuto parziale',
  RICEVUTO: 'Ricevuto',
  ANNULLATO: 'Annullato',
};

export const SALES_STATUS_LABELS: Record<SalesOrderStatus, string> = {
  BOZZA: 'Bozza',
  PREVENTIVO: 'Preventivo',
  CONFERMATO: 'Confermato',
  IN_PRELIEVO: 'In prelievo',
  IMBALLATO: 'Imballato',
  SPEDITO: 'Spedito',
  CONSEGNATO: 'Consegnato',
  ANNULLATO: 'Annullato',
};

export const PICKLIST_STATUS_LABELS: Record<PickListStatus, string> = {
  APERTA: 'Aperta',
  IN_CORSO: 'In corso',
  COMPLETATA: 'Completata',
  ANNULLATA: 'Annullata',
};

export const COUNT_TYPE_LABELS: Record<InventoryCountType, string> = {
  CICLICO: 'Ciclico',
  TOTALE: 'Totale',
};

export const COUNT_STATUS_LABELS: Record<InventoryCountStatus, string> = {
  APERTO: 'Aperto',
  IN_CORSO: 'In corso',
  CHIUSO: 'Chiuso',
  ANNULLATO: 'Annullato',
};

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  DISEGNO: 'Disegno tecnico',
  FOTO: 'Foto',
  PDF: 'PDF',
  CAD: 'File CAD',
  ISTRUZIONI: 'Istruzioni di montaggio',
  ALTRO: 'Altro',
};

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  SCORTA_MINIMA: 'Scorta minima',
  ESAURITO: 'Esaurito',
  ACQUISTO_RICEVUTO: 'Acquisto ricevuto',
  SPEDIZIONE_PRONTA: 'Spedizione pronta',
  NUOVO_ORDINE: 'Nuovo ordine',
  INVENTARIO_DISCREPANZA: 'Discrepanza di inventario',
};

/** Tono cromatico dei badge: informativo, in lavorazione, chiuso, annullato. */
export type Tone = 'neutro' | 'corso' | 'ok' | 'avviso' | 'errore';

export const PURCHASE_STATUS_TONE: Record<PurchaseOrderStatus, Tone> = {
  BOZZA: 'neutro',
  ORDINATO: 'corso',
  RICEVUTO_PARZIALE: 'avviso',
  RICEVUTO: 'ok',
  ANNULLATO: 'errore',
};

export const SALES_STATUS_TONE: Record<SalesOrderStatus, Tone> = {
  BOZZA: 'neutro',
  PREVENTIVO: 'neutro',
  CONFERMATO: 'corso',
  IN_PRELIEVO: 'corso',
  IMBALLATO: 'corso',
  SPEDITO: 'corso',
  CONSEGNATO: 'ok',
  ANNULLATO: 'errore',
};

export const PICKLIST_STATUS_TONE: Record<PickListStatus, Tone> = {
  APERTA: 'neutro',
  IN_CORSO: 'corso',
  COMPLETATA: 'ok',
  ANNULLATA: 'errore',
};

export const NOTIFICATION_TONE: Record<NotificationLevel, Tone> = {
  INFO: 'neutro',
  AVVISO: 'avviso',
  CRITICO: 'errore',
};

/**
 * Date con anno a QUATTRO cifre, ovunque.
 *
 * `dateStyle: 'short'` per l'italiano dà `31/07/26` (CLDR: `dd/MM/yy`), mentre
 * i report e le esportazioni scrivono `31/07/2026`: lo stesso giorno appariva in
 * due forme diverse a seconda della schermata. Su documenti di magazzino che si
 * stampano e si archiviano per anni, l'anno a due cifre è anche ambiguo di per
 * sé — un ricevimento del 2026 e uno del 2036 si leggono uguali.
 */
const DATE = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const DATETIME = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return DATE.format(typeof d === 'string' ? new Date(d) : d);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return DATETIME.format(typeof d === 'string' ? new Date(d) : d);
}
