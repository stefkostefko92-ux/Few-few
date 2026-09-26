// Минимален глобален „отвори 3D преглед" стор — не е Zustand slice нарочно: живее извън
// character store-а, монтиран е веднъж (<Viewer3DHost/> в App.tsx) и се чете отвсякъде, където
// Sprite/Sets показват предмет/сет (виж Sprite.tsx onClick, Sets.tsx). ЕДИН стор за предмет И
// сет — само едно от двете е отворено наведнъж, и по-важно, споделят СЪЩИЯ canvas+renderer
// (виж Viewer3DHost.tsx — вторият успореден WebGL контекст е забелязано да чупи софтуерния
// WebGL backend в headless/CI среда).
import { useSyncExternalStore } from 'react';

export interface ItemViewerTarget {
  kind: 'item';
  slug: string;
  name: string;
  category: string;
  sub_type?: string;
  tier: number;
  rarity: string;
}

export interface SetPiece { slug: string; name: string; category: string; sub_type?: string; tier: number; rarity?: string; missing?: boolean }
export interface SetViewerTarget {
  kind: 'set';
  slug: string;
  name: string;
  tier: number;
  pieces: SetPiece[];
}

export type ViewerTarget = ItemViewerTarget | SetViewerTarget;

let current: ViewerTarget | null = null;
const listeners = new Set<() => void>();

function emit(): void { for (const l of listeners) l(); }

export function openItemViewer3D(target: ItemViewerTarget): void {
  current = target;
  emit();
}

export function openSetViewer3D(target: SetViewerTarget): void {
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
