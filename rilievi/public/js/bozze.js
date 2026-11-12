// The forms sent while the network was down and kept on this device by the service worker (public/js/sw.js,
// the owner, 12 November 2026 — point C3). On every page of the portal:
// - the page of a field form tells the worker which account has it open (the worker keeps a form only for
//   its account, never for whoever uses the device next);
// - this account's unsent forms are listed above the page with "Invia ora" and "Elimina".
// "Invia ora" sends the form exactly as it was, with this page's security token: saved → its page; signed
// out → the copy stays and the sign-in is offered; returned with errors or a conflict (nothing saved) → the
// form as the server shows it, sent the usual way; still no network → the copy stays.
(() => {
  const body = document.body;
  const utente = body.dataset.bozzeUtente;
  const csrf = body.dataset.bozzeCsrf;
  const nodoTesti = document.getElementById('bozze-testi');
  if (!utente || !csrf || !nodoTesti || !('serviceWorker' in navigator) || !window.isSecureContext)
    return;
  const MODULI = /^\/(schede|interventi|buoni|verbali|cartelli|preventivi)(\/[a-z0-9]{20,40})?$/;
  let testi = {};
  try {
    testi = JSON.parse(nodoTesti.textContent || '{}');
  } catch {
    return;
  }

  const chiedi = async (messaggio) => {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) return null;
    return new Promise((resolve) => {
      const canale = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 4000);
      canale.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolve(event.data && event.data.ok ? event.data : null);
      };
      reg.active.postMessage({ ...messaggio, utente }, [canale.port2]);
    });
  };
  const azioneDi = (form) => {
    const raw = form.getAttribute('action');
    if (!raw) return null;
    const url = new URL(raw, location.href);
    return url.origin === location.origin && !url.search && MODULI.test(url.pathname)
      ? url.pathname
      : null;
  };

  for (const form of document.querySelectorAll('form[method="post" i]')) {
    const azione = azioneDi(form);
    if (azione) chiedi({ tipo: 'autore', azione });
  }

  const quando = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  const etichetta = (azione) => {
    const m = MODULI.exec(azione);
    if (!m) return azione;
    const tipo = (testi.tipo && testi.tipo[m[1]]) || m[1];
    return `${tipo} — ${m[2] ? testi.modifica : testi.nuovo}`;
  };
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  let box = null;
  let stato = null;
  const dice = (testo) => {
    if (stato) stato.textContent = testo;
  };

  async function invia(b, bottone) {
    bottone.disabled = true;
    dice(testi.invio || '');
    const corpo = new URLSearchParams(b.corpo);
    corpo.set('_csrf', csrf);
    let res;
    try {
      res = await fetch(b.azione, {
        method: 'POST',
        body: corpo,
        credentials: 'same-origin',
        redirect: 'follow',
        headers: { Accept: 'text/html' },
      });
    } catch {
      bottone.disabled = false;
      dice(testi.ancoraOffline || '');
      return;
    }
    const arrivo = new URL(res.url, location.href);
    if (arrivo.pathname === '/accesso' || res.status === 401 || res.status === 403) {
      bottone.disabled = false;
      dice(testi.accedi || '');
      return;
    }
    if (res.status >= 500) {
      bottone.disabled = false;
      dice(testi.errore || '');
      return;
    }
    await chiedi({ tipo: 'togli', azione: b.azione });
    if (res.redirected && res.ok) {
      location.assign(arrivo.href);
      return;
    }
    // Returned (errors, conflict): nothing saved — the usual sending shows the form with the data.
    await chiedi({ tipo: 'autore', azione: b.azione });
    const form = el('form');
    form.method = 'post';
    form.action = b.azione;
    form.hidden = true;
    for (const [nome, valore] of corpo) {
      const input = el('input');
      input.type = 'hidden';
      input.name = nome;
      input.value = valore;
      form.append(input);
    }
    body.append(form);
    form.submit();
  }

  async function elimina(b, riga) {
    await chiedi({ tipo: 'togli', azione: b.azione });
    riga.remove();
    dice(testi.eliminata || '');
    if (box && !box.querySelector('li')) box.remove();
  }

  async function mostra() {
    const risposta = await chiedi({ tipo: 'elenco' });
    const bozze = (risposta && risposta.valore) || [];
    if (box) box.remove();
    box = null;
    if (!bozze.length) return;
    box = el('section', 'bozze');
    box.setAttribute('aria-labelledby', 'bozze-titolo');
    const titolo = el('h2', 'bozze__titolo', testi.titolo);
    titolo.id = 'bozze-titolo';
    const lista = el('ul', 'bozze__lista');
    lista.setAttribute('role', 'list');
    for (const b of bozze) {
      const riga = el('li', 'bozze__riga');
      const testo = el('p', 'bozze__testo');
      testo.append(el('strong', '', etichetta(b.azione)));
      testo.append(
        el(
          'span',
          'muted',
          ` · ${(testi.salvata || '').replace('{quando}', quando.format(new Date(b.at)))}`,
        ),
      );
      const azioni = el('div', 'bozze__azioni');
      const manda = el('button', 'btn btn--primary', testi.invia);
      manda.type = 'button';
      manda.addEventListener('click', () => invia(b, manda));
      const togli = el('button', 'btn', testi.elimina);
      togli.type = 'button';
      togli.addEventListener('click', () => {
        if (window.confirm(testi.conferma || '')) elimina(b, riga);
      });
      azioni.append(manda, togli);
      riga.append(testo, azioni);
      lista.append(riga);
    }
    stato = el('p', 'bozze__stato');
    stato.setAttribute('role', 'status');
    box.append(titolo, el('p', '', testi.testo), lista, stato);
    const main = document.getElementById('main');
    if (main) main.prepend(box);
    if (!navigator.onLine) dice(testi.ancoraOffline || '');
  }

  mostra();
  window.addEventListener('online', () => {
    if (box) dice(testi.tornata || '');
    else mostra();
  });
})();
