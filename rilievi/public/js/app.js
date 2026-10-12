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

  // Serrature: number and type of locks only make sense with "Sì".
  const dependents = document.querySelectorAll('[data-when-serrature]');
  const syncSerrature = () => {
    const checked = document.querySelector('input[name="serrature"]:checked');
    const on = checked !== null && checked.value === 'si';
    dependents.forEach((el) => el.toggleAttribute('data-off', !on));
  };
  document.querySelectorAll('input[name="serrature"]').forEach((radio) => {
    radio.addEventListener('change', syncSerrature);
  });

  // Yes/No can go back to "not marked": clicking the ticked box again clears it.
  document.querySelectorAll('input[data-yesno]').forEach((radio) => {
    const label = radio.closest('label');
    if (!label) return;
    label.addEventListener('pointerdown', () => {
      radio.dataset.was = String(radio.checked);
    });
    radio.addEventListener('click', () => {
      if (radio.dataset.was === 'true') {
        radio.checked = false;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
      radio.dataset.was = 'false';
    });
  });

  // The long sheet form: warn before leaving with unsaved changes; never send a half-typed number.
  const schedaForm = document.querySelector('[data-scheda-form]');
  if (schedaForm) {
    let dirty = false;
    const hint = schedaForm.querySelector('[data-dirty-hint]');
    const markDirty = () => {
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

  // After a failed save, start at the summary of what to fix.
  const summary = document.getElementById('error-summary');
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
    fontsReady.then(() => setTimeout(() => window.print(), 250));
  }
})();
