// The buttons over a drawing's dimensions (EditableDrawing.tsx), sized for a finger without covering each other. Pure.
import type { Box, Hit } from '@/drawing';

/** The buttons' boxes on paper: each dimension's lettering grown to `min` each way, but never past the line halfway
 *  to a neighbouring lettering, so a tap on a small screen reaches the dimension under the finger. */
export function hitBoxes(hits: readonly Hit[], min: number): Box[] {
  return hits.map(({ box: o }, i) => {
    const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2, hw = Math.max(min, o.x1 - o.x0) / 2, hh = Math.max(min, o.y1 - o.y0) / 2;
    let x0 = Math.min(o.x0, cx - hw), x1 = Math.max(o.x1, cx + hw), y0 = Math.min(o.y0, cy - hh), y1 = Math.max(o.y1, cy + hh);
    hits.forEach(({ box: q }, j) => {
      if (j === i) return;
      // apart across x, across y (−1: not); the line halfway along the axis they are further apart on
      const sx = q.x0 >= o.x1 ? q.x0 - o.x1 : o.x0 >= q.x1 ? o.x0 - q.x1 : -1, sy = q.y0 >= o.y1 ? q.y0 - o.y1 : o.y0 >= q.y1 ? o.y0 - q.y1 : -1;
      if (sy >= 0 && sy >= sx) {
        if (q.y0 >= o.y1) y1 = Math.min(y1, Math.max(o.y1, (o.y1 + q.y0) / 2));
        else y0 = Math.max(y0, Math.min(o.y0, (q.y1 + o.y0) / 2));
      } else if (sx >= 0) {
        if (q.x0 >= o.x1) x1 = Math.min(x1, Math.max(o.x1, (o.x1 + q.x0) / 2));
        else x0 = Math.max(x0, Math.min(o.x0, (q.x1 + o.x0) / 2));
      }
    });
    return { x0, y0, x1, y1 };
  });
}
