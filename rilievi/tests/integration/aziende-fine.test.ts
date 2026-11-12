// The end of the service for a company (audit, 4 November 2026 — GDPR art. 28(3)(g): at the end the data
// go back to the company and are deleted). The MASTER downloads everything of a company in one file; a
// deactivated company is deleted for good 90 days later, or at once by the MASTER typing its name — its
// sheets, files, forms, signs, calculations, invites, log and the people who work only there. Other
// companies and the people who also work elsewhere stay as they were.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { Browser, makeAzienda, makeUser, prisma, signedIn, startApp, stopApp } from './harness.js';
import { folder, newScheda, photo, processAll, upload } from './media.js';
import { readTar } from './tar.js';

// After the harness: the deletion reads the media settings it puts in place.
const { GIORNI_PRIMA_DELL_ELIMINAZIONE, eliminaAziendeScadute } =
  await import('../../src/aziende/eliminazione.js');

before(startApp);
after(stopApp);

/** A company with one person who works only there, a sheet with a photo, a form, a sign, a calculation. */
async function companyWithData(name: string) {
  const azienda = await makeAzienda(name);
  const { user, browser } = await signedIn('TECNICO', azienda.id);
  const schedaId = await newScheda(browser);
  assert.equal((await upload(browser, schedaId, 'quadro', await photo())).status, 200);
  await processAll();
  await prisma.intervento.create({
    data: { aziendaId: azienda.id, numero: 1, data: new Date('2026-11-04') },
  });
  await prisma.cartello.create({
    data: { aziendaId: azienda.id, data: new Date('2026-11-04'), testo: 'Impianto fermo' },
  });
  await prisma.calcoloArgano.create({
    data: { aziendaId: azienda.id, indirizzo: 'Via Fine 1', dati: {} },
  });
  await prisma.calcoloLimitatore.create({
    data: { aziendaId: azienda.id, schedaId, dati: { vn: 1, tipo: 'progressivo' } },
  });
  await prisma.verbale.create({
    data: { aziendaId: azienda.id, data: new Date('2026-11-05'), schedaId },
  });
  return { azienda, user, schedaId };
}

describe('the end of the service for a company', () => {
  it('gives the MASTER everything of a company in one file, without passwords or secrets', async () => {
    const { azienda, user, schedaId } = await companyWithData('Export Ascensori');
    const { browser: master } = await signedIn('MASTER');
    const reply = await master.get(`/aziende/${azienda.id}/esporta`);
    assert.equal(reply.status, 200);
    assert.equal(reply.headers.get('content-type'), 'application/x-tar');
    assert.match(reply.headers.get('content-disposition') ?? '', /^attachment; filename="rilievi-/);
    const entries = readTar(reply.bytes);
    const json = [...entries].find(([name]) => name.endsWith('/dati.json'));
    assert.ok(json, 'the data are there');
    const dati = JSON.parse(json[1].toString('utf8')) as {
      azienda: { id: string };
      persone: Array<{ email: string }>;
      schede: Array<{ id: string; allegati: Array<{ file: string | null }> }>;
      interventi: unknown[];
      cartelli: unknown[];
      calcoliArgano: unknown[];
      calcoliLimitatore: unknown[];
      verbali: unknown[];
    };
    assert.equal(dati.azienda.id, azienda.id);
    assert.deepEqual(
      dati.persone.map((p) => p.email),
      [user.email],
    );
    assert.equal(dati.schede.length, 1);
    assert.equal(dati.schede[0]!.id, schedaId);
    assert.equal(dati.interventi.length, 1);
    assert.equal(dati.cartelli.length, 1);
    assert.equal(dati.calcoliArgano.length, 1);
    assert.equal(dati.calcoliLimitatore.length, 1);
    assert.equal(dati.verbali.length, 1);
    const file = dati.schede[0]!.allegati[0]!.file;
    assert.ok(
      file && [...entries.keys()].some((name) => name.endsWith(file)),
      'the photo is there',
    );
    const raw = json[1].toString('utf8');
    for (const secret of ['passwordHash', 'totpSecretEnc', 'tokenHash', 'sigilloKey', '$argon2'])
      assert.doesNotMatch(raw, new RegExp(secret.replace('$', '\\$')), secret);

    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    assert.equal((await admin.get(`/aziende/${azienda.id}/esporta`)).status, 403);
    const log = await prisma.auditLog.count({
      where: { action: 'AZIENDA_EXPORT', aziendaId: azienda.id },
    });
    assert.equal(log, 1);
  });

  it('deletes a company only once deactivated and only with its name typed, with all it holds', async () => {
    const { azienda, user, schedaId } = await companyWithData('Fine Ascensori');
    const keeper = await makeAzienda('Resta Ascensori');
    const both = await makeUser('ADMIN', 'In Due Aziende', azienda.id);
    await prisma.membership.create({
      data: { userId: both.id, aziendaId: keeper.id, role: 'TECNICO' },
    });
    const kept = await prisma.scheda.create({
      data: { aziendaId: keeper.id, data: new Date('2026-11-04'), searchText: '' },
    });
    const { browser: master } = await signedIn('MASTER');
    const page = `/aziende/${azienda.id}`;

    const active = await master.submit(page, `${page}/elimina`, { conferma: azienda.name });
    assert.equal(active.status, 400, 'an active company is never deleted');
    assert.equal(await prisma.azienda.count({ where: { id: azienda.id } }), 1);

    await master.submit(page, `${page}/stato`, { active: '0' });
    const shown = await master.get(page);
    assert.match(shown.body, new RegExp(`action="${page}/elimina"`));
    assert.match(shown.body, new RegExp(`href="${page}/esporta"`));

    const wrong = await master.submit(page, `${page}/elimina`, { conferma: 'Altro Nome' });
    assert.equal(wrong.status, 400);
    assert.equal(await prisma.azienda.count({ where: { id: azienda.id } }), 1);

    const done = await master.submit(page, `${page}/elimina`, { conferma: azienda.name });
    assert.equal(done.status, 303);
    assert.equal(done.location, '/aziende');
    assert.equal(await prisma.azienda.count({ where: { id: azienda.id } }), 0);
    for (const count of [
      prisma.scheda.count({ where: { aziendaId: azienda.id } }),
      prisma.allegato.count({ where: { schedaId } }),
      prisma.intervento.count({ where: { aziendaId: azienda.id } }),
      prisma.cartello.count({ where: { aziendaId: azienda.id } }),
      prisma.calcoloArgano.count({ where: { aziendaId: azienda.id } }),
      prisma.calcoloLimitatore.count({ where: { aziendaId: azienda.id } }),
      prisma.verbale.count({ where: { aziendaId: azienda.id } }),
      prisma.invite.count({ where: { aziendaId: azienda.id } }),
      prisma.auditLog.count({ where: { aziendaId: azienda.id } }),
      prisma.user.count({ where: { id: user.id } }),
    ])
      assert.equal(await count, 0);
    assert.ok(!existsSync(folder(schedaId)), 'the files of its sheets are gone');
    // Who also works elsewhere stays there; the other company is untouched.
    assert.deepEqual(
      (await prisma.membership.findMany({ where: { userId: both.id } })).map((m) => m.aziendaId),
      [keeper.id],
    );
    assert.equal(await prisma.scheda.count({ where: { id: kept.id } }), 1);
    const trace = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'AZIENDA_DELETE', targetId: azienda.id },
    });
    assert.equal(trace.aziendaId, null);
    assert.doesNotMatch(JSON.stringify(trace.meta), /Fine Ascensori|@/);
  });

  it('is deleted by itself 90 days after deactivation, not a day before, not once reactivated', async () => {
    assert.equal(GIORNI_PRIMA_DELL_ELIMINAZIONE, 90);
    const day = 24 * 60 * 60 * 1000;
    const old = await makeAzienda('Scaduta Ascensori');
    const recent = await makeAzienda('Recente Ascensori');
    const active = await makeAzienda('Attiva Ascensori');
    const now = Date.now();
    await prisma.azienda.update({
      where: { id: old.id },
      data: { deactivatedAt: new Date(now - 91 * day) },
    });
    await prisma.azienda.update({
      where: { id: recent.id },
      data: { deactivatedAt: new Date(now - 89 * day) },
    });
    const only = await makeUser('TECNICO', 'Solo Scaduta', old.id);
    assert.ok((await eliminaAziendeScadute(now)) >= 1);
    assert.equal(await prisma.azienda.count({ where: { id: old.id } }), 0);
    assert.equal(await prisma.user.count({ where: { id: only.id } }), 0);
    assert.equal(await prisma.azienda.count({ where: { id: recent.id } }), 1);
    assert.equal(await prisma.azienda.count({ where: { id: active.id } }), 1);
    const trace = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'AZIENDA_DELETE', targetId: old.id },
    });
    assert.equal(trace.actorId, null);
    assert.equal((trace.meta as { automatica?: boolean }).automatica, true);
  });

  it('tells the people of the company page when, and lets nobody else near it', async () => {
    const azienda = await makeAzienda('Avviso Ascensori');
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: { deactivatedAt: new Date('2026-11-01T10:00:00Z') },
    });
    const { browser: master } = await signedIn('MASTER');
    const page = await master.get(`/aziende/${azienda.id}`);
    assert.match(page.body, /30\/01\/2027/, 'the day of the deletion: 90 days later');
    const { browser: admin } = await signedIn('ADMIN');
    const _csrf = await admin.csrf('/account');
    const forged = await admin.post(`/aziende/${azienda.id}/elimina`, {
      _csrf,
      conferma: azienda.name,
    });
    assert.equal(forged.status, 403);
    assert.equal(await prisma.azienda.count({ where: { id: azienda.id } }), 1);
    assert.equal((await new Browser().get(`/aziende/${azienda.id}/esporta`)).status, 302);
  });
});
