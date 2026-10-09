// Мащабиране и местене на „сцената“ (платно + маркировки) във визуалния прозорец.
// Мишка: влачене и колелце; тъч: влачене и щипване; клавиатура: стрелки, + − 0.
// Трансформацията е само CSS (translate + scale) — платното се прерисува с по-висока резолюция след
// паузата (onSettle), за да остане острото при увеличение. Без анимации: движението е директно.

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 8;
const KEY_STEP = 64;

export function createPanZoom(viewport, stage, { onSettle, onKeyPage, onScale }) {
  let s = 1;
  let tx = 0;
  let ty = 0;
  let w0 = 1;
  let h0 = 1;
  let timer = 0;
  const pointers = new Map();
  let pinch = null;

  const clampAxis = (t, content, view) =>
    content * s <= view ? (view - content * s) / 2 : Math.min(0, Math.max(view - content * s, t));

  function apply() {
    tx = clampAxis(tx, w0, viewport.clientWidth);
    ty = clampAxis(ty, h0, viewport.clientHeight);
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    onScale?.(s);
    clearTimeout(timer);
    timer = setTimeout(() => onSettle(s), 160);
  }

  function zoomAt(factor, cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor));
    const k = next / s;
    tx = cx - (cx - tx) * k;
    ty = cy - (cy - ty) * k;
    s = next;
    apply();
  }

  function local(ev) {
    const r = viewport.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  const onWheel = (ev) => {
    ev.preventDefault();
    const { x, y } = local(ev);
    // deltaMode 1 (редове) при някои мишки; нормализиране към пиксели.
    const dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;
    zoomAt(Math.exp(-dy * 0.0016), x, y);
  };

  const onDown = (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    viewport.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    viewport.classList.add('is-grabbing');
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    }
  };

  const onMove = (ev) => {
    const prev = pointers.get(ev.pointerId);
    if (!prev) return;
    const cur = { x: ev.clientX, y: ev.clientY };
    if (pointers.size === 1) {
      tx += cur.x - prev.x;
      ty += cur.y - prev.y;
      pointers.set(ev.pointerId, cur);
      apply();
    } else if (pointers.size === 2 && pinch) {
      pointers.set(ev.pointerId, cur);
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const r = viewport.getBoundingClientRect();
      zoomAt(dist / pinch.dist, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch.dist = dist;
    }
  };

  const onUp = (ev) => {
    pointers.delete(ev.pointerId);
    pinch = null;
    if (pointers.size === 0) viewport.classList.remove('is-grabbing');
  };

  const onKey = (ev) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const step = ev.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    const moves = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (moves[ev.key]) {
      tx += moves[ev.key][0];
      ty += moves[ev.key][1];
      apply();
    } else if (ev.key === '+' || ev.key === '=') zoomAt(1.25);
    else if (ev.key === '-' || ev.key === '_') zoomAt(0.8);
    else if (ev.key === '0') api.fit();
    else if (ev.key === 'PageDown' || ev.key === ']') onKeyPage(1);
    else if (ev.key === 'PageUp' || ev.key === '[') onKeyPage(-1);
    else return;
    ev.preventDefault();
  };

  viewport.addEventListener('wheel', onWheel, { passive: false });
  viewport.addEventListener('pointerdown', onDown);
  viewport.addEventListener('pointermove', onMove);
  viewport.addEventListener('pointerup', onUp);
  viewport.addEventListener('pointercancel', onUp);
  viewport.addEventListener('keydown', onKey);

  const api = {
    scale: () => s,
    /** Нова страница със своя основен размер (CSS px при мащаб 1). */
    reset(width, height) {
      w0 = width;
      h0 = height;
      s = 1;
      tx = 0;
      ty = 0;
      apply();
    },
    fit() {
      s = 1;
      tx = 0;
      ty = 0;
      apply();
    },
    zoomBy: (f) => zoomAt(f),
    /** Центрира точка от страницата (в основни px) при мащаб `scale`. */
    focus(x, y, scale) {
      s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
      tx = viewport.clientWidth / 2 - x * s;
      ty = viewport.clientHeight / 2 - y * s;
      apply();
    },
    destroy() {
      clearTimeout(timer);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('pointerdown', onDown);
      viewport.removeEventListener('pointermove', onMove);
      viewport.removeEventListener('pointerup', onUp);
      viewport.removeEventListener('pointercancel', onUp);
      viewport.removeEventListener('keydown', onKey);
    },
  };
  return api;
}
