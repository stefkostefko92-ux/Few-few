// Rilievi Impianti — progressive enhancement. Every page works without this file: search submits,
// forms post, print uses the browser menu. This only makes the same things faster on the device.
(() => {
  'use strict';

  // Live search: the server renders the results fragment (X-Partial), we swap it in and keep the URL.
  const searchForm = document.querySelector('[data-live-search]');
  const results = document.querySelector('[data-results]');
  const searchStatus = document.getElementById('search-status');
  if (searchForm && results) {
    const input = searchForm.querySelector('input[name="q"]');
    let timer = 0;
    let controller = null;
    const run = async () => {
      const url = new URL(searchForm.action, location.href);
      const q = input.value.trim();
      if (q) url.searchParams.set('q', q);
      // The Master's company filter rides along (a hidden field of the search form).
      const azienda = searchForm.querySelector('input[name="azienda"]');
      if (azienda && azienda.value) url.searchParams.set('azienda', azienda.value);
      if (controller) controller.abort();
      controller = new AbortController();
      try {
        const response = await fetch(url, {
          headers: { 'X-Partial': '1' },
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (response.status === 401) {
          location.reload();
          return;
        }
        if (!response.ok) return;
        results.innerHTML = await response.text();
        const box = results.firstElementChild;
        if (searchStatus && box && box.dataset.status)
          searchStatus.textContent = box.dataset.status;
        history.replaceState(null, '', url.pathname + url.search);
      } catch {
        // A newer keystroke aborted this request, or the network dropped: the last results stay.
      }
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(run, 220);
    });
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      clearTimeout(timer);
      run();
    });
    // "/" jumps to the search bar from anywhere on the list, like most search-first tools.
    document.addEventListener('keydown', (event) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        input.focus();
        input.select();
      }
    });
  }

  // Fields and sections that only make sense for some answers (fields.ts `when`): "Numero serrature"
  // with "Serrature: Sì", the door operator with automatic doors, the power unit of a hydraulic lift
  // and no machine there (`data-when-not`: none of the values). A field inside something hidden says
  // nothing, so what depends on it hides too; a second pass settles a section moved above the field it
  // depends on (the company's order). The server ignores them too.
  const conditional = Array.from(document.querySelectorAll('[data-when]'));
  const syncConditions = () => {
    for (let pass = 0; pass < 2; pass += 1) {
      conditional.forEach((el) => {
        const control = document.getElementById(`f-${el.dataset.when}`);
        const values = (el.dataset.whenValues || '').split(' ');
        const chosen = Array.from(
          document.querySelectorAll(`input[name="${el.dataset.when}"]:checked`),
          (input) => input.value,
        );
        const has =
          !(control && control.closest('[data-off]')) &&
          chosen.some((value) => values.includes(value));
        el.toggleAttribute('data-off', 'whenNot' in el.dataset ? has : !has);
      });
    }
  };
  if (conditional.length) document.addEventListener('change', syncConditions);

  // Old push-button panels: one row per stop, as many as "Fermate" says. New rows come from the
  // template; rows above the number are hidden, never removed, so a typo in the number loses nothing.
  const misure = document.querySelector('[data-misure]');
  const fermate = document.getElementById('f-fermate');
  if (misure && fermate) {
    const rowsBox = misure.querySelector('[data-misure-rows]');
    const template = misure.querySelector('[data-misure-template]');
    const empty = misure.querySelector('[data-misure-empty]');
    const max = Number(misure.dataset.max) || 0;
    fermate.addEventListener('input', () => {
      const raw = fermate.value.trim();
      const n = /^\d{1,3}$/.test(raw) ? Number(raw) : 0;
      const wanted = n >= 1 && n <= max ? n : 0;
      for (let i = rowsBox.querySelectorAll('[data-misura]').length + 1; i <= wanted; i += 1) {
        rowsBox.insertAdjacentHTML('beforeend', template.innerHTML.replaceAll('__N__', String(i)));
      }
      rowsBox.querySelectorAll('[data-misura]').forEach((row) => {
        row.hidden = Number(row.dataset.misura) > wanted;
      });
      if (empty) empty.hidden = wanted > 0;
    });
  }

  // Yes/No and single choices can go back to "not marked": clicking the ticked box again clears it.
  // Delegated, so the rows added above behave the same.
  document.addEventListener('pointerdown', (event) => {
    const label = event.target instanceof Element ? event.target.closest('label') : null;
    const radio = label ? label.querySelector('input[data-clearable]') : null;
    if (radio) radio.dataset.was = String(radio.checked);
  });
  document.addEventListener('click', (event) => {
    const radio = event.target;
    if (!(radio instanceof HTMLInputElement) || !radio.hasAttribute('data-clearable')) return;
    if (radio.dataset.was === 'true') {
      radio.checked = false;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
    radio.dataset.was = 'false';
  });

  // The long sheet form: warn before leaving with unsaved changes; never send a half-typed number.
  const schedaForm = document.querySelector('[data-scheda-form]');
  if (schedaForm) {
    let dirty = false;
    const hint = schedaForm.querySelector('[data-dirty-hint]');
    // The photo controls (file, caption) sit inside the sections but belong to their own forms (`form=`).
    const markDirty = (event) => {
      if (event.target.form && event.target.form !== schedaForm) return;
      dirty = true;
      if (hint) hint.hidden = false;
    };
    schedaForm.addEventListener('input', markDirty);
    schedaForm.addEventListener('change', markDirty);
    schedaForm.addEventListener('submit', (event) => {
      const bad = Array.from(schedaForm.querySelectorAll('input[type="number"]')).find(
        (el) => el.validity.badInput,
      );
      if (bad) {
        event.preventDefault();
        bad.reportValidity();
        bad.focus();
        return;
      }
      dirty = false;
    });
    window.addEventListener('beforeunload', (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  // After a failed save, start at the summary of what to fix (or of the values to confirm).
  const summary =
    document.getElementById('error-summary') || document.getElementById('confirm-summary');
  if (summary) summary.focus();

  // Invite / reset link: one click to copy.
  document.querySelectorAll('[data-copy]').forEach((button) => {
    const field = button.closest('.copy');
    const source = field ? field.querySelector('[data-copy-source]') : null;
    if (!source) return;
    source.addEventListener('focus', () => source.select());
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(source.value);
      } catch {
        source.focus();
        source.select();
        return;
      }
      const label = button.querySelector('[data-copy-label]');
      if (label && button.dataset.copied) label.textContent = button.dataset.copied;
    });
  });

  // Print view: the button prints; "?auto=1" (from the sheet's Print button) prints once on open.
  document.querySelectorAll('[data-print]').forEach((button) => {
    button.addEventListener('click', () => window.print());
  });
  if (document.body.hasAttribute('data-auto-print')) {
    const url = new URL(location.href);
    url.searchParams.delete('auto');
    history.replaceState(null, '', url.pathname + url.search);
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    // The section photos at the end must be on the paper too: wait for every image (loaded or failed).
    const imagesReady = Promise.all(
      Array.from(document.images, (img) =>
        img.complete
          ? null
          : new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            }),
      ),
    );
    Promise.all([fontsReady, imagesReady]).then(() => setTimeout(() => window.print(), 250));
  }

  // Section index of a long sheet: marks the first section on screen. The links work without this.
  const index = document.querySelector('[data-secindex]');
  if (index && 'IntersectionObserver' in window) {
    const links = new Map(
      Array.from(index.querySelectorAll('a[href^="#s-"]'), (a) => [a.hash.slice(1), a]),
    );
    const onScreen = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) =>
          entry.isIntersecting ? onScreen.add(entry.target.id) : onScreen.delete(entry.target.id),
        );
        const first = Array.from(links.keys()).find((id) => onScreen.has(id));
        links.forEach((link, id) =>
          id === first
            ? link.setAttribute('aria-current', 'true')
            : link.removeAttribute('aria-current'),
        );
      },
      { rootMargin: '-88px 0px -55% 0px' },
    );
    links.forEach((_, id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
  }
})();
