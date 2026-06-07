/**
 * 18-те населени места в община Бобов дол: град Бобов дол и 17 села.
 * Списъкът е по официалните наименования на общината. `slug` е стабилен
 * ключ за API-то; `isTown` отличава града от селата.
 */

export type Settlement = {
  slug: string;
  nameBg: string;
  isTown: boolean;
};

export const settlements: readonly Settlement[] = [
  { slug: 'bobov-dol', nameBg: 'Бобов дол', isTown: true },
  { slug: 'babino', nameBg: 'Бабино', isTown: false },
  { slug: 'babinska-reka', nameBg: 'Бабинска река', isTown: false },
  { slug: 'blato', nameBg: 'Блато', isTown: false },
  { slug: 'golema-fucha', nameBg: 'Голема Фуча', isTown: false },
  { slug: 'golem-varbovnik', nameBg: 'Голем Върбовник', isTown: false },
  { slug: 'goliamo-selo', nameBg: 'Голямо село', isTown: false },
  { slug: 'gorna-koznica', nameBg: 'Горна Козница', isTown: false },
  { slug: 'dolistovo', nameBg: 'Долистово', isTown: false },
  { slug: 'korkina', nameBg: 'Коркина', isTown: false },
  { slug: 'lokvata', nameBg: 'Локвата', isTown: false },
  { slug: 'mala-fucha', nameBg: 'Мала Фуча', isTown: false },
  { slug: 'malo-selo', nameBg: 'Мало село', isTown: false },
  { slug: 'mali-varbovnik', nameBg: 'Мали Върбовник', isTown: false },
  { slug: 'mlamolovo', nameBg: 'Мламолово', isTown: false },
  { slug: 'novoseliane', nameBg: 'Новоселяне', isTown: false },
  { slug: 'panicharevo', nameBg: 'Паничарево', isTown: false },
  { slug: 'shatrovo', nameBg: 'Шатрово', isTown: false },
] as const;

export function settlementBySlug(slug: string): Settlement | undefined {
  return settlements.find((s) => s.slug === slug);
}
