// Zoom and pan of a drawing through its viewBox, so the lines stay sharp at any scale: the wheel or two fingers zoom
// at the pointer, a drag moves the sheet, a double click or 0 shows the whole sheet again, + − and the arrows work
// from the keyboard. Only while the drawing is on full screen — on the page the wheel scrolls the page.
const MAX_ZOOM = 40;
const STEP = 1.25;

export class PanZoom {
  // box: the element whose own <svg> child is the drawing (it is redrawn in place: a new <svg> of the same sheet
  // keeps the view — the CNC simulation redraws every frame — another sheet starts whole). All drawings share one
  // A3 viewBox, so a sheet is told by its viewBox and its name (aria-label: the part or the sheet).
  constructor(box) {
    this.box = box;
    this.on = false;
    this.svg = null;
    this.base = null; // the drawing's own viewBox
    this.name = null; // the drawing's name (not `key`: an own property would hide the key() handler)
    this.view = null; // the part of it on screen
    this.pointers = new Map();
    this.pinch = null;
    new MutationObserver(() => this.adopt()).observe(box, { childList: true });
    box.addEventListener('wheel', (ev) => this.wheel(ev), { passive: false });
    box.addEventListener('pointerdown', (ev) => this.down(ev));
    box.addEventListener('pointermove', (ev) => this.move(ev));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      box.addEventListener(type, (ev) => this.up(ev));
    box.addEventListener('dblclick', () => this.on && this.fit());
    box.addEventListener('keydown', (ev) => this.key(ev));
    this.adopt();
  }

  adopt() {
    const svg = this.box.querySelector(':scope > svg');
    if (svg === this.svg) return;
    this.svg = svg;
    const vb = svg?.viewBox.baseVal;
    if (!vb || !vb.width || !vb.height) {
      this.base = null;
      return;
    }
    const base = { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
    const key = svg.getAttribute('aria-label');
    const same =
      this.base && this.name === key && ['x', 'y', 'w', 'h'].every((k) => this.base[k] === base[k]);
    this.base = base;
    this.name = key;
    if (!same || !this.view) this.view = { ...base };
    if (this.on) this.apply();
  }

  enable(on) {
    this.on = on;
    this.box.classList.toggle('pz', on);
    if (on) {
      this.box.tabIndex = 0;
      this.adopt();
    } else {
      this.box.removeAttribute('tabindex');
      this.pointers.clear();
      this.pinch = null;
    }
    if (this.base) {
      this.view = { ...this.base };
      this.apply();
    }
  }

  apply() {
    const v = this.view;
    if (this.svg && v) this.svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  }

  // drawing units per screen pixel (the viewBox is fitted whole into the element, so one scale for both axes)
  unit() {
    const r = this.svg.getBoundingClientRect();
    return Math.max(this.view.w / r.width, this.view.h / r.height);
  }

  // the point of the drawing under a screen point
  at(cx, cy) {
    const m = this.svg.getScreenCTM();
    if (!m) return null;
    return new DOMPoint(cx, cy).matrixTransform(m.inverse());
  }

  zoomAt(factor, cx, cy) {
    if (!this.base || !this.svg) return;
    const p = this.at(cx, cy);
    if (!p) return;
    const w = Math.min(this.base.w, Math.max(this.base.w / MAX_ZOOM, this.view.w / factor));
    const k = w / this.view.w;
    this.view = {
      x: p.x - (p.x - this.view.x) * k,
      y: p.y - (p.y - this.view.y) * k,
      w,
      h: this.view.h * k,
    };
    this.clamp();
    this.apply();
  }

  zoomBy(factor) {
    if (!this.svg) return;
    const r = this.svg.getBoundingClientRect();
    this.zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  }

  pan(dx, dy) {
    if (!this.base || !this.svg) return;
    const u = this.unit();
    this.view.x -= dx * u;
    this.view.y -= dy * u;
    this.clamp();
    this.apply();
  }

  fit() {
    if (!this.base) return;
    this.view = { ...this.base };
    this.apply();
  }

  // the centre of the view stays on the sheet: it cannot be dragged away and lost
  clamp() {
    const b = this.base;
    const v = this.view;
    const cx = Math.min(b.x + b.w, Math.max(b.x, v.x + v.w / 2));
    const cy = Math.min(b.y + b.h, Math.max(b.y, v.y + v.h / 2));
    v.x = cx - v.w / 2;
    v.y = cy - v.h / 2;
  }

  wheel(ev) {
    if (!this.on) return;
    ev.preventDefault();
    const lines = ev.deltaMode === 1 ? 40 : ev.deltaMode === 2 ? 400 : 1;
    this.zoomAt(Math.exp(-ev.deltaY * lines * 0.0015), ev.clientX, ev.clientY);
  }

  down(ev) {
    if (!this.on || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    if (ev.target.closest('button, select, input, a, label')) return; // the controls next to the drawing
    this.box.setPointerCapture?.(ev.pointerId);
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    this.pinch = this.pointers.size === 2 ? this.spread() : null;
  }

  move(ev) {
    const last = this.pointers.get(ev.pointerId);
    if (!this.on || !last) return;
    const next = { x: ev.clientX, y: ev.clientY };
    this.pointers.set(ev.pointerId, next);
    if (this.pointers.size === 1) {
      this.pan(next.x - last.x, next.y - last.y);
      return;
    }
    const now = this.spread();
    if (this.pinch && now.d > 0 && this.pinch.d > 0) {
      this.pan(now.x - this.pinch.x, now.y - this.pinch.y);
      this.zoomAt(now.d / this.pinch.d, now.x, now.y);
    }
    this.pinch = now;
  }

  up(ev) {
    this.pointers.delete(ev.pointerId);
    this.pinch = this.pointers.size === 2 ? this.spread() : null;
  }

  // the middle of two fingers and the distance between them
  spread() {
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  key(ev) {
    if (!this.on || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const r = this.box.getBoundingClientRect();
    const actions = {
      '+': () => this.zoomBy(STEP),
      '=': () => this.zoomBy(STEP),
      '-': () => this.zoomBy(1 / STEP),
      0: () => this.fit(),
      ArrowLeft: () => this.pan(r.width / 10, 0),
      ArrowRight: () => this.pan(-r.width / 10, 0),
      ArrowUp: () => this.pan(0, r.height / 10),
      ArrowDown: () => this.pan(0, -r.height / 10),
    };
    const act = actions[ev.key];
    if (!act) return;
    ev.preventDefault();
    act();
  }
}

export { STEP as ZOOM_STEP };
