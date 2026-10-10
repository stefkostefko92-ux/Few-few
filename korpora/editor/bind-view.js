// The 3D view and its controls: open the fronts, explode the assembly (animated unless reduced motion is on),
// show the drilled holes, put the furniture in a room, the photorealistic view and its PNG. Without WebGL the other
// tabs still work.
import { $, esc, localDate, pct, reduceMotion } from './dom.js';
import { Viewer } from './viewer.js';

export function createViewer(text) {
  let viewer = null;
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
    const view = new Viewer($('#stage'));
    // on a phone the form is under the view: while the view is scrolled out of sight it draws nothing, so the GPU
    // and the page are free for typing; it draws the changes once it is back
    new IntersectionObserver(([entry]) => {
      view.inSight = entry.isIntersecting;
    }).observe($('#stage'));
    viewer = view;
  } catch {
    // the stage keeps its size (nothing under it moves) and says what to do; the 3D controls, which would do
    // nothing, go
    $('#stage').innerHTML =
      `<div class="nogl"><svg class="i" aria-hidden="true" focusable="false"><use href="#i-alert"/></svg>` +
      `<p><strong>${esc(text.noWebgl)}</strong> ${esc(text.noWebglHint)}</p>` +
      `<button type="button" class="btn btn-small" data-tab-go="bom">${esc(text.toBom)}</button></div>`;
    $('.viewbar').hidden = true;
    $('#panel-view > .hint').hidden = true;
  }
  $('#open').addEventListener('input', (ev) => {
    viewer?.setOpen(Number(ev.target.value) / 100);
    $('#open-out').textContent = pct(Number(ev.target.value));
  });
  // the explode animation running now (its number); a new click or a hand on the slider takes over from it
  let playing = 0;
  $('#explode').addEventListener('input', (ev) => {
    if (ev.isTrusted) playing += 1;
    viewer?.setExplode(Number(ev.target.value) / 100);
    $('#explode-out').textContent = pct(Number(ev.target.value));
  });
  $('#ops').addEventListener('change', (ev) => viewer?.setShowOps(ev.target.checked));
  $('#room').addEventListener('change', (ev) => viewer?.setRoom(ev.target.checked));
  // a reload or a step back in the history can bring the controls back as they were left (the browser restores them
  // without an event): the view and the percentages start from what the controls show
  for (const el of [$('#open'), $('#explode')])
    if (el.value !== el.defaultValue) el.dispatchEvent(new Event('input'));
  for (const el of [$('#ops'), $('#room')])
    if (el.checked !== el.defaultChecked) el.dispatchEvent(new Event('change'));
  bindPhoto(viewer, text);
  $('#explode-play').addEventListener('click', () => {
    const el = $('#explode');
    const target = Number(el.value) > 50 ? 0 : 100;
    const from = Number(el.value);
    const run = ++playing;
    if (reduceMotion.matches || !viewer) {
      el.value = String(target);
      el.dispatchEvent(new Event('input'));
      return;
    }
    const t0 = performance.now();
    const step = (now) => {
      if (run !== playing) return;
      const t = Math.min(1, (now - t0) / 900);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      el.value = String(Math.round(from + (target - from) * e));
      el.dispatchEvent(new Event('input'));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  return viewer;
}

function bindPhoto(viewer, text) {
  const button = $('#photo');
  const save = $('#photo-save');
  const state = $('#photo-state');
  if (!viewer) {
    button.hidden = true;
    return;
  }
  let on = false;
  let shown = -1;
  // announced in steps of 10 % (the status is a polite live region)
  viewer.onPhoto = (samples) => {
    const pct = Math.min(100, Math.floor((samples / viewer.photoMode.target) * 10) * 10);
    if (pct === shown || !on) return;
    shown = pct;
    state.textContent =
      pct >= 100 ? text.photoReady : text.photoProgress.replace('{pct}', String(pct));
  };
  const fail = (message) => {
    on = false;
    button.setAttribute('aria-pressed', 'false');
    save.hidden = true;
    state.textContent = message;
  };
  // the path tracer stopped by itself (lost GPU, failed hand-over): back to the normal view
  viewer.onPhotoError = () => fail(text.photoFailed);
  button.addEventListener('click', async () => {
    on = !on;
    const want = on;
    shown = -1;
    button.setAttribute('aria-pressed', String(on));
    save.hidden = !on;
    state.textContent = on ? text.photoPreparing : '';
    try {
      if (!(await viewer.setPhoto(want))) {
        fail(text.photoUnsupported);
        button.disabled = true;
      }
    } catch {
      if (on !== want) return; // clicked again meanwhile: that click decides
      fail(text.photoFailed);
      await viewer.setPhoto(false).catch(() => {}); // freeing what is left: nothing more to report
    }
  });
  save.addEventListener('click', async () => {
    // still preparing: there is no picture yet
    if (!viewer.photo) {
      state.textContent = text.photoPreparing;
      return;
    }
    try {
      const blob = await viewer.photo.snapshot();
      if (!blob) throw new Error('no image');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `korpora-${localDate()}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch {
      state.textContent = text.photoSaveFailed;
    }
  });
}
