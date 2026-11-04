// Signing an intervention sheet (the owner, 30 October 2026 — "the signature bound to the content"): a draft
// never holds a signature; the two signatures are given on the final, read-only sheet and sent back with the
// version and the fingerprint shown; one write confirms and seals. A sheet changed afterwards in the
// database fails its seal: no PDF, no email.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  improntaContenuto,
  improntaLeggibile,
  sigilloValido,
} from '../../src/interventi/sigillo.js';
import { makeAzienda, outbox, prisma, signedIn, startApp, stopApp } from './harness.js';
import {
  baseOf,
  create,
  FIRMA_TECNICO,
  firma,
  FIRME,
  firmeNuove,
  FORM,
  paginaFirma,
  SEAL_KEY,
} from './interventi-helpers.js';

before(startApp);
after(stopApp);

describe('signing an intervention sheet', () => {
  it('never keeps a signature on a draft — not from the form, not in the database', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...FORM, ...FIRME });
    let row = await prisma.intervento.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(
      [row.firmaTecnico, row.firmaTecnicoNome, row.firmaCliente, row.firmaClienteNome],
      [null, null, null, null],
    );
    const saved = await browser.submit(`/interventi/${id}/modifica`, `/interventi/${id}`, {
      ...FORM,
      ...FIRME,
      base: await baseOf(browser, id),
    });
    assert.equal(saved.status, 303);
    row = await prisma.intervento.findUniqueOrThrow({ where: { id } });
    assert.equal(row.firmaTecnico, null);
    assert.equal(row.firmaClienteNome, null);
    const draft = await browser.get(`/interventi/${id}`);
    assert.match(draft.body, new RegExp(`href="/interventi/${id}/firma"`));
    assert.doesNotMatch(draft.body, /data-firma-canvas/, 'no signature pad on a draft');
    // The database itself refuses a signature on a draft (CHECK "Intervento_firme_check").
    await assert.rejects(
      prisma.intervento.update({ where: { id }, data: { firmaClienteNome: 'Anna Bianchi' } }),
    );
  });

  it('signs exactly the content shown: a change after opening the page asks for new signatures', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, FORM);
    const vista = await paginaFirma(browser, id);
    const row = await prisma.intervento.findUniqueOrThrow({ where: { id } });
    assert.equal(
      vista.impronta,
      improntaContenuto(row),
      'the page shows the fingerprint of the row',
    );
    assert.match(vista.body, new RegExp(improntaLeggibile(vista.impronta)));
    assert.match(vista.body, /data-firma-canvas/);
    assert.match(vista.body, /Via Roma 12/, 'the sheet is on the signing page');

    // Missing signatures and names: 422, nothing confirmed.
    const empty = await browser.submit(`/interventi/${id}/firma`, `/interventi/${id}/conferma`, {
      base: vista.base,
      impronta: vista.impronta,
    });
    assert.equal(empty.status, 422);
    assert.match(empty.body, /Manca la firma nel riquadro/);
    // The same strokes in both pads: the customer did not sign.
    const copied = await browser.submit(`/interventi/${id}/firma`, `/interventi/${id}/conferma`, {
      base: vista.base,
      impronta: vista.impronta,
      ...FIRME,
      firmaCliente: FIRMA_TECNICO,
    });
    assert.equal(copied.status, 422);
    assert.match(copied.body, /Le due firme sono identiche/);

    // A colleague saves the draft while the page is open: the signatures are for the old content.
    const colleague = (await signedIn('OPERATORE', row.aziendaId)).browser;
    await colleague.submit(`/interventi/${id}/modifica`, `/interventi/${id}`, {
      ...FORM,
      citta: 'Monza',
      base: await baseOf(colleague, id),
    });
    const stale = await browser.submit(`/interventi/${id}/firma`, `/interventi/${id}/conferma`, {
      base: vista.base,
      impronta: vista.impronta,
      ...FIRME,
    });
    assert.equal(stale.status, 409);
    assert.match(stale.body, /Il modulo è stato modificato dopo l&#39;apertura di questa pagina/);
    assert.match(stale.body, /Monza/, 'the new content is shown');
    assert.match(stale.body, /name="firmaTecnico" value=""/, 'the old signatures are not carried');
    assert.match(stale.body, /name="firmaCliente" value=""/);
    // The right version with another fingerprint (a forged form): refused too.
    const forged = await browser.submit(`/interventi/${id}/firma`, `/interventi/${id}/conferma`, {
      base: (await paginaFirma(browser, id)).base,
      impronta: vista.impronta,
      ...FIRME,
    });
    assert.equal(forged.status, 409);
    assert.equal((await prisma.intervento.findUniqueOrThrow({ where: { id } })).confermatoAt, null);

    // Signed on the current content: confirmed and sealed in one write.
    const mie = firmeNuove();
    const done = await firma(browser, id, mie);
    assert.equal(done.status, 303);
    const sealed = await prisma.intervento.findUniqueOrThrow({ where: { id } });
    assert.ok(sealed.confermatoAt);
    assert.equal(sealed.citta, 'Monza');
    assert.equal(sealed.impronta, improntaContenuto(sealed));
    assert.match(sealed.sigillo ?? '', /^[0-9a-f]{64}$/);
    assert.equal(sigilloValido(SEAL_KEY(), sealed), true);
    assert.deepEqual(sealed.firmaCliente, JSON.parse(mie.firmaCliente!));
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { targetId: id, action: 'INTERVENTO_CONFIRM' },
    });
    assert.deepEqual(audit.meta, { numero: sealed.numero, impronta: sealed.impronta });
    // Signing again: the sheet is closed, nothing changes.
    const again = await browser.get(`/interventi/${id}/firma`);
    assert.equal(again.status, 303);
    const twice = await browser.submit(`/interventi/${id}`, `/interventi/${id}/conferma`, {
      base: sealed.updatedAt.toISOString(),
      impronta: sealed.impronta!,
      ...FIRME,
      firmaClienteNome: 'Altra Persona',
    });
    assert.equal(twice.status, 303);
    const after = await prisma.intervento.findUniqueOrThrow({ where: { id } });
    assert.equal(after.firmaClienteNome, 'Anna Bianchi');
    assert.equal(after.sigillo, sealed.sigillo);
  });

  it('blocks the PDF and the email of a sheet changed after the signature, in the database', async () => {
    const { browser } = await signedIn('TECNICO');
    for (const tamper of [
      Prisma.sql`"citta" = 'Altrove'`,
      Prisma.sql`"firmaClienteNome" = 'Altra Persona'`,
      Prisma.sql`"voci" = '{}'::jsonb`,
      Prisma.sql`"confermatoAt" = "confermatoAt" + interval '1 day'`,
      Prisma.sql`"confermatoById" = NULL`,
    ]) {
      const id = await create(browser, FORM);
      assert.equal((await firma(browser, id)).status, 303);
      assert.equal((await browser.get(`/interventi/${id}/pdf`)).status, 200);
      await prisma.$executeRaw`UPDATE "Intervento" SET ${tamper} WHERE "id" = ${id}`;
      const page = await browser.get(`/interventi/${id}`);
      assert.match(page.body, /Il sigillo non corrisponde al contenuto firmato/);
      assert.doesNotMatch(page.body, new RegExp(`href="/interventi/${id}/pdf"`));
      assert.doesNotMatch(page.body, /\/invia"/);
      const pdf = await browser.get(`/interventi/${id}/pdf`);
      assert.equal(pdf.status, 303, 'no PDF of a tampered sheet');
      const before = outbox.length;
      const mail = await browser.submit('/interventi/nuovo', `/interventi/${id}/invia`, {
        email: 'cliente@esempio.test',
      });
      assert.equal(mail.status, 303);
      assert.equal(outbox.length, before, 'no email of a tampered sheet');
    }
  });

  it('refuses strokes already on another sheet — copied from the page, the PDF or the form', async () => {
    const { browser } = await signedIn('TECNICO');
    const primo = await create(browser, FORM);
    const firme = firmeNuove();
    assert.equal((await firma(browser, primo, firme)).status, 303);
    // The customer's strokes, as anyone who reads the confirmed sheet sees them (the SVG path).
    const secondo = await create(browser, { ...FORM, citta: 'Inventata' });
    const replay = await firma(browser, secondo, {
      ...firmeNuove(),
      firmaCliente: firme.firmaCliente!,
    });
    assert.equal(replay.status, 422);
    assert.match(replay.body, /Questa firma è già presente su un altro modulo/);
    assert.match(replay.body, /name="firmaCliente" value=""/, 'the copied signature is dropped');
    // The technician's strokes in the customer's pad, from another company: refused too.
    const altro = (await signedIn('TECNICO', (await makeAzienda()).id)).browser;
    const terzo = await create(altro, FORM);
    const cross = await firma(altro, terzo, { ...firmeNuove(), firmaCliente: firme.firmaTecnico! });
    assert.equal(cross.status, 422);
    for (const id of [secondo, terzo])
      assert.equal(
        (await prisma.intervento.findUniqueOrThrow({ where: { id } })).confermatoAt,
        null,
      );
    // What the migration computes for older sheets is what the application computes.
    const [row] = await prisma.$queryRaw<Array<{ sql: string; app: string | null }>>`
      SELECT encode(sha256(convert_to(replace(("firmaCliente" -> 's')::text, ' ', ''), 'UTF8')), 'hex') AS sql,
             "firmaClienteHash" AS app
      FROM "Intervento" WHERE "id" = ${primo}`;
    assert.ok(row?.app);
    assert.equal(row.sql, row.app);
    // Signed again by hand: it passes.
    assert.equal((await firma(browser, secondo)).status, 303);
  });
});
