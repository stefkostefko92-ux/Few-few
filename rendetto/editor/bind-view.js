// The 3D view and its controls: open the fronts, explode the assembly (animated unless reduced motion is on),
// show the drilled holes, put the furniture in a room, the photorealistic view and its PNG. Without WebGL the other
// tabs still work.
import { $, esc, reduceMotion } from './dom.js';
import { Viewer } from './viewer.js';

export function createViewer(text) {
  let viewer = null;
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
    viewer = new Viewer($('#stage'));
  } catch {
    $('#stage').innerHTML = `<p class="nogl">${esc(text.noWebgl)}</p>`;
  }
  $('#open').addEventListener('input', (ev) => {
    viewer?.setOpen(Number(ev.target.value) / 100);
    $('#open-out').textContent = `${ev.target.value}%`;
  });
  // the explode animation running now (its number); a new click or a hand on the slider takes over from it
  let playing = 0;
  $('#explode').addEventListener('input', (ev) => {
    if (ev.isTrusted) playing += 1;
    viewer?.setExplode(Number(ev.target.value) / 100);
    $('#explode-out').textContent = `${ev.target.value}%`;
  });
  $('#ops').addEventListener('change', (ev) => viewer?.setShowOps(ev.target.checked));
  $('#room').addEventListener('change', (ev) => viewer?.setRoom(ev.target.checked));
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
      await viewer.setPhoto(false);
    }
  });
  save.addEventListener('click', async () => {
    const blob = await viewer.photo?.snapshot();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rendetto-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  });
}
