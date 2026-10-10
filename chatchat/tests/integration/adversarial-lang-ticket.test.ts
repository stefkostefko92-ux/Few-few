import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { db, makeUser, resetDb, signIn, startApp, type Harness } from './helpers.js';
import { answerOf, ask, newCase, publishDoc, seedWorld, type World } from './world.js';

/**
 * §16.3, останалите два случая: „ръководство на друг език“ и „тикет без сериен номер/контекст“.
 * Фикстурите са измислени.
 */

let h: Harness;
let w: World;

before(async () => {
  h = await startApp();
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  h.model.reset();
  w = await seedWorld(h);
});

const EN_TEXT = 'Terminal X7 supplies the encoder: the voltage must not drop below 5 V.';

describe('Ръководство на друг език (§16.3 „manuale in lingua diversa“)', () => {
  beforeEach(async () => {
    await publishDoc(w.ownerA1, {
      code: 'MAN-500-EN',
      language: 'en',
      applicability: [{ productModel: 'LTX-500', fwMin: '4.0', fwMax: '4.9' }],
      pages: [{ page: 3, text: EN_TEXT }],
    });
  });

  test('английско ръководство се намира по общите знаци (X7), моделът го получава с език „en“, цитатът е дословен', async () => {
    const caseId = await newCase(w.portalAlfa, { context: { errorCode: null } });
    const answer = answerOf(await ask(w.portalAlfa, caseId, 'Tensione encoder bassa, morsetto X7'));
    assert.equal(h.model.calls, 1);
    assert.match(h.model.texts[0] ?? '', /"language":"en"/);
    assert.match(h.model.texts[0] ?? '', /Answer language: Italian/);
    const cited = answer.evidence.find(
      (e: { documentCode: string }) => e.documentCode === 'MAN-500-EN',
    );
    assert.ok(cited, 'английският източник е цитиран');
    assert.ok(EN_TEXT.includes((cited.quote as string).trim().slice(0, 40)));
  });

  test('„преведен“ цитат не е дословен → изпуска се (езикът не заобикаля NFR-10)', async () => {
    h.model.plan = (pack) => {
      const doc = pack.find((p) => p.documentCode === 'MAN-500-EN');
      assert.ok(doc);
      return {
        causes: [{ text: 'Tensione bassa', evidenceRefs: [doc.ref] }],
        evidenceUsed: [
          {
            ref: doc.ref,
            quote: 'Il morsetto X7 alimenta l’encoder: la tensione non deve scendere sotto 5 V.',
          },
        ],
      };
    };
    const caseId = await newCase(w.portalAlfa, { context: { errorCode: null } });
    const answer = answerOf(await ask(w.portalAlfa, caseId, 'Tensione encoder bassa, morsetto X7'));
    assert.deepEqual(
      answer.gate.droppedCitations.map((d: { reason: string }) => d.reason),
      ['gate.citation.quoteNotFound'],
    );
  });

  test('потребител с български: езикът на отговора е български, а откъсът остава английски', async () => {
    const bg = await makeUser({
      tenantId: w.tenantA.id,
      companyId: w.alfa.id,
      role: 'PORTAL_TECHNICIAN',
      kind: 'PORTAL',
      locale: 'bg',
    });
    const c = await signIn(h, bg);
    const caseId = await newCase(c, { context: { errorCode: null } });
    const answer = answerOf(await ask(c, caseId, 'Ниско напрежение на енкодера, клема X7'));
    assert.match(h.model.texts[0] ?? '', /Answer language: Bulgarian/);
    const cited = answer.evidence.find(
      (e: { documentCode: string }) => e.documentCode === 'MAN-500-EN',
    );
    assert.ok(cited);
    assert.match(cited.quote as string, /Terminal X7/);
  });
});

describe('Тикет без сериен номер или достатъчен контекст (§16.3)', () => {
  const empty = { hardwareRevision: null, firmware: null, serial: null, errorCode: null };

  test('случай без контекст: отговорът иска данни, тикетът се създава и не измисля нищо', async () => {
    const caseId = await newCase(w.portalAlfa, { context: empty });
    const answer = answerOf(await ask(w.portalAlfa, caseId, 'Non funziona niente'));
    assert.equal(h.model.calls, 0);
    assert.equal(answer.status, 'undetermined');
    assert.deepEqual(answer.escalation.collect.slice(0, 3), [
      'collect.hardwareRevision',
      'collect.firmware',
      'collect.serial',
    ]);

    const res = await w.portalAlfa.post('/api/v1/tickets', { caseId, reason: 'Non so altro' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const s = res.body.ticket.summary;
    assert.deepEqual(
      [s.context.serial, s.context.firmware, s.context.hardwareRevision, s.context.errorCode],
      [null, null, null, null],
    );
    assert.deepEqual(s.sources, []);
    assert.equal(s.lastAnswer.generatedBy, 'ai');
    assert.ok(s.lastAnswer.missingData.includes('ctx.firmware'));
    assert.ok(s.lastAnswer.missingData.includes('gate.noApplicableSource'));
  });

  test('тикет и без нито едно съобщение: контекстът е празен, без lastAnswer', async () => {
    const caseId = await newCase(w.portalAlfa, { context: empty });
    const res = await w.portalAlfa.post('/api/v1/tickets', { caseId, reason: 'Subito' });
    assert.equal(res.status, 201);
    assert.equal(res.body.ticket.summary.lastAnswer, null);
    assert.equal(res.body.ticket.summary.humanMessages, 0);
    assert.equal(res.body.ticket.summary.context.serial, null);
  });
});
