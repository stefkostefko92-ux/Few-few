import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import { db, resetDb, startApp, type Harness } from './helpers.js';
import { ask, newCase, seedWorld, type World } from './world.js';

/**
 * AC-12 / NFR-12: повторът след провал на AI (503, скъсана връзка) пита модела за СЪЩОТО
 * съобщение — без второ човешко съобщение; едно AI извикване на случай наведнъж.
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

const count = (caseId: string, kind: 'HUMAN' | 'AI') =>
  db.caseMessage.count({ where: { caseId, kind } });

describe('Повтор след провал на AI', () => {
  test('същият clientMessageId след 503 → AI отговор за същото съобщение, без дубликат', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const clientMessageId = randomUUID();
    h.model.plan = () => {
      throw new Error('vertex down');
    };
    const failed = await ask(w.portalAlfa, caseId, 'Errore E37', { clientMessageId });
    assert.equal(failed.status, 503);
    assert.equal((await db.case.findUniqueOrThrow({ where: { id: caseId } })).status, 'OPEN');

    h.model.reset();
    const retry = await ask(w.portalAlfa, caseId, 'Errore E37', { clientMessageId });
    assert.equal(retry.status, 200);
    assert.ok(retry.body.answer, 'повторът носи AI отговор');
    assert.equal(await count(caseId, 'HUMAN'), 1);
    assert.equal(await count(caseId, 'AI'), 1);
    assert.equal(h.model.questions.at(-1)?.includes('E37'), true);

    // Трети повтор: отговорът вече е там — моделът не се вика пак.
    const calls = h.model.calls;
    const again = await ask(w.portalAlfa, caseId, 'Errore E37', { clientMessageId });
    assert.equal(again.status, 200);
    assert.equal(again.body.answer.id, retry.body.answer.id);
    assert.equal(h.model.calls, calls);
  });

  test('не пита наново: съобщение без AI, вече има по-ново човешко, или друг автор', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const noAi = randomUUID();
    await ask(w.portalAlfa, caseId, 'Per l’operatore', { clientMessageId: noAi, askAi: false });
    const replay = await ask(w.portalAlfa, caseId, 'Per l’operatore', {
      clientMessageId: noAi,
      askAi: false,
    });
    assert.deepEqual([replay.status, replay.body.answer], [200, null]);

    h.model.plan = () => {
      throw new Error('vertex down');
    };
    const old = randomUUID();
    assert.equal(
      (await ask(w.portalAlfa, caseId, 'Errore E37', { clientMessageId: old })).status,
      503,
    );
    h.model.reset();
    await ask(w.portalAlfa, caseId, 'Altro', { askAi: false });
    const stale = await ask(w.portalAlfa, caseId, 'Errore E37', { clientMessageId: old });
    assert.deepEqual([stale.status, stale.body.answer], [200, null]);
    assert.equal(h.model.calls, 0);
    assert.equal(await count(caseId, 'AI'), 0);
  });

  test('едно AI извикване на случай: зает случай → 409; заключване от срив не блокира завинаги', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await db.case.update({ where: { id: caseId }, data: { status: 'AI_IN_PROGRESS' } });
    const clientMessageId = randomUUID();
    const busy = await ask(w.portalAlfa, caseId, 'Errore E37', { clientMessageId });
    assert.deepEqual([busy.status, busy.body.code], [409, 'ai_in_progress']);
    assert.equal(await count(caseId, 'HUMAN'), 1, 'съобщението е записано');
    assert.equal(h.model.calls, 0);

    // Заключване по-старо от тавана (процесът е паднал по време на извикването).
    await db.$executeRaw`UPDATE "Case" SET "updatedAt" = now() - interval '10 minutes' WHERE id = ${caseId}`;
    const retry = await ask(w.portalAlfa, caseId, 'Errore E37', { clientMessageId });
    assert.equal(retry.status, 200);
    assert.ok(retry.body.answer);
    assert.equal(await count(caseId, 'HUMAN'), 1);
    assert.notEqual(
      (await db.case.findUniqueOrThrow({ where: { id: caseId } })).status,
      'AI_IN_PROGRESS',
    );
  });
});
