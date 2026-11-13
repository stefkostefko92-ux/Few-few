// The customer of a quote from the company's registry (views/preventivi/form.ejs, the block [data-clienti]).
// Progressive: without JavaScript the customer is typed by hand, or the quote is started from the customer's
// profile ("Nuovo preventivo"), which comes with the data already written.
// - The customers of the chosen company are read from /clienti/elenco.json; the block shows only when there
//   are some. An empty registry is said in one line.
// - A line of the list is the name, the address and the VAT number, so a customer is found by any of them;
//   the name alone or the VAT number alone is enough when only one customer has it.
// - Choosing a customer writes the name, address, VAT number and email of the profile into the form (also the
//   empty ones: what was typed for another customer does not stay) and remembers the profile in the hidden
//   field `clienteId`. The fields stay editable: what is corrected here is for this quote only.
// - The link is to one profile: when the name in the form is changed to something else, or the company is
//   changed, the hidden field is emptied (and the person is told) — a quote is never tied to a customer it
//   does not name.
(() => {
  const form = document.querySelector('[data-preventivo]');
  const blocco = form?.querySelector('[data-clienti]');
  const idScelto = form?.querySelector('[data-cliente-id]');
  if (!form || !blocco || !idScelto) return;
  const ricerca = blocco.querySelector('#f-registro-clienti');
  const elenco = blocco.querySelector('#clienti-voci');
  const stato = blocco.querySelector('[data-clienti-stato]');
  const vuoto = form.querySelector('[data-clienti-vuoto]');
  const testi = blocco.dataset;
  const CAMPI = {
    nome: '#f-cliente',
    indirizzo: '#f-clienteIndirizzo',
    piva: '#f-clientePiva',
    email: '#f-clienteEmail',
  };
  const campo = (k) => form.querySelector(CAMPI[k]);
  const uguale = (a, b) =>
    a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();
  const dire = (testo) => {
    if (stato) stato.textContent = testo;
  };

  let clienti = [];
  let turno = 0;

  // One line per customer; two customers with the same line are told apart by a number.
  const etichette = (righe) => {
    const viste = new Map();
    return righe.map((c) => {
      const base =
        [c.nome, c.indirizzo, c.piva].filter(Boolean).join(' — ') ||
        [c.nome, c.email].filter(Boolean).join(' — ');
      const n = (viste.get(base) ?? 0) + 1;
      viste.set(base, n);
      return { ...c, etichetta: n === 1 ? base : `${base} (${n})` };
    });
  };

  const carica = async (aziendaId) => {
    const mio = ++turno;
    clienti = [];
    elenco?.replaceChildren();
    blocco.hidden = true;
    if (vuoto) vuoto.hidden = true;
    dire('');
    if (!aziendaId) return;
    let caricato = false;
    try {
      const res = await fetch(`/clienti/elenco.json?azienda=${encodeURIComponent(aziendaId)}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (mio !== turno) return;
      const righe = Array.isArray(data.clienti) ? data.clienti : [];
      clienti = etichette(
        righe.filter((c) => c && typeof c.id === 'string' && typeof c.nome === 'string'),
      );
      caricato = true;
    } catch {
      if (mio !== turno) return;
      clienti = [];
    }
    for (const c of clienti) {
      const o = document.createElement('option');
      o.value = c.etichetta;
      elenco?.append(o);
    }
    blocco.hidden = clienti.length === 0;
    // An empty registry is said — never when the list could not be read.
    if (vuoto) vuoto.hidden = !(caricato && clienti.length === 0);
    if (clienti.length > 0) dire((testi.caricati ?? '').replace('{n}', String(clienti.length)));
  };

  const trova = (scritto) => {
    const s = scritto.trim();
    if (s === '') return null;
    const perEtichetta = clienti.find((c) => c.etichetta === s);
    if (perEtichetta) return perEtichetta;
    // The name alone, or the VAT number alone, is enough when only one customer has it.
    const numero = (v) =>
      v
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/^IT(?=\d{11}$)/, '');
    const soli = clienti.filter(
      (c) =>
        uguale(c.nome, s) ||
        (typeof c.piva === 'string' && c.piva !== '' && numero(c.piva) === numero(s)),
    );
    return soli.length === 1 ? soli[0] : null;
  };

  const usa = (c) => {
    for (const k of Object.keys(CAMPI)) {
      const el = campo(k);
      if (!el) continue;
      el.value = typeof c[k] === 'string' ? c[k] : '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    idScelto.value = c.id;
    if (ricerca) ricerca.value = '';
    dire((testi.scelto ?? '').replace('{nome}', () => c.nome));
  };

  const scegli = (silenzioso) => {
    const c = trova(ricerca?.value ?? '');
    if (c) {
      usa(c);
      form.querySelector('#f-oggetto')?.focus();
    } else if (!silenzioso) {
      dire(testi.nonTrovato ?? '');
      ricerca?.focus();
    }
  };

  blocco.querySelector('[data-clienti-usa]')?.addEventListener('click', () => scegli(false));
  // Picking a line of the list with the mouse fills the form at once; a half-typed name does nothing.
  ricerca?.addEventListener('change', () => scegli(true));
  ricerca?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    scegli(false);
  });

  // The name was changed by hand to another one: the quote is no longer for the profile it remembered.
  campo('nome')?.addEventListener('change', (event) => {
    if (!idScelto.value) return;
    const c = clienti.find((x) => x.id === idScelto.value);
    if (!c || uguale(c.nome, event.target.value)) return;
    idScelto.value = '';
    dire((testi.scollegato ?? '').replace('{nome}', () => c.nome));
  });

  const sceltaAzienda = form.querySelector('[data-scelta-azienda]');
  sceltaAzienda?.addEventListener('change', () => {
    // A customer of the company chosen before is not a customer of this one.
    idScelto.value = '';
    carica(sceltaAzienda.value);
  });
  carica(sceltaAzienda ? sceltaAzienda.value : form.dataset.azienda);
})();
