// Минимален глобален „отвори 3D преглед" стор — не е Zustand slice нарочно: живее извън
// character store-а, монтиран е веднъж (<ItemViewer3DHost/> в App.tsx) и се чете отвсякъде,
// където Sprite показва предмет (виж Sprite.tsx onClick).
import { useSyncExternalStore } from 'react';

export interface ViewerTarget {
  kind: 'item';
  slug: string;
  name: string;
  category: string;
  sub_type?: string;
  tier: number;
  rarity: string;
}

let current: ViewerTarget | null = null;
const listeners = new Set<() => void>();

function emit(): void { for (const l of listeners) l(); }

export function openItemViewer3D(target: ViewerTarget): void {
  current = target;
  emit();
}

export function closeItemViewer3D(): void {
  current = null;
  emit();
}

export function useItemViewer3DTarget(): ViewerTarget | null {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
  );
}
