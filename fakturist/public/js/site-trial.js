/*
 * „Опитайте да подправите издаден документ“: смята SHA-256 на живо (SubtleCrypto) върху примерна верига от
 * три звена. Записът е опростен и е същият низ като в src/site-demo-chain.ts, затова началото „съвпада“.
 * Без този файл страницата показва готовите стойности. Промените се прилагат най-рано на 400 ms след
 * последния знак, така че цветът не сменя състояние по-често от 3 пъти в секунда (WCAG 2.3.1).
 */
(() => {
  'use strict';
  const box = document.querySelector('[data-trial]');
  if (!box) return;
  const d = box.dataset;
  const live = box.querySelector('[data-live]');
  if (!(window.crypto && crypto.subtle)) {
    live.textContent = d.mNocrypto;
    return;
  }
  const cards = Array.from(box.querySelectorAll('[data-ln]'));
  const edit = Number(d.edit);
  const input = box.querySelector('[data-amt]');
  const out = box.querySelector('[data-amt-st]');
  const eur = box.querySelector('.amt-eur');
  const ctl = box.querySelector('[data-ctl]');
  const bCent = box.querySelector('[data-cent]');
  const bReset = box.querySelector('[data-reset]');
  const orig = Number(cards[edit].dataset.cents);
  const lang = document.documentElement.lang === 'bg' ? 'bg-BG' : 'en-GB';
  const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR' });
  const plain = (c) => (c / 100).toFixed(2).replace('.', lang === 'bg-BG' ? ',' : '.');
  const enc = new TextEncoder();
  const short = (h) => `${h.slice(0, 8)}…${h.slice(-6)}`;
  const sha = async (s) => {
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  };
  const parse = (v) => {
    const m = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(v.replace(/[\s ]/g, ''));
    return m ? Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0) : null;
  };
  const mark = (node, ok) => {
    node.classList.toggle('eq', ok);
    node.classList.toggle('ne', !ok);
  };

  let seq = 0;
  let shown = d.mIntact;
  const run = async (cents) => {
    const mine = ++seq;
    const now = [];
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i].dataset;
      const value = i === edit ? cents : c.cents;
      now.push(await sha([d.prefix, c.no, c.date, value, c.prev].join('\n')));
    }
    if (mine !== seq) return;
    cards.forEach((card, i) => {
      const f = (k) => card.querySelector(`[data-f="${k}"]`);
      const linkOk = i === 0 || now[i - 1] === card.dataset.prev;
      const hashOk = now[i] === card.dataset.hash;
      if (i > 0) {
        f('prevNow').textContent = short(now[i - 1]);
        mark(f('prevNow'), linkOk);
      }
      f('now').textContent = short(now[i]);
      mark(f('now'), hashOk);
      card.classList.toggle('is-bad', !(linkOk && hashOk));
      card.querySelector('[data-st-t]').textContent = linkOk && hashOk ? d.mOk : d.mBad;
    });
    const changed = cents !== orig;
    const text = changed ? d.mBroken.replace('{amount}', money.format(cents / 100)) : d.mIntact;
    if (text !== shown) live.textContent = shown = text;
    live.classList.toggle('is-bad', changed);
    bReset.hidden = !changed;
  };

  let timer = 0;
  const apply = (immediate) => {
    clearTimeout(timer);
    const go = () => {
      const cents = parse(input.value);
      input.toggleAttribute('aria-invalid', cents === null);
      if (cents === null) {
        if (shown !== d.mInvalid) live.textContent = shown = d.mInvalid;
        return;
      }
      run(cents);
    };
    if (immediate) go();
    else timer = setTimeout(go, 400);
  };

  input.setAttribute('aria-describedby', 'trial-live');
  input.hidden = eur.hidden = ctl.hidden = false;
  out.hidden = true;
  input.addEventListener('input', () => apply(false));
  bCent.addEventListener('click', () => {
    input.value = plain(orig + 1);
    apply(true);
  });
  bReset.addEventListener('click', () => {
    input.value = plain(orig);
    apply(true);
    input.focus();
  });
  run(orig);
})();
