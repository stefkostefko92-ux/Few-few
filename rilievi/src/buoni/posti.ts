import { CONTROLLO_KEYS, FIRME_FINALI, type ControlloKey, type FirmaFinale } from './voci.js';

/**
 * Мястото на подпис на листа: редът с работа (`s-<id на реда>`), проверката (`c-<ключ>`) или подписът долу
 * (`f-<ключ>`). Едно място — най-много един подпис (`@@unique([buonoId, posto])`).
 */
export const postoRiga = (id: string): string => `s-${id}`;
export const postoControllo = (key: ControlloKey): string => `c-${key}`;
export const postoFinale = (key: FirmaFinale): string => `f-${key}`;

const POSTO = new RegExp(
  `^(?:s-[0-9a-f]{8}|c-(?:${CONTROLLO_KEYS.join('|')})|f-(?:${FIRME_FINALI.join('|')}))$`,
);

export type TipoPosto = 'riga' | 'controllo' | 'finale';

/** Видът на мястото, или null — не е място на подпис. */
export function tipoPosto(value: unknown): TipoPosto | null {
  if (typeof value !== 'string' || !POSTO.test(value)) return null;
  return value.startsWith('s-') ? 'riga' : value.startsWith('c-') ? 'controllo' : 'finale';
}
