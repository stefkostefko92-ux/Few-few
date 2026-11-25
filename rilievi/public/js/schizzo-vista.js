// The view of the sketch editor: how much of the sheet the canvas shows (zoom 1–8) and where (pan), the
// mapping between the screen and the sheet, and the gestures that change it — pinch with two fingers,
// the wheel (with Ctrl or a trackpad pinch it zooms at the pointer, without it scrolls), dragging with
// one finger, the middle button or Space. A resize (rotation, the soft keyboard) keeps the point in the
// middle of the view where it was. `onChange(gesture)`: true while a gesture moves the view.
(() => {
  'use strict';

  window.rilieviSchizzoVista = ({ canvas, base, area, view, fitCanvases, onChange }) => {
    const W = view.larghezza;
    const H = view.altezza;
    const MAX_ZOOM = 8;
    let scale = 1; // device pixels per sheet unit at zoom 1
    let css = 1; // CSS pixels per sheet unit at zoom 1
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let pinch = null;

    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    const visibleW = () => W / zoom;
    const visibleH = () => H / zoom;
    const keepInside = () => {
      panX = clamp(panX, 0, W - visibleW());
      panY = clamp(panY, 0, H - visibleH());
    };

    // The sheet point under a point of the screen.
    const toSheet = (clientX, clientY) => {
      const box = canvas.getBoundingClientRect();
      return {
        x: panX + ((clientX - box.left) / box.width) * visibleW(),
        y: panY + ((clientY - box.top) / box.height) * visibleH(),
      };
    };
    // Sheet units in one CSS pixel — tolerances are in CSS pixels, the sheet in its own units.
    const unitsPerPx = () => 1 / (css * zoom);

    const fit = () => {
      const cx = panX + visibleW() / 2;
      const cy = panY + visibleH() / 2;
      scale = fitCanvases(area, [canvas, base]);
      css = parseFloat(canvas.style.width) / W || 1;
      panX = cx - visibleW() / 2;
      panY = cy - visibleH() / 2;
      keepInside();
      onChange(false);
    };

    // The transform that draws the sheet units of the view on a canvas of the editor.
    const apply = (ctx) => {
      const k = scale * zoom;
      ctx.setTransform(k, 0, 0, k, -panX * k, -panY * k);
    };

    // Zoom to `next`, keeping the sheet point `p` under the screen point (clientX, clientY).
    const zoomTo = (next, p, clientX, clientY) => {
      const box = canvas.getBoundingClientRect();
      zoom = clamp(next, 1, MAX_ZOOM);
      panX = p.x - ((clientX - box.left) / box.width) * visibleW();
      panY = p.y - ((clientY - box.top) / box.height) * visibleH();
      keepInside();
      onChange(true);
    };
    const zoomAt = (factor, clientX, clientY) =>
      zoomTo(zoom * factor, toSheet(clientX, clientY), clientX, clientY);
    const zoomCentre = (factor) => {
      const box = canvas.getBoundingClientRect();
      zoomAt(factor, box.left + box.width / 2, box.top + box.height / 2);
    };
    const panBy = (dx, dy) => {
      panX -= dx * unitsPerPx();
      panY -= dy * unitsPerPx();
      keepInside();
      onChange(true);
    };
    const reset = () => {
      zoom = 1;
      panX = 0;
      panY = 0;
      onChange(false);
    };

    // Two fingers: the distance between them zooms, the point between them stays under them.
    const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const pinchStart = (a, b) => {
      const m = middle(a, b);
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom, point: toSheet(m.x, m.y) };
    };
    const pinchMove = (a, b) => {
      if (!pinch) return;
      const m = middle(a, b);
      zoomTo(
        (pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance,
        pinch.point,
        m.x,
        m.y,
      );
    };
    const pinchEnd = () => {
      pinch = null;
    };

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        if (event.ctrlKey) zoomAt(Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
        else panBy(-event.deltaX, -event.deltaY);
      },
      { passive: false },
    );

    // The part of the sheet the canvas shows.
    const shown = () => ({ x0: panX, y0: panY, x1: panX + visibleW(), y1: panY + visibleH() });

    return {
      fit,
      shown,
      apply,
      toSheet,
      unitsPerPx,
      zoomAt,
      zoomCentre,
      panBy,
      reset,
      pinchStart,
      pinchMove,
      pinchEnd,
      get zoom() {
        return zoom;
      },
    };
  };
})();
