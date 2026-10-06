// The free area in front of the control panel in the machine room (UNI EN 81-20:2020, 5.2.6.3.2.1 a); registry
// vano.locale.macchina): at least KV_VERT.panelFreeDepth deep and as wide as the larger of KV_VERT.panelFreeWidth and the
// panel. Pure: room axes as in RoomInputs (x along the front wall from the left, y from the front wall inwards), mm.
import { KV_VERT } from './norme-vert';
import type { RoomInputs } from './room';

/** How deep the free area in front of the panel is [mm]: from the panel's front to the opposite wall, or to the machine
 *  where its outline `box` [x0, y0, x1, y1] (with its bedplate and pulley stand) stands in front of the panel. The area
 *  is centred on the panel and kept inside its wall. */
export function panelFree(R: RoomInputs, box?: readonly [number, number, number, number] | null): number {
  const alongX = R.panelWall === 'front' || R.panelWall === 'rear', wallLen = alongX ? R.W : R.D, across = alongX ? R.D : R.W;
  const w = Math.max(KV_VERT.panelFreeWidth, R.panelW), c = R.panelAt + R.panelW / 2;
  const s0 = Math.min(Math.max(c - w / 2, 0), Math.max(0, wallLen - w)), s1 = s0 + w;
  let depth = across - R.panelD;
  if (box) {
    const [x0, y0, x1, y1] = box, [b0, b1] = alongX ? [x0, x1] : [y0, y1];
    if (b0 < s1 && s0 < b1) {
      // the machine's near side, measured from the panel's wall
      const near = R.panelWall === 'front' ? y0 : R.panelWall === 'rear' ? R.D - y1 : R.panelWall === 'left' ? x0 : R.W - x1;
      depth = Math.min(depth, near - R.panelD);
    }
  }
  return depth;
}
