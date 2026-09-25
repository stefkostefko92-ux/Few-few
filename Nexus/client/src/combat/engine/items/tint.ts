// Тема → boy tint речник (plate/trim/blade), споделен между buildItem.ts (самостоятелен предмет)
// и mannequin.ts (манекен/сет) — една дефиниция, не дублирана.
import type { ItemTheme } from './theme';

export function pickTint(theme: ItemTheme): { plate: string; trim: string; blade: string } {
  return { plate: theme.primary, trim: theme.trim, blade: theme.secondary };
}
