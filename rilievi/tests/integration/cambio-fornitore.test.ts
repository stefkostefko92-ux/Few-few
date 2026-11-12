// Switching provider and the company's own export (Data Act, arts. 23–30; owner, 12 November 2026 — points
// A1 and A4). Acceptance criteria:
// - the company's ADMIN downloads everything in one .tar from the settings, with his password; a wrong or
//   missing password gives nothing, other roles and other companies get 404; each export is in the log;
// - the ADMIN (or the MASTER) asks for the switch with the outcome and the company's name typed: the
//   service goes on in full for 30 days, every page shows until when, the admins and the MASTER get an email;
// - the transition is extended once (30/60/90 days), the outcome can change, the request can be withdrawn;
// - at its end the maintenance deactivates the company: its people are out, its ADMIN signs in for 90 days
//   only to download the export, then not at all; reactivation by the MASTER clears the request;
// - deleting a company confirms it by email to its admins (Allegato B, B.13).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { fineTransizione } from '../../src/aziende/cambio-tempi.js';
import { concludiCambi } from '../../src/aziende/cambio.js';
import { eliminaAzienda } from '../../src/aziende/eliminazione.js';
import { DAY } from '../../src/time.js';
import {
  Browser,
  makeAzienda,
  makeUser,
  outbox,
  PASSWORD,
  prisma,
  signedIn,
  startApp,
  stopApp,
} from './harness.js';
import { create, firma, FORM } from './interventi-helpers.js';
import { readTar } from './tar.js';

before(startApp);
after(stopApp);

const PAGE = '/impostazioni/esportazione';

async function aziendaConAdmin(name: string) {
  const azienda = await makeAzienda(name);
  const { user, browser } = await signedIn('ADMIN', azienda.id);
  return { azienda, admin: user, browser };
}

const pagina = (aziendaId: string) => `${PAGE}?azienda=${aziendaId}`;

describe('the export of a company by its own ADMIN', () => {
  it('needs his password, gives one .tar with everything and logs it', async () => {
    const { azienda, browser } = await aziendaConAdmin('Esporta Sola');
    const master = await makeUser('MASTER');
    await prisma.auditLog.create({
      data: { actorId: master.id, action: 'AZIENDA_UPDATE', aziendaId: azienda.id },
    });
    await prisma.invite.create({
      data: {
        email: 'nuovo@esempio.it',
        role: 'TECNICO',
        aziendaId: azienda.id,
        tokenHash: `hash-${azienda.id}`,
        invitedById: master.id,
        expiresAt: new Date(Date.now() + 7 * DAY),
      },
    });
    // A confirmed intervention sheet: its PDF/A goes into documenti/.
    const interventoId = await create(browser, FORM);
    assert.equal((await firma(browser, interventoId)).status, 303);
    const page = await browser.get(pagina(azienda.id));
    assert.equal(page.status, 200);
    assert.match(page.body, /Scarica i dati \(\.tar\)/);
    assert.match(page.body, /Nessuna esportazione finora/);

    const wrong = await browser.submit(pagina(azienda.id), `${PAGE}/scarica`, {
      azienda: azienda.id,
      password: 'non-questa',
    });
    assert.equal(wrong.status, 422);
    assert.match(wrong.body, /Password non corretta/);
    const empty = await browser.submit(pagina(azienda.id), `${PAGE}/scarica`, {
      azienda: azienda.id,
    });
    assert.equal(empty.status, 422);

    const ok = await browser.submit(pagina(azienda.id), `${PAGE}/scarica`, {
      azienda: azienda.id,
      password: PASSWORD,
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'application/x-tar');
    const entries = readTar(ok.bytes);
    const pdf = [...entries].find(([name]) =>
      /\/documenti\/interventi\/modulo-.+\.pdf$/.test(name),
    );
    assert.ok(pdf, 'the confirmed sheet as PDF/A');
    assert.equal(pdf[1].subarray(0, 8).toString('latin1'), '%PDF-1.7');
    const json = [...entries].find(([name]) => name.endsWith('/dati.json'));
    assert.ok(json);
    const raw = json[1].toString('utf8');
    const dati = JSON.parse(raw) as {
      formato: string;
      persone: Array<{ theme: string }>;
      inviti: Array<{ email: string }>;
    };
    assert.equal(dati.formato, 'rilievi-impianti/esportazione-1');
    assert.ok(dati.persone[0]?.theme, 'the theme of each person');
    assert.deepEqual(
      dati.inviti.map((i) => i.email),
      ['nuovo@esempio.it'],
    );
    assert.doesNotMatch(raw, /tokenHash|passwordHash|hash-/);
    // The portal owner stays out of the company's log, also in its export.
    assert.ok(!raw.includes(master.id), 'no MASTER id');
    assert.ok(
      (
        dati as unknown as { registro: Array<{ action: string; actorId: string | null }> }
      ).registro.some((r) => r.action === 'AZIENDA_UPDATE' && r.actorId === null),
    );
    assert.equal(
      await prisma.auditLog.count({ where: { action: 'AZIENDA_EXPORT', aziendaId: azienda.id } }),
      1,
    );
    assert.match((await browser.get(pagina(azienda.id))).body, /Ultima esportazione:/);
  });

  it('is not for other roles, nor for another company', async () => {
    const { azienda } = await aziendaConAdmin('Esporta Chiusa');
    const { browser: tecnico } = await signedIn('TECNICO', azienda.id);
    assert.equal((await tecnico.get(pagina(azienda.id))).status, 404);
    const { browser: altro } = await aziendaConAdmin('Esporta Altra');
    const reply = await altro.get(pagina(azienda.id));
    // The page falls back to his own company; the other one is never shown.
    assert.doesNotMatch(reply.body, /Esporta Chiusa/);
    const _csrf = await altro.csrf('/account');
    const post = await altro.post(`${PAGE}/scarica`, {
      _csrf,
      azienda: azienda.id,
      password: PASSWORD,
    });
    assert.equal(post.status, 404);
  });
});

describe('switching provider', () => {
  it('starts a 30-day transition in which the service goes on, with emails and a notice', async () => {
    const { azienda, browser } = await aziendaConAdmin('Cambia Ascensori');
    const { browser: tecnico } = await signedIn('TECNICO', azienda.id);
    await makeUser('MASTER');
    const sbagliato = await browser.submit(pagina(azienda.id), `${PAGE}/cambio`, {
      azienda: azienda.id,
      esito: 'ALTRO_FORNITORE',
      conferma: 'Altro nome',
      letto: '1',
    });
    assert.equal(sbagliato.status, 422);
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })).cambioFineAt,
      null,
    );

    const prima = outbox.length;
    const ora = new Date();
    const ok = await browser.submit(pagina(azienda.id), `${PAGE}/cambio`, {
      azienda: azienda.id,
      esito: 'ALTRO_FORNITORE',
      conferma: 'Cambia Ascensori',
      letto: '1',
    });
    assert.equal(ok.status, 303);
    const dopo = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.equal(dopo.cambioEsito, 'ALTRO_FORNITORE');
    assert.equal(dopo.cambioFineAt?.toISOString(), fineTransizione(ora).toISOString());
    assert.equal(dopo.deactivatedAt, null);
    // The emails go out after the reply.
    for (let i = 0; i < 50 && outbox.length < prima + 2; i += 1)
      await new Promise((r) => setTimeout(r, 20));
    const nuove = outbox.slice(prima).map((m) => m.subject);
    assert.ok(nuove.some((s) => /Cambio di fornitore richiesto per Cambia Ascensori/.test(s)));
    assert.ok(nuove.some((s) => /chiede il cambio di fornitore/.test(s)));

    // The service goes on, and everyone sees until when.
    const lista = await tecnico.get('/schede', { accept: 'text/html' });
    assert.equal(lista.status, 200);
    assert.match(lista.body, /Cambio di fornitore in corso per Cambia Ascensori/);
    assert.doesNotMatch(
      lista.body,
      /Esportazione e cambio fornitore<\/a>/,
      'the link is for the ADMIN',
    );

    const di_nuovo = await browser.submit(pagina(azienda.id), `${PAGE}/cambio`, {
      azienda: azienda.id,
      esito: 'CANCELLAZIONE',
      conferma: 'Cambia Ascensori',
      letto: '1',
    });
    assert.equal(di_nuovo.status, 303);
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })).cambioEsito,
      'ALTRO_FORNITORE',
      'a second request changes nothing',
    );
  });

  it('extends once, changes the outcome and is withdrawn', async () => {
    const { azienda, browser } = await aziendaConAdmin('Proroga Ascensori');
    await browser.submit(pagina(azienda.id), `${PAGE}/cambio`, {
      azienda: azienda.id,
      esito: 'INFRASTRUTTURA_PROPRIA',
      conferma: 'Proroga Ascensori',
      letto: '1',
    });
    const fine = (await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } }))
      .cambioFineAt!;
    assert.equal(
      (
        await browser.submit(pagina(azienda.id), `${PAGE}/proroga`, {
          azienda: azienda.id,
          giorni: '45',
        })
      ).status,
      422,
    );
    await browser.submit(pagina(azienda.id), `${PAGE}/proroga`, {
      azienda: azienda.id,
      giorni: '30',
    });
    const prorogata = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.equal(prorogata.cambioProrogato, true);
    assert.equal(Math.round((prorogata.cambioFineAt!.getTime() - fine.getTime()) / DAY), 30);
    await browser.submit(pagina(azienda.id), `${PAGE}/proroga`, {
      azienda: azienda.id,
      giorni: '30',
    });
    assert.equal(
      (
        await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })
      ).cambioFineAt?.getTime(),
      prorogata.cambioFineAt!.getTime(),
      'only once',
    );

    await browser.submit(pagina(azienda.id), `${PAGE}/esito`, {
      azienda: azienda.id,
      esito: 'CANCELLAZIONE',
    });
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })).cambioEsito,
      'CANCELLAZIONE',
    );

    await browser.submit(pagina(azienda.id), `${PAGE}/annulla`, { azienda: azienda.id });
    const annullata = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.deepEqual(
      [
        annullata.cambioRichiestoAt,
        annullata.cambioFineAt,
        annullata.cambioEsito,
        annullata.cambioProrogato,
      ],
      [null, null, null, false],
    );
    const azioni = await prisma.auditLog.findMany({
      where: { aziendaId: azienda.id, action: { startsWith: 'AZIENDA_CAMBIO' } },
      orderBy: { at: 'asc' },
      select: { action: true },
    });
    assert.deepEqual(
      azioni.map((a) => a.action),
      [
        'AZIENDA_CAMBIO_RICHIESTO',
        'AZIENDA_CAMBIO_PROROGATO',
        'AZIENDA_CAMBIO_ESITO',
        'AZIENDA_CAMBIO_ANNULLATO',
      ],
    );
  });

  it('ends the service at the end: only the ADMIN comes back, only to download, for 90 days', async () => {
    const { azienda, admin, browser } = await aziendaConAdmin('Fine Ascensori');
    const tecnico = await makeUser('TECNICO', undefined, azienda.id);
    await browser.submit(pagina(azienda.id), `${PAGE}/cambio`, {
      azienda: azienda.id,
      esito: 'ALTRO_FORNITORE',
      conferma: 'Fine Ascensori',
      letto: '1',
    });
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: {
        cambioRichiestoAt: new Date(Date.now() - 31 * DAY),
        cambioFineAt: new Date(Date.now() - 60_000),
      },
    });
    assert.ok((await concludiCambi()) >= 1);
    const chiusa = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.ok(chiusa.deactivatedAt);
    assert.equal(await prisma.session.count({ where: { userId: admin.id } }), 0);
    assert.equal((await new Browser().login(tecnico.email)).status, 403);

    const ritorno = new Browser();
    assert.equal((await ritorno.login(admin.email)).status, 302);
    const schede = await ritorno.get('/schede');
    assert.equal(schede.status, 303);
    assert.equal(schede.location, PAGE);
    const pag = await ritorno.get(PAGE);
    assert.equal(pag.status, 200);
    assert.match(pag.body, /Il servizio per questa azienda è terminato/);
    assert.doesNotMatch(pag.body, /Richiedi il cambio di fornitore/);
    const scarica = await ritorno.submit(PAGE, `${PAGE}/scarica`, {
      azienda: azienda.id,
      password: PASSWORD,
    });
    assert.equal(scarica.status, 200);
    const cambio = await ritorno.submit(PAGE, `${PAGE}/cambio`, {
      azienda: azienda.id,
      esito: 'ALTRO_FORNITORE',
      conferma: 'Fine Ascensori',
      letto: '1',
    });
    // Anything but the export leads back to it, and changes nothing.
    assert.equal(cambio.status, 303);
    assert.equal(cambio.location, PAGE);
    assert.equal(
      (
        await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })
      ).deactivatedAt?.getTime(),
      chiusa.deactivatedAt.getTime(),
    );

    // After the 90 days nobody comes back; reactivation clears the request.
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: { deactivatedAt: new Date(Date.now() - 91 * DAY) },
    });
    assert.equal((await new Browser().login(admin.email)).status, 403);
    const { browser: master } = await signedIn('MASTER');
    await master.submit(`/aziende/${azienda.id}`, `/aziende/${azienda.id}/stato`, { active: '1' });
    const riattivata = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.equal(riattivata.deactivatedAt, null);
    assert.equal(riattivata.cambioFineAt, null);
  });

  it('confirms the deletion of the data by email to the admins', async () => {
    const { azienda, admin } = await aziendaConAdmin('Cancella Ascensori');
    await prisma.azienda.update({ where: { id: azienda.id }, data: { deactivatedAt: new Date() } });
    const prima = outbox.length;
    assert.equal(await eliminaAzienda(azienda.id, null), true);
    const mail = outbox.slice(prima).find((m) => m.to === admin.email);
    assert.ok(mail, 'the admin hears of it');
    assert.match(mail.subject, /Dati di Cancella Ascensori cancellati/);
  });
});

describe('the public page of the export', () => {
  it('documents the file from the code, the steps, the costs and the jurisdiction', async () => {
    const reply = await new Browser().get('/esportazione');
    assert.equal(reply.status, 200);
    assert.match(reply.body, /<h1>Esportazione dei dati e cambio di fornitore<\/h1>/);
    assert.match(reply.body, /<code>matricola<\/code>/);
    assert.match(reply.body, /rilievi-impianti\/esportazione-1/);
    assert.match(reply.body, /netcup GmbH/);
    assert.match(reply.body, /"@type":"FAQPage"/);
    assert.match(reply.body, /"@type":"HowTo"/);
    assert.match(reply.body, /<link rel="canonical" href="[^"]+\/esportazione">/);
    assert.match(reply.body, /<meta name="robots" content="index, follow">/);
    assert.doesNotMatch(reply.body, /[Ѐ-ӿ]/);
  });
});
