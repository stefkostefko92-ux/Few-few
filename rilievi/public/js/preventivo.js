// The quote form (views/preventivi/form.ejs). Progressive: without JavaScript the server gives the saved rows
// and a few empty ones, and computes every total on save.
// - "Aggiungi una riga" adds an empty row from the <template> (the next free index; the number shown is the
//   row's position), up to the maximum; "Togli la riga" empties and removes a row.
// - The price list of the chosen company (/preventivi/listino.json): "Aggiungi dal listino" adds a filled
//   row; a code typed in a row that matches a list entry fills the row's empty fields. Changing the company
//   reloads the list and replaces the conditions while they are still the previous company's default. An empty
//   list is said under the rows, with a link to where it is filled (the settings, for who manages them).
// - Indicative totals: the same integer arithmetic as src/preventivi/importi.ts (cents, thousandths, basis
//   points, half up; VAT per rate on the rate's total). The saved quote's totals come from the server.
(() => {
  const form = document.querySelector('[data-preventivo]');
  if (!form) return;
  const righe = form.querySelector('[data-righe]');
  const modello = form.querySelector('[data-modello-riga]');
  const aggiungi = form.querySelector('[data-aggiungi-riga]');
  if (!righe || !modello || !aggiungi) return;
  const max = Number(righe.dataset.max) || 100;
  const maxIndice = Number(righe.dataset.maxIndice) || 150;
  let prossimo = Number(righe.dataset.prossimo) || 0;
  const tutte = () => [...righe.querySelectorAll('[data-preventivo-riga]')];

  // --- numbers (mirror of importi.ts) ---
  const intero = (raw, decimali, tetto) => {
    let s = String(raw)
      .trim()
      .replace(/\s|€|%/g, '');
    if (s === '') return null;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
    s = s.replace(',', '.');
    const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
    if (!m || (m[2] || '').length > decimali) return null;
    const v =
      BigInt(m[1]) * 10n ** BigInt(decimali) + BigInt((m[2] || '').padEnd(decimali, '0') || '0');
    return v <= BigInt(tetto) ? v : null;
  };
  const mulDiv = (a, b, d) => {
    const num = a * b;
    const q = num / d;
    const r = num % d;
    return (r < 0n ? -r : r) * 2n >= d ? q + 1n : q;
  };
  const euro = (c) => {
    const neg = c < 0n;
    const abs = neg ? -c : c;
    const intera = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `€ ${neg ? '−' : ''}${intera},${(abs % 100n).toString().padStart(2, '0')}`;
  };
  const campo = (riga, k) => riga.querySelector(`[data-campo="${k}"]`);
  const valori = (riga) => {
    const q = intero(campo(riga, 'quantita')?.value ?? '', 3, 100000000);
    const p = intero(campo(riga, 'prezzo')?.value ?? '', 2, 1000000000);
    const scontoRaw = campo(riga, 'sconto')?.value ?? '';
    const s = scontoRaw.trim() === '' ? 0n : intero(scontoRaw, 2, 10000);
    const iva = Number(campo(riga, 'iva')?.value ?? '22');
    if (q === null || q === 0n || p === null || s === null) return null;
    const lordo = mulDiv(q, p, 1000n);
    return { imponibile: lordo - mulDiv(lordo, s, 10000n), iva };
  };
  const totali = () => {
    const perAliquota = new Map();
    for (const riga of tutte()) {
      const v = valori(riga);
      const out = riga.querySelector('[data-importo]');
      if (out) out.textContent = v ? euro(v.imponibile) : '—';
      if (v) perAliquota.set(v.iva, (perAliquota.get(v.iva) ?? 0n) + v.imponibile);
    }
    let imponibile = 0n;
    let imposta = 0n;
    for (const [iva, base] of perAliquota) {
      imponibile += base;
      imposta += mulDiv(base, BigInt(iva), 100n);
    }
    const set = (k, v) => {
      const out = form.querySelector(`[data-tot="${k}"]`);
      if (out) out.textContent = euro(v);
    };
    set('imponibile', imponibile);
    set('imposta', imposta);
    set('totale', imponibile + imposta);
  };

  // --- rows ---
  const numera = () => {
    tutte().forEach((riga, i) => {
      const titolo = riga.querySelector('.preventivo-riga__titolo');
      if (titolo) titolo.textContent = titolo.textContent.replace(/\d+$/, String(i + 1));
    });
    aggiungi.disabled = tutte().length >= max || prossimo >= maxIndice;
  };
  const nuovaRiga = () => {
    if (tutte().length >= max || prossimo >= maxIndice) return null;
    const html = modello.innerHTML
      .replaceAll('__i__', String(prossimo))
      .replaceAll('__n__', String(tutte().length + 1));
    prossimo += 1;
    const box = document.createElement('div');
    box.innerHTML = html.trim();
    const riga = box.firstElementChild;
    if (!riga) return null;
    righe.append(riga);
    riga.querySelector('[data-togli-riga]')?.removeAttribute('hidden');
    numera();
    return riga;
  };
  for (const hint of form.querySelectorAll('[data-senza-js]')) hint.hidden = true;
  for (const el of form.querySelectorAll('[data-totali]')) el.hidden = false;
  for (const b of form.querySelectorAll('[data-togli-riga]')) b.hidden = false;
  aggiungi.hidden = false;
  numera();

  aggiungi.addEventListener('click', () => {
    nuovaRiga()?.querySelector('textarea')?.focus();
  });
  righe.addEventListener('click', (event) => {
    const btn = event.target instanceof Element ? event.target.closest('[data-togli-riga]') : null;
    if (!btn) return;
    const riga = btn.closest('[data-preventivo-riga]');
    if (!riga) return;
    const dopo = riga.nextElementSibling ?? riga.previousElementSibling;
    riga.remove();
    numera();
    totali();
    (dopo?.querySelector('textarea, input') ?? aggiungi).focus();
  });
  righe.addEventListener('input', totali);
  righe.addEventListener('change', totali);
  totali();

  // --- price list ---
  const listino = form.querySelector('[data-listino]');
  const ricerca = form.querySelector('#f-listino');
  const dlVoci = form.querySelector('#listino-voci');
  const dlCodici = form.querySelector('#listino-codici');
  const stato = form.querySelector('[data-listino-stato]');
  const vuoto = form.querySelector('[data-listino-vuoto]');
  const gestione = form.querySelector('[data-listino-gestione]');
  const condizioni = form.querySelector('#f-condizioni');
  const testi = listino?.dataset ?? {};
  let voci = [];
  let condizioniAzienda = null;
  const etichetta = (v) => (v.codice ? `${v.codice} — ${v.descrizione}` : v.descrizione);
  const opzione = (value, label) => {
    const o = document.createElement('option');
    o.value = value;
    if (label) o.label = label;
    return o;
  };
  const riempi = (riga, v) => {
    for (const k of ['codice', 'descrizione', 'unita', 'prezzo', 'iva']) {
      const el = campo(riga, k);
      if (!el || !v[k]) continue;
      if (k === 'iva' || el.value.trim() === '' || el.dataset.auto === '1') {
        el.value = v[k];
        el.dataset.auto = '1';
      }
    }
    const q = campo(riga, 'quantita');
    if (q && q.value.trim() === '') q.value = '1';
  };
  // `sostituisci`: only when the person changes the company — on load the conditions written in the quote
  // stay as they are (edit, "Duplica", a form returned with errors); `turno` drops a slower older answer.
  let turno = 0;
  const carica = async (aziendaId, sostituisci) => {
    const mio = ++turno;
    voci = [];
    dlVoci?.replaceChildren();
    dlCodici?.replaceChildren();
    if (vuoto) vuoto.hidden = true;
    if (!listino || !aziendaId) {
      if (listino) listino.hidden = true;
      return;
    }
    let caricato = false;
    try {
      const res = await fetch(`/preventivi/listino.json?azienda=${encodeURIComponent(aziendaId)}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (mio !== turno) return;
      voci = Array.isArray(data.voci) ? data.voci : [];
      caricato = true;
      // Where the list of this company is managed — only one of our own two pages is taken as a link.
      if (
        gestione &&
        /^\/(impostazioni|preventivi)\/listino\?azienda=[\w-]+$/.test(data.gestione ?? '')
      )
        gestione.setAttribute('href', data.gestione);
      const nuove = typeof data.condizioni === 'string' ? data.condizioni : '';
      if (
        sostituisci &&
        condizioni &&
        (condizioni.value.trim() === '' || condizioni.value === condizioniAzienda)
      ) {
        condizioni.value = nuove;
      }
      condizioniAzienda = nuove;
    } catch {
      if (mio !== turno) return;
      voci = [];
    }
    for (const v of voci) {
      dlVoci?.append(opzione(etichetta(v)));
      if (v.codice) dlCodici?.append(opzione(v.codice, v.descrizione));
    }
    listino.hidden = voci.length === 0;
    // An empty list is said, with the way to fill it — never when the list could not be read.
    if (vuoto) vuoto.hidden = !(caricato && voci.length === 0);
    if (stato)
      stato.textContent = voci.length
        ? (testi.caricato ?? '').replace('{n}', String(voci.length))
        : '';
  };

  form.querySelector('[data-listino-aggiungi]')?.addEventListener('click', () => {
    const scelta = ricerca?.value.trim() ?? '';
    const v = voci.find((x) => etichetta(x) === scelta || (x.codice && x.codice === scelta));
    if (!v) {
      if (stato) stato.textContent = testi.nonTrovata ?? '';
      ricerca?.focus();
      return;
    }
    const vuota = tutte().find((r) =>
      ['codice', 'descrizione', 'quantita', 'prezzo', 'sconto'].every(
        (k) => (campo(r, k)?.value ?? '').trim() === '',
      ),
    );
    const riga = vuota ?? nuovaRiga();
    if (!riga) return;
    riempi(riga, v);
    totali();
    if (stato) stato.textContent = (testi.aggiunta ?? '').replace('{descrizione}', v.descrizione);
    if (ricerca) ricerca.value = '';
    campo(riga, 'quantita')?.focus();
  });
  ricerca?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    form.querySelector('[data-listino-aggiungi]')?.click();
  });
  righe.addEventListener('change', (event) => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement) || el.dataset.campo !== 'codice') return;
    const v = voci.find((x) => x.codice && x.codice === el.value.trim());
    const riga = el.closest('[data-preventivo-riga]');
    if (v && riga) {
      riempi(riga, v);
      totali();
    }
  });
  righe.addEventListener('input', (event) => {
    const el = event.target;
    if (el instanceof HTMLElement && el.dataset.campo !== 'codice') delete el.dataset.auto;
  });

  const sceltaAzienda = form.querySelector('[data-scelta-azienda]');
  sceltaAzienda?.addEventListener('change', () => carica(sceltaAzienda.value, true));
  carica(sceltaAzienda ? sceltaAzienda.value : form.dataset.azienda, false);
})();
