// Тема → boy tint речник (plate/trim/blade), споделен между buildItem.ts (самостоятелен предмет)
// и mannequin.ts (манекен/сет) — една дефиниция, не дублирана.
import type { ItemTheme } from './theme';

/** Кожа/плат нямат метален PBR отговор — тонираните steelA/steelB/goldB/brass клонинги (виж
 *  boy-materials.ts tintForItem) иначе излизат като полиран бронз, дори за „Leather Helm".
 *  Двете семейства, за които задачата изрично поиска матов вид. */
const NON_METAL_FAMILIES = new Set(['leather', 'cloth']);

export interface Tint {
  plate: string;
  trim: string;
  blade: string;
  /** true → tintForItem допълнително маха metalness/clearcoat и вдига roughness на клонингите. */
  nonMetal: boolean;
}

export function pickTint(theme: ItemTheme): Tint {
  return { plate: theme.primary, trim: theme.trim, blade: theme.secondary, nonMetal: NON_METAL_FAMILIES.has(theme.family) };
}
