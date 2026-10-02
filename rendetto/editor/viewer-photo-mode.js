// The photorealistic view switched on and off. The path tracer is loaded on first use (a separate chunk), gets the
// scene again whenever it changes (once the changes settle: sliders send many), frees its GPU memory when switched
// off, and gives way to the normal view if it fails. When clicks outrun the loading, the last one wins.
const SETTLE_MS = 160;

export class PhotoMode {
  constructor(viewer) {
    this.v = viewer;
    this.wanted = false;
    this.renderer = null; // the PhotoRenderer while the view is on
    this.target = 0; // samples of a finished picture
    this.stale = 0; // when the scene last changed, until it is handed over
    this.module = null;
  }

  // Resolves to false if the path tracer cannot run on this device.
  async set(on) {
    this.wanted = on;
    if (!on) {
      this.drop();
      return true;
    }
    this.module ??= import('./viewer-photo.js').catch((err) => {
      this.module = null;
      throw err;
    });
    const mod = await this.module;
    if (!mod.photoSupported(this.v.renderer)) {
      this.wanted = false;
      return false;
    }
    if (!this.wanted || this.renderer) return true;
    this.target = mod.TARGET_SAMPLES;
    this.renderer = new mod.PhotoRenderer(this.v);
    this.renderer.start();
    this.v.invalidate();
    return true;
  }

  // the path tracer's buffers, BVH and texture array are large: free them; the module stays loaded
  drop() {
    this.renderer?.dispose();
    this.renderer = null;
    this.stale = 0;
    this.v.invalidate();
  }

  changed() {
    if (this.renderer) this.stale = performance.now();
  }

  moved() {
    this.renderer?.moved();
  }

  // One frame of the photorealistic view; false when the normal view should be drawn instead.
  frame() {
    const r = this.renderer;
    if (!r) return false;
    try {
      if (this.stale) {
        if (performance.now() - this.stale < SETTLE_MS) return false;
        this.stale = 0;
        r.start();
      }
      if (r.render()) this.v.onPhoto?.(r.samples);
      return true;
    } catch (err) {
      this.wanted = false;
      this.drop();
      this.v.onPhotoError?.(err);
      return false;
    }
  }
}
