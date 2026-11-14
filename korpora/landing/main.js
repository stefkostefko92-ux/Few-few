// The landing page's motion. Without this module the page is complete: the four steps read as text and the stage shows
// the first still. With it, the stage follows the step being read (stills, loaded only when needed), and after the
// reader's first interaction — on a device that can take it, with motion allowed — the live 3D scene (story.js, with
// three.js and the engine) takes the stage over. Anything that fails leaves the stills.
import { storyT, stepOf } from './timeline.js';

// The phone's section menu opens without script; with it, the menu also closes once a section is picked, on Escape
// and on a press outside it — otherwise it would stay open over the hero when the reader scrolls back up.
const menu = document.querySelector('.site-menu');
if (menu) {
  menu.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('a')) menu.open = false;
  });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !menu.open) return;
    menu.open = false;
    menu.querySelector('summary')?.focus();
  });
  addEventListener('pointerdown', (e) => {
    if (menu.open && !(e.target instanceof Node && menu.contains(e.target))) menu.open = false;
  });
}

const stage = document.querySelector('[data-story]');
const steps = [...document.querySelectorAll('[data-story-step]')];
if (stage && steps.length) init();

function webgl2() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

function init() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = matchMedia('(max-width: 899px)');
  const stills = window.__korporaStills === true; // scripts/landing-stills.ts drives the scene
  let forced = null;
  // the reading line: mid-screen, or — on a phone, under the sticky stage — mid of what is left below it
  const progress = () =>
    forced ??
    storyT(
      steps.map((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      }),
      innerHeight * (narrow.matches ? 0.74 : 0.52),
    );

  // stills: the stage shows the one for the step being read; the later ones load the first time they are needed
  let shown = 0;
  const showStep = (n) => {
    if (n === shown) return;
    shown = n;
    stage.dataset.step = String(n);
    // while the live scene runs, the stills are not shown and need not load
    if (stage.classList.contains('is-live')) return;
    const img = stage.querySelector(`[data-still="${n}"]`);
    if (img?.dataset.src) {
      if (img.dataset.srcset) img.srcset = img.dataset.srcset;
      img.src = img.dataset.src;
      delete img.dataset.src;
      delete img.dataset.srcset;
    }
  };
  // the balloon of the step being read; none while the reader is still above the steps
  let current = 0;
  const markStep = (n) => {
    if (n === current) return;
    steps[current - 1]?.classList.remove('is-current');
    steps[n - 1]?.classList.add('is-current');
    current = n;
  };
  const update = () => {
    const t = progress();
    showStep(stepOf(t));
    markStep(t < -0.5 ? 0 : stepOf(t));
  };
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      update();
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  update();

  // the read-out's numbers come with the page; the live scene only moves its G-code line along with the router
  const line = stage.querySelector('[data-story-line]');
  const first = line?.textContent ?? '';
  const fill = (info) => {
    if (!line) return;
    const at = Math.floor((info.done / Math.max(1, info.steps)) * info.program.length);
    const text = info.done ? info.program[Math.min(info.program.length - 1, at)] : first;
    if (line.textContent !== text) line.textContent = text;
  };

  const capable =
    !reduce.matches &&
    !navigator.connection?.saveData &&
    (navigator.deviceMemory === undefined || navigator.deviceMemory >= 2) &&
    webgl2();
  if (!capable && !stills) return;

  let started = false;
  const start = async (e) => {
    // Chromium sends a pointermove of its own after loading when the cursor rests over the page: without movement it
    // is not the reader's, and taking it would load the scene for every visit (and every page-speed test)
    if (e?.type === 'pointermove' && !e.movementX && !e.movementY) return;
    if (started) return;
    started = true;
    for (const type of TRIGGERS) removeEventListener(type, start);
    if (reduce.matches && !stills) return; // motion switched off since the page loaded
    try {
      const { startStory } = await import('./story.js');
      const host = stage.querySelector('[data-story-gl]');
      const story = await startStory(host, {
        example: JSON.parse(stage.dataset.example),
        progress,
        timed: !stills,
        onReady(info) {
          fill(info);
          stage.classList.add('is-live');
          const tick = () => {
            if (!stage.classList.contains('is-live')) return;
            fill(info);
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        },
        onFail() {
          stage.classList.remove('is-live');
          if (line) line.textContent = first;
          shown = 0;
          showStep(stepOf(progress()));
        },
      });
      if (stills)
        Object.assign(window.korporaStory, {
          set(t) {
            forced = t;
            showStep(stepOf(t));
          },
          still: story.still,
        });
    } catch {
      stage.classList.remove('is-live');
    }
  };
  const TRIGGERS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
  // the stills script starts the scene itself, once the stage fills its frame (the sheets are laid out for its shape)
  if (stills) window.korporaStory = { start };
  else for (const type of TRIGGERS) addEventListener(type, start, { passive: true });
}
