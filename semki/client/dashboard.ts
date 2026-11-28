// Входът на главната (esbuild → public/js/dashboard.js): 3D семената, прогнозата, бързото добавяне и
// опресняването на 5 минути — но не докато се пише във формата.
import { mountChart } from './chart.js';
import { readChart, readScene } from './data.js';
import { mountSeeds } from './tiles.js';

const REFRESH_MS = 5 * 60_000;
const TYPE_KEY = 'semki.quickType';

const scene = readScene('scene-data');
if (scene) mountSeeds(scene);

const chart = readChart('chart-data');
const chartRoot = document.getElementById('chart');
if (chart && chartRoot) mountChart(chartRoot, chart);

// Бързото добавяне помни последния вид (само за този браузър — удобство, не данни).
const quick = document.getElementById('quick');
if (quick instanceof HTMLFormElement) {
  try {
    const last = localStorage.getItem(TYPE_KEY);
    const radio = last
      ? quick.querySelector<HTMLInputElement>(
          `input[name="seedTypeKey"][value="${CSS.escape(last)}"]`,
        )
      : null;
    if (radio) radio.checked = true;
  } catch {
    /* без хранилище — първият вид */
  }
  quick.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.name === 'seedTypeKey') {
      try {
        localStorage.setItem(TYPE_KEY, t.value);
      } catch {
        /* без хранилище */
      }
    }
  });
}

// Процентите текат: презареждане на 5 минути, само когато страницата се вижда и никой не пише.
const loadedAt = Date.now();
const busy = () => {
  const a = document.activeElement;
  // избран вид (радио) или отметка не са писане — иначе фокусът спира опресняването завинаги
  const typing =
    a instanceof HTMLInputElement ? a.type !== 'radio' && a.type !== 'checkbox' : false;
  if (typing || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement) return true;
  const count = document.getElementById('q-count');
  return count instanceof HTMLInputElement && count.value !== '';
};
const maybeReload = () => {
  if (document.visibilityState === 'visible' && Date.now() - loadedAt >= REFRESH_MS && !busy())
    location.reload();
};
window.setInterval(maybeReload, 30_000);
document.addEventListener('visibilitychange', maybeReload);
