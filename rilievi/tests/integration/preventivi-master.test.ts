// The MASTER chooses the company of a new quote or customer (the owner, 16 November 2026: "В превентиви не мога да
// избера фирма за която да го направя от мастър акаунта"). Before: the MASTER saw only the companies with quotes
// on — with none on, the form had no company field at all and could not be saved; a scheda of a company with
// quotes off sent back to an empty form without a word. Now every active company is in the list: those with
// quotes off under their own group, and choosing one says so and offers to turn the quotes on from the form
// (the same switch as the company page, with its audit), then comes back to the form with the company chosen.
// Nothing is saved for a company with quotes off. The other roles see what they saw.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';
import { accendi, RIGHE, SCHEDA } from './preventivi-dati.js';

before(startApp);
after(stopApp);

const opzione = (id: string) => new RegExp(`<option value="${id}"[^>]*>`);
const tra = (html: string, inizio: string, fine: string) => {
  const da = html.indexOf(inizio);
  if (da < 0) return '';
  const a = html.indexOf(fine, da);
  return html.slice(da, a < 0 ? undefined : a);
};
const spente = (html: string) => tra(html, '<optgroup', '</optgroup>');

describe('the MASTER and the company of a new quote', () => {
  it('lists every active company, also when none has quotes on, and saves nothing for an off one', async () => {
    const spenta = await makeAzienda('Ascensori Spenti Srl');
    const chiusa = await makeAzienda('Ascensori Chiusi Srl');
    await prisma.azienda.update({ where: { id: chiusa.id }, data: { deactivatedAt: new Date() } });
    const { browser: master } = await signedIn('MASTER');

    // No company has quotes on: the field is there, the off company is in its own group.
    const vuota = await master.get('/preventivi/nuovo');
    assert.equal(vuota.status, 200);
    assert.match(vuota.body, /<select[^>]*id="f-azienda"/);
    assert.match(spente(vuota.body), opzione(spenta.id));
    assert.match(spente(vuota.body), /data-spenta/);
    assert.doesNotMatch(vuota.body, opzione(chiusa.id));

    // Saving for it: 422, the reason on the field and the switch next to it; nothing saved.
    const csrf = await master.csrf('/preventivi/nuovo');
    const rifiuto = await master.post('/preventivi', { _csrf: csrf, ...RIGHE, azienda: spenta.id });
    assert.equal(rifiuto.status, 422);
    assert.match(rifiuto.body, /id="err-azienda"/);
    assert.match(rifiuto.body, /I preventivi non sono attivi per questa azienda/);
    assert.match(rifiuto.body, new RegExp(`action="/aziende/${spenta.id}/preventivi"`));
    assert.equal(await prisma.preventivo.count({ where: { aziendaId: spenta.id } }), 0);

    // The form keeps the typed data and the chosen company.
    assert.match(rifiuto.body, /value="Condominio Manzoni 4"/);
    assert.match(rifiuto.body, new RegExp(`<option value="${spenta.id}"[^>]*selected`));

    // The price list: before, 404 with no company on ("Pagina non trovata"); now the choice and the note.
    const listino = await master.get('/preventivi/listino');
    assert.equal(listino.status, 200);
    assert.match(spente(listino.body), opzione(spenta.id));
    assert.doesNotMatch(listino.body, /method="post" action="\/preventivi\/listino"/);
  });

  it('the price list of a company with quotes off: the note and the switch, back to its list', async () => {
    const accesa = await makeAzienda('Ascensori Listino Acceso Srl');
    const spenta = await makeAzienda('Ascensori Listino Spento Srl');
    const { browser: master } = await signedIn('MASTER');
    await accendi(master, accesa.id, true);
    // Asked for the off one: not another company's list in its place.
    const pagina = await master.get(`/preventivi/listino?azienda=${spenta.id}`);
    assert.equal(pagina.status, 200);
    assert.match(pagina.body, new RegExp(`<option value="${spenta.id}"[^>]*selected`));
    assert.doesNotMatch(tra(pagina.body, 'data-offerte-spente', '>'), /\bhidden\b/);
    assert.match(pagina.body, /name="dopo" value="listino"/);
    assert.doesNotMatch(pagina.body, /method="post" action="\/preventivi\/listino"/);
    assert.doesNotMatch(pagina.body, /Ascensori Listino Acceso Srl ·/);

    const csrf = await master.csrf('/preventivi/listino');
    const reply = await master.post(`/aziende/${spenta.id}/preventivi`, {
      _csrf: csrf,
      attivi: '1',
      dopo: 'listino',
    });
    assert.equal(reply.location, `/preventivi/listino?azienda=${spenta.id}`);
    const dopo = await master.get(reply.location);
    assert.equal(dopo.status, 200);
    assert.match(dopo.body, /Ascensori Listino Spento Srl ·/);
    assert.match(dopo.body, /method="post" action="\/preventivi\/listino"/);
  });

  it('turns the quotes on from the form and comes back to it with the company chosen', async () => {
    const azienda = await makeAzienda('Ascensori Da Accendere Srl');
    // Another company stays off: the note is in the page, hidden, after the switch.
    await makeAzienda('Ascensori Ancora Spenti Srl');
    const { browser: master } = await signedIn('MASTER');

    // Opened with the off company already chosen (?azienda=): the note and the switch are shown.
    const scelta = await master.get(`/preventivi/nuovo?azienda=${azienda.id}`);
    assert.match(scelta.body, new RegExp(`<option value="${azienda.id}"[^>]*selected`));
    assert.match(tra(scelta.body, 'data-offerte-spente', '</div>'), /I preventivi non sono attivi/);
    assert.doesNotMatch(tra(scelta.body, 'data-offerte-spente', '>'), /\bhidden\b/);

    const csrf = await master.csrf('/preventivi/nuovo');
    const accesa = await master.post(`/aziende/${azienda.id}/preventivi`, {
      _csrf: csrf,
      attivi: '1',
      dopo: 'preventivo',
    });
    assert.equal(accesa.status, 303);
    assert.equal(accesa.location, `/preventivi/nuovo?azienda=${azienda.id}`);
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })).preventiviAttivi,
      true,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { action: 'AZIENDA_PREVENTIVI', aziendaId: azienda.id },
      }),
      1,
    );

    // Back on the form: chosen, among the companies with quotes on, no note.
    const dopo = await master.get(accesa.location);
    assert.match(dopo.body, new RegExp(`<option value="${azienda.id}"[^>]*selected`));
    assert.doesNotMatch(spente(dopo.body), opzione(azienda.id));
    assert.match(tra(dopo.body, 'data-offerte-spente', '>'), /\bhidden\b/);
    const salvato = await master.submit('/preventivi/nuovo', '/preventivi', {
      ...RIGHE,
      azienda: azienda.id,
    });
    assert.equal(salvato.status, 303);
    assert.equal(await prisma.preventivo.count({ where: { aziendaId: azienda.id } }), 1);
  });

  it('goes back only where it was asked: the quote, the customer, otherwise the company page', async () => {
    const { browser: master } = await signedIn('MASTER');
    const casi: Array<[string | undefined, (id: string) => string]> = [
      ['cliente', (id) => `/clienti/nuovo?azienda=${id}`],
      [undefined, (id) => `/aziende/${id}#h-preventivi`],
      ['//example.com/', (id) => `/aziende/${id}#h-preventivi`],
      ['/master', (id) => `/aziende/${id}#h-preventivi`],
    ];
    for (const [dopo, attesa] of casi) {
      const azienda = await makeAzienda();
      const csrf = await master.csrf(`/aziende/${azienda.id}`);
      const reply = await master.post(`/aziende/${azienda.id}/preventivi`, {
        _csrf: csrf,
        attivi: '1',
        ...(dopo === undefined ? {} : { dopo }),
      });
      assert.equal(reply.status, 303);
      assert.equal(reply.location, attesa(azienda.id), `dopo=${String(dopo)}`);
    }
  });

  it('from a scheda of a company with quotes off, opens the form with that company chosen', async () => {
    const azienda = await makeAzienda('Ascensori Scheda Spenta Srl');
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const { browser: master } = await signedIn('MASTER');
    const scheda = await admin.submit('/schede/nuova', '/schede', SCHEDA);
    const schedaId = scheda.location.split('/').pop()!;
    const reply = await master.get(`/preventivi/nuovo?scheda=${schedaId}`);
    assert.equal(reply.status, 303);
    assert.equal(reply.location, `/preventivi/nuovo?azienda=${azienda.id}`);
  });

  it('the new customer: the same list and the same switch; nothing saved for an off company', async () => {
    const azienda = await makeAzienda('Ascensori Clienti Spenti Srl');
    const { browser: master } = await signedIn('MASTER');
    const form = await master.get('/clienti/nuovo');
    assert.equal(form.status, 200);
    assert.match(spente(form.body), opzione(azienda.id));

    const csrf = await master.csrf('/clienti/nuovo');
    const rifiuto = await master.post('/clienti', {
      _csrf: csrf,
      azienda: azienda.id,
      nome: 'Condominio Verdi',
    });
    assert.equal(rifiuto.status, 422);
    assert.match(rifiuto.body, /I preventivi non sono attivi per questa azienda/);
    assert.match(rifiuto.body, /name="dopo" value="cliente"/);
    assert.equal(await prisma.cliente.count({ where: { aziendaId: azienda.id } }), 0);
    // The customers of an off company are not read by the quote form.
    assert.equal((await master.get(`/clienti/elenco.json?azienda=${azienda.id}`)).status, 404);
  });

  it('the other roles see what they saw: their companies only, no off group, no switch', async () => {
    const accesa = await makeAzienda('Ascensori Accesi Srl');
    const altra = await makeAzienda('Ascensori Altri Srl');
    const { browser: master } = await signedIn('MASTER');
    await accendi(master, accesa.id, true);
    const { browser: admin } = await signedIn('ADMIN', accesa.id);
    const form = await admin.get('/preventivi/nuovo');
    assert.equal(form.status, 200);
    assert.doesNotMatch(form.body, /<optgroup/);
    assert.doesNotMatch(form.body, opzione(altra.id));
    assert.doesNotMatch(form.body, /\/preventivi"[^>]*id="f-attiva-offerte"|id="f-attiva-offerte"/);
    // The ADMIN cannot use the switch, with or without "dopo".
    const csrf = await admin.csrf('/preventivi/nuovo');
    assert.equal(
      (
        await admin.post(`/aziende/${altra.id}/preventivi`, {
          _csrf: csrf,
          attivi: '1',
          dopo: 'preventivo',
        })
      ).status,
      403,
    );
  });
});
