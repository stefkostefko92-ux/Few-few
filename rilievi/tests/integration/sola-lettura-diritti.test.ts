// What an expired company can still take away (the audit of 12 November 2026 — terms 2026-11-12, art. 12.5 c) and
// A.9: in read-only "consultare, esportare e cancellare i dati"; art. 4.1: revoking access that is no longer
// authorised). Deleting single data (a photo, a notice, a work order without signatures, a draft quote) and
// revoking access (an API key, the sign-in with Microsoft or Google) stay with the role that had them — nothing
// new is written, and nothing comes back from the trash. And the limit of people of the level holds also when
// someone is switched on again.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeAzienda, makeUser, prisma, signedIn, startApp, stopApp } from './harness.js';
import { newScheda, photo, upload } from './media.js';

const { nuovaChiave, aziendaDellaChiave } = await import('../../src/api/chiavi.js');

before(startApp);
after(stopApp);

const HTML = { accept: 'text/html' };

describe('an expired company', () => {
  it('still deletes single data and revokes access, and writes nothing', async () => {
    const azienda = await makeAzienda('Scaduta Diritti Srl');
    await prisma.azienda.update({ where: { id: azienda.id }, data: { preventiviAttivi: true } });
    const { browser, user } = await signedIn('ADMIN', azienda.id);
    // While the subscription runs: a scheda with a photo, a notice, a work order, a draft quote, an API key.
    const schedaId = await newScheda(browser);
    assert.equal((await upload(browser, schedaId, 'quadro', await photo())).status, 200);
    const foto = await prisma.allegato.findFirstOrThrow({ where: { schedaId } });
    const cartello = await prisma.cartello.create({
      data: { aziendaId: azienda.id, data: new Date('2026-11-04'), testo: 'Impianto fermo' },
    });
    const buono = await browser.submit('/buoni/nuovo', '/buoni', {
      azienda: azienda.id,
      'seq-0-descrizione': 'Sostituzione quadro',
    });
    assert.equal(buono.status, 303);
    const buonoId = buono.location.split('/').pop()!;
    const preventivo = await prisma.preventivo.create({
      data: {
        aziendaId: azienda.id,
        numero: 1,
        data: new Date('2026-11-04'),
        cliente: 'Condominio Verdi',
        oggetto: 'Sostituzione quadro',
      },
    });
    const k = nuovaChiave();
    const chiave = await prisma.chiaveApi.create({
      data: {
        aziendaId: azienda.id,
        nome: 'Gestionale',
        prefisso: k.prefisso,
        hash: k.hash,
        scadeAt: new Date(Date.now() + 300 * 24 * 3600 * 1000),
      },
    });
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: {
        accessoGoogle: 'ascensori-diritti.it',
        accessoMicrosoft: '8a0f8a8e-3f6c-4a53-9a4e-1c2d3e4f5a6b',
      },
    });
    const inCestino = await newScheda(browser);
    await browser.submit(`/schede/${inCestino}/elimina`, `/schede/${inCestino}/elimina`, {});

    // The subscription ends.
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: { abbonamentoFino: new Date(Date.now() - 1000), abbonamentoLivello: 1 },
    });
    const dopo = await signedIn('ADMIN', azienda.id);
    const b = dopo.browser;

    // Nothing new is written.
    const scrive = await b.submit('/account', `/cartelli/${cartello.id}`, {
      testo: 'Altro testo',
    });
    assert.equal(scrive.status, 403);
    assert.match(scrive.body, /Abbonamento scaduto/);
    const carica = await b.upload(
      '/account',
      `/schede/${schedaId}/allegati`,
      { sezione: 'quadro', ritorno: 'scheda' },
      await photo(),
      { accept: 'text/html' },
    );
    assert.equal(carica.status, 403);
    // Nothing comes back from the trash.
    const ripristina = await b.submit('/account', `/cestino/${inCestino}/ripristina`, {});
    assert.equal(ripristina.status, 403);
    assert.match(ripristina.body, /Abbonamento scaduto/);
    assert.ok((await prisma.scheda.findUniqueOrThrow({ where: { id: inCestino } })).deletedAt);

    // The photo: the scheda page offers to delete it; the confirmation page and the deletion work.
    const pagina = await b.get(`/schede/${schedaId}`, HTML);
    assert.ok(pagina.body.includes(`/schede/${schedaId}/allegati/${foto.id}/elimina`));
    assert.doesNotMatch(pagina.body, /name="didascalia-/);
    assert.equal(
      (await b.get(`/schede/${schedaId}/allegati/${foto.id}/elimina`, HTML)).status,
      200,
    );
    const viaFoto = await b.submit(
      '/account',
      `/schede/${schedaId}/allegati/${foto.id}/elimina`,
      {},
    );
    assert.equal(viaFoto.status, 303);
    assert.equal(await prisma.allegato.count({ where: { id: foto.id } }), 0);
    // The caption is still a write.
    assert.equal(
      (
        await b.submit('/account', `/schede/${schedaId}/allegati/${foto.id}/didascalia`, {
          [`didascalia-${foto.id}`]: 'x',
        })
      ).status,
      403,
    );

    // The notice, the work order without signatures, the draft quote.
    assert.match((await b.get(`/cartelli/${cartello.id}`, HTML)).body, /\/elimina"/);
    assert.equal((await b.submit('/account', `/cartelli/${cartello.id}/elimina`, {})).status, 303);
    assert.equal(await prisma.cartello.count({ where: { id: cartello.id } }), 0);
    assert.match((await b.get(`/buoni/${buonoId}`, HTML)).body, /\/elimina"/);
    assert.equal((await b.submit('/account', `/buoni/${buonoId}/elimina`, {})).status, 303);
    assert.equal(await prisma.buonoLavoro.count({ where: { id: buonoId } }), 0);
    assert.match((await b.get(`/preventivi/${preventivo.id}`, HTML)).body, /\/elimina"/);
    assert.equal(
      (await b.submit('/account', `/preventivi/${preventivo.id}/elimina`, {})).status,
      303,
    );
    assert.equal(await prisma.preventivo.count({ where: { id: preventivo.id } }), 0);

    // The API key still reads until it is revoked — from the subscription page, the only settings left.
    assert.ok(await aziendaDellaChiave(`Bearer ${k.chiave}`));
    const abbonamento = await b.get(`/impostazioni/abbonamento?azienda=${azienda.id}`, HTML);
    assert.match(abbonamento.body, /Accessi ancora attivi/);
    assert.match(abbonamento.body, /Gestionale/);
    const revoca = await b.submit('/account', `/impostazioni/api/${chiave.id}/revoca`, {
      azienda: azienda.id,
    });
    assert.equal(revoca.status, 303);
    assert.match(revoca.location, /^\/impostazioni\/abbonamento\?/);
    assert.equal(await aziendaDellaChiave(`Bearer ${k.chiave}`), null);
    // A new key is a write.
    assert.equal(
      (
        await b.submit('/account', '/impostazioni/api', {
          azienda: azienda.id,
          nome: 'Nuova',
        })
      ).status,
      403,
    );
    // The sign-in with Microsoft and Google: switched off for the company.
    const spegni = await b.submit('/account', '/impostazioni/accesso/disattiva', {
      azienda: azienda.id,
    });
    assert.equal(spegni.status, 303);
    const senza = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.equal(senza.accessoGoogle, null);
    assert.equal(senza.accessoMicrosoft, null);
    assert.equal(
      await prisma.auditLog.count({
        where: { action: 'AZIENDA_ACCESSO_ESTERNO', aziendaId: azienda.id },
      }),
      1,
    );
    const pulita = await b.get(`/impostazioni/abbonamento?azienda=${azienda.id}`, HTML);
    assert.doesNotMatch(pulita.body, /Accessi ancora attivi/);

    // Not someone of another company, and not a role that never had the right.
    const altra = await makeAzienda('Altra Diritti Srl');
    const estraneo = await signedIn('ADMIN', altra.id);
    const k2 = nuovaChiave();
    const chiave2 = await prisma.chiaveApi.create({
      data: {
        aziendaId: azienda.id,
        nome: 'Seconda',
        prefisso: k2.prefisso,
        hash: k2.hash,
        scadeAt: new Date(Date.now() + 300 * 24 * 3600 * 1000),
      },
    });
    assert.equal(
      (
        await estraneo.browser.submit('/account', `/impostazioni/api/${chiave2.id}/revoca`, {
          azienda: azienda.id,
        })
      ).status,
      404,
    );
    const cliente = await signedIn('CLIENTE', azienda.id);
    const cartello2 = await prisma.cartello.create({
      data: { aziendaId: azienda.id, data: new Date('2026-11-05'), testo: 'Fermo' },
    });
    assert.equal(
      (await cliente.browser.submit('/account', `/cartelli/${cartello2.id}/elimina`, {})).status,
      403,
    );
    assert.equal(
      (
        await cliente.browser.submit('/account', `/impostazioni/api/${chiave2.id}/revoca`, {
          azienda: azienda.id,
        })
      ).status,
      404,
    );
    assert.equal(await prisma.cartello.count({ where: { id: cartello2.id } }), 1);
    assert.ok(user.id);
  });
});

describe('the people of the level', () => {
  it('are counted also when someone is switched on again', async () => {
    const azienda = await makeAzienda('Piena Srl');
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: {
        abbonamentoFino: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        abbonamentoLivello: 1,
      },
    });
    const { browser } = await signedIn('ADMIN', azienda.id);
    // Ten people at level 1: the ADMIN and nine more; one of them is switched off, a tenth comes in.
    const persone = [];
    for (let i = 0; i < 9; i += 1) persone.push(await makeUser('TECNICO', undefined, azienda.id));
    const mario = persone[0]!;
    const spento = await browser.submit('/account', `/utenti/${mario.id}/stato`, {
      active: '0',
    });
    assert.equal(spento.status, 302);
    await makeUser('OPERATORE', undefined, azienda.id);
    // Full again: Mario does not come back as the eleventh.
    const riaccendi = await browser.submit('/account', `/utenti/${mario.id}/stato`, {
      active: '1',
    });
    assert.equal(riaccendi.status, 302);
    const pagina = await browser.get(riaccendi.location, HTML);
    assert.match(pagina.body, /numero massimo di persone/);
    assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: mario.id } })).deactivatedAt);
    // A place is freed: now he does.
    const altro = persone[1]!;
    await browser.submit('/account', `/utenti/${altro.id}/stato`, { active: '0' });
    await browser.submit('/account', `/utenti/${mario.id}/stato`, { active: '1' });
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: mario.id } })).deactivatedAt,
      null,
    );
    // MASTER decides without the limit (as for invites).
    const master = await signedIn('MASTER');
    await master.browser.submit('/account', `/utenti/${altro.id}/stato`, {
      active: '1',
    });
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: altro.id } })).deactivatedAt,
      null,
    );
    // An expired company switches nobody on again.
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: { abbonamentoFino: new Date(Date.now() - 1000) },
    });
    const scaduto = await signedIn('ADMIN', azienda.id);
    const terzo = persone[2]!;
    await scaduto.browser.submit('/account', `/utenti/${terzo.id}/stato`, {
      active: '0',
    });
    assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: terzo.id } })).deactivatedAt);
    const no = await scaduto.browser.submit('/account', `/utenti/${terzo.id}/stato`, {
      active: '1',
    });
    const paginaNo = await scaduto.browser.get(no.location, HTML);
    assert.match(paginaNo.body, /abbonamento dell&#39;azienda è scaduto/);
    assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: terzo.id } })).deactivatedAt);
  });
});
