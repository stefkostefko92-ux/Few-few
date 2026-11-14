/*
 * Начална страница (витрина): линиите между полетата на фактурата и XML-а, „Покажи отново“, линията до
 * 01.07.2028 по скрола и разкриването на секциите. Съдържанието е пълно и без този файл; при
 * `prefers-reduced-motion: reduce` не се движи нищо (линиите са начертани в крайния си вид).
 * Само външен файл (CSP): стиловете се пипат през CSSOM (`style.setProperty`), не през атрибут.
 */
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs) => {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  };

  // 1. „Живата фактура“: линия от всяко поле до номера му в XML (само на широк екран, където са един до друг).
  const stage = $('[data-stage]');
  if (stage) {
    stage.classList.add('is-js');
    const wire = $('[data-wire]', stage);
    const grid = $('.stage-grid', stage);
    const inv = $('[data-inv]', stage);
    const xml = $('[data-xml]', stage);
    const wide = matchMedia('(min-width: 72rem)');
    const pairs = [];
    $$('[data-bt]', inv).forEach((a) => {
      const b = $(`.xl[data-bt="${a.dataset.bt}"]`, xml);
      if (b) pairs.push({ a, b });
    });
    const parts = pairs.map((_, n) => ({
      clip: el('clipPath', { id: `wc${n}` }),
      rect: el('rect', { class: `wclip i${n}` }),
      path: el('path', { 'clip-path': `url(#wc${n})` }),
      d0: el('circle', { r: 2.5, class: `i${n}` }),
      d1: el('circle', { r: 2.5, class: `i${n}` }),
    }));
    parts.forEach((p) => {
      p.clip.appendChild(p.rect);
      wire.append(p.clip, p.path, p.d0, p.d1);
    });
    const draw = () => {
      if (!wide.matches) return;
      const g = grid.getBoundingClientRect();
      const x0 = inv.getBoundingClientRect().right - g.left;
      const x1 = xml.getBoundingClientRect().left - g.left;
      wire.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`);
      pairs.forEach(({ a, b }, n) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const y0 = ra.top + ra.height / 2 - g.top;
        const y1 = rb.top + rb.height / 2 - g.top;
        const dx = (x1 - x0) / 2;
        const p = parts[n];
        p.path.setAttribute('d', `M${x0} ${y0}C${x0 + dx} ${y0} ${x1 - dx} ${y1} ${x1} ${y1}`);
        p.rect.setAttribute('x', x0 - 1);
        p.rect.setAttribute('y', Math.min(y0, y1) - 4);
        p.rect.setAttribute('width', x1 - x0 + 2);
        p.rect.setAttribute('height', Math.abs(y1 - y0) + 8);
        p.d0.setAttribute('cx', x0);
        p.d0.setAttribute('cy', y0);
        p.d1.setAttribute('cx', x1);
        p.d1.setAttribute('cy', y1);
      });
    };
    let queued = false;
    const later = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        draw();
      });
    };
    draw();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    if ('ResizeObserver' in window) new ResizeObserver(later).observe(grid);
    else addEventListener('resize', later);
    const replay = $('[data-replay]', stage);
    if (replay) {
      replay.addEventListener('click', () => {
        stage.classList.add('rst');
        void stage.offsetWidth;
        stage.classList.remove('rst');
      });
    }
  }

  // 2. Пътят до 01.07.2028: линията расте със скрола; етапите светват, когато я стигне.
  const road = $('[data-road]');
  if (road && !reduce && 'IntersectionObserver' in window) {
    const fill = $('[data-fill]', road);
    const rail = $('.road-rail', road);
    const items = $$('[data-rd]', road);
    road.classList.add('road-live');
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const top = 0.4 * rem;
    const dotY = (li) => li.offsetTop + 0.75 * rem;
    const len = () => dotY(items[items.length - 1]) - top;
    const update = () => {
      const r = road.getBoundingClientRect();
      const end = Math.min(Math.max(innerHeight * 0.6 - r.top, top), top + len());
      rail.style.setProperty('height', `${len()}px`);
      fill.style.setProperty('--p', ((end - top) / len()).toFixed(4));
      items.forEach((li) => li.classList.toggle('is-on', dotY(li) <= end));
    };
    let queued = false;
    const on = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        update();
      });
    };
    new IntersectionObserver((entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      const act = visible ? addEventListener : removeEventListener;
      act('scroll', on, { passive: true });
      act('resize', on);
      if (visible) on();
    }).observe(road);
    update();
  }

  // 3. Разкриване на секциите: само под сгъвката, само веднъж, само преместване и прозрачност.
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.remove('rv-pre');
          e.target.classList.add('rv-in');
          io.unobserve(e.target);
        }),
      { rootMargin: '0px 0px -10% 0px' },
    );
    $$('[data-rv]').forEach((node) => {
      if (node.getBoundingClientRect().top <= innerHeight * 0.9) return;
      node.classList.add('rv-pre');
      io.observe(node);
    });
  }
})();
