// The 3D view and its controls: open the fronts, explode the assembly (animated unless reduced motion is on),
// show the drilled holes, put the furniture in a room. Without WebGL the other tabs still work.
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
  $('#explode').addEventListener('input', (ev) => {
    viewer?.setExplode(Number(ev.target.value) / 100);
    $('#explode-out').textContent = `${ev.target.value}%`;
  });
  $('#ops').addEventListener('change', (ev) => viewer?.setShowOps(ev.target.checked));
  $('#room').addEventListener('change', (ev) => viewer?.setRoom(ev.target.checked));
  $('#explode-play').addEventListener('click', () => {
    const el = $('#explode');
    const target = Number(el.value) > 50 ? 0 : 100;
    const from = Number(el.value);
    if (reduceMotion.matches || !viewer) {
      el.value = String(target);
      el.dispatchEvent(new Event('input'));
      return;
    }
    const t0 = performance.now();
    const step = (now) => {
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
