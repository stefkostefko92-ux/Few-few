// Монтира се веднъж (App.tsx). Nulla тежест докато `current` е null — самият модал (three.js +
// генератора) е lazy chunk, зареден само при първия клик върху предмет.
import { Suspense, lazy } from 'react';
import { closeItemViewer3D, useItemViewer3DTarget } from './viewerStore';

const ItemViewer3DModal = lazy(() => import('./ItemViewer3DModal'));

export default function ItemViewer3DHost(): React.ReactElement | null {
  const target = useItemViewer3DTarget();
  if (!target) return null;
  return (
    <Suspense fallback={null}>
      <ItemViewer3DModal target={target} onClose={closeItemViewer3D} />
    </Suspense>
  );
}
