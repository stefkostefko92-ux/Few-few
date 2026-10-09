// Страница от PDF във визуалния прозорец: платно + слой с маркировки + мащаб/местене.
// Само DOM API (textContent/CSSOM) — CSP не позволява inline style атрибути, а данни в innerHTML няма.

import { h } from '../dom.js';
import { locateRefs } from './highlight.js';
import { createPanZoom } from './panzoom.js';

const MAX_PIXELS = 16_000_000; // таван на платното (iOS Safari реже над ~16M)
const MARK_SCALE = 2; // отваряне директно към първия цитиран компонент

export function createPageView({ viewport, pdf, lib, onPage, onBusy, onScale, onGoto }) {
  const canvas = h('canvas', { class: 'pv-canvas', 'aria-hidden': 'true' });
  const marks = h('div', { class: 'pv-marks', 'aria-hidden': 'true' });
  const stage = h('div', { class: 'pv-stage' }, canvas, marks);
  viewport.append(stage);

  let pageNum = 0;
  let page = null;
  let baseScale = 1;
  let base = { w: 1, h: 1 };
  let renderedAt = 0;
  let task = null;
  // Отделни броячи: прерисуване след мащаб (draw) не бива да обезсилва смяна на страница (show).
  let drawSeq = 0;
  let showSeq = 0;
  let markEls = [];
  let markIdx = -1;
  let wanted = [];

  const pz = createPanZoom(viewport, stage, {
    onSettle: (s) => void draw(s),
    onKeyPage: (d) => onGoto(pageNum + d),
    onScale,
  });

  async function draw(zoom) {
    if (!page) return;
    const dpr = window.devicePixelRatio || 1;
    const cap = Math.sqrt(MAX_PIXELS / (base.w * base.h));
    const target = Math.min(Math.max(1, zoom) * dpr, cap);
    if (renderedAt && Math.abs(target - renderedAt) / renderedAt < 0.1) return;
    const mine = ++drawSeq;
    task?.cancel();
    const vp = page.getViewport({ scale: baseScale * target });
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.style.width = `${base.w}px`;
    canvas.style.height = `${base.h}px`;
    const ctx = canvas.getContext('2d', { alpha: false });
    task = page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' });
    onBusy(true);
    try {
      await task.promise;
      if (mine === drawSeq) renderedAt = target;
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') throw err;
    } finally {
      if (mine === drawSeq) onBusy(false);
    }
  }

  function placeMarks(rects) {
    marks.replaceChildren();
    markEls = rects.map((r) => {
      const pad = Math.max(2, r.h * 0.18);
      const el = h('span', { class: 'pv-mark' });
      el.style.left = `${r.x - pad}px`;
      el.style.top = `${r.y - r.h - pad}px`;
      el.style.width = `${r.w + pad * 2}px`;
      el.style.height = `${r.h + pad * 2}px`;
      el.style.transform = `rotate(${r.angle}rad)`;
      marks.append(el);
      return { el, r };
    });
    markIdx = -1;
  }

  /** → { found: Set<ref>, marks: число } — какво е намерено на страницата. */
  async function show(n, refs = []) {
    const num = Math.min(pdf.numPages, Math.max(1, Math.round(n)));
    wanted = refs;
    const mine = ++showSeq;
    task?.cancel();
    onBusy(true);
    const next = await pdf.getPage(num);
    if (mine !== showSeq) return { found: new Set(), marks: 0 };
    page = next;
    pageNum = num;
    const natural = page.getViewport({ scale: 1 });
    const width = Math.max(240, viewport.clientWidth);
    baseScale = width / natural.width;
    const vp = page.getViewport({ scale: baseScale });
    base = { w: vp.width, h: vp.height };
    stage.style.width = `${base.w}px`;
    stage.style.height = `${base.h}px`;
    renderedAt = 0;
    pz.reset(base.w, base.h);

    let result = { rects: [], found: new Set() };
    if (refs.length) {
      try {
        const text = await page.getTextContent();
        result = locateRefs(text.items, vp, lib.Util, refs);
      } catch {
        // без текстов слой няма позиции — остава списъкът
      }
      // Междувременно е поискана друга страница — тя печели, тази не пипа платното.
      if (mine !== showSeq) return { found: new Set(), marks: 0 };
    }
    placeMarks(result.rects);
    onPage(num);
    await draw(1);
    if (markEls.length) nextMark();
    return { found: result.found, marks: markEls.length };
  }

  function nextMark() {
    if (!markEls.length) return;
    markIdx = (markIdx + 1) % markEls.length;
    for (const [i, m] of markEls.entries()) m.el.classList.toggle('is-current', i === markIdx);
    const { r } = markEls[markIdx];
    pz.focus(r.x + r.w / 2, r.y - r.h / 2, MARK_SCALE);
  }

  const ro = new ResizeObserver(() => {
    if (page && viewport.clientWidth > 0 && Math.abs(viewport.clientWidth - base.w) > 24) {
      void show(pageNum, wanted);
    }
  });
  ro.observe(viewport);

  return {
    show,
    nextMark,
    hasMarks: () => markEls.length > 0,
    zoomIn: () => pz.zoomBy(1.25),
    zoomOut: () => pz.zoomBy(0.8),
    fit: () => pz.fit(),
    scale: () => pz.scale(),
    pageNumber: () => pageNum,
    pageCount: () => pdf.numPages,
    destroy() {
      showSeq += 1; // чакащ show() не докосва платното след затваряне
      ro.disconnect();
      task?.cancel();
      pz.destroy();
      // iOS Safari освобождава паметта на платното късно — нулираме го изрично.
      canvas.width = 0;
      canvas.height = 0;
      stage.remove();
    },
  };
}
