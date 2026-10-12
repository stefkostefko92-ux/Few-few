import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { cite, Client, db, resetDb, startApp, type Harness, type PackItem } from './helpers.js';
import { answerOf, ask, newCase, publishError, seedWorld, TEXT, type World } from './world.js';

/**
 * Критериите за приемане на спецификацията (AC-xx) през целия път на живо:
 * HTTP → случай → retrieval върху PostgreSQL → (фалшив модел) → Safety Gate → запис.
 * Тестовете гледат отговора на API-то и записаното, не вътрешностите.
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

const find = (pack: PackItem[], code: string, revision?: string) =>
  pack.find((p) => p.documentCode === code && (revision === undefined || p.revision === revision));
const errorsIn = (pack: PackItem[]) => pack.filter((p) => p.kind === 'error');

describe('AC-01 — код за грешка → точният запис за продукт и версия', () => {
  test('на фърмуер 4.2 отговорът е за E37 v1 (encoder), не за v2', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const res = await ask(w.portalAlfa, caseId, 'Errore E37 durante la corsa');
    assert.equal(res.status, 201);
    const answer = answerOf(res);
    assert.equal(answer.gate.evidenceLevel, 'strong');
    assert.deepEqual(
      answer.evidence.map((c: { errorId: string | null }) => c.errorId),
      [w.errors.e37v1],
    );

    const pack = h.model.packs[0] ?? [];
    const [v1, v2] = [
      errorsIn(pack).find((p) => p.text.includes('versione quattro')),
      errorsIn(pack).find((p) => p.text.includes('versione cinque')),
    ];
    assert.equal(v1?.applicable, true);
    assert.equal(v2?.applicable, false, 'версията за друг фърмуер е в пакета, но несъвместима');
  });

  test('на фърмуер 5.1 (ревизия C) същият код води до v2', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-2' });
    const res = await ask(w.portalAlfa, caseId, 'Errore E37 durante la corsa');
    const answer = answerOf(res);
    assert.equal(answer.gate.evidenceLevel, 'strong');
    assert.deepEqual(
      answer.evidence.map((c: { errorId: string | null }) => c.errorId),
      [w.errors.e37v2],
    );
  });

  test('справката по код дава същото съответствие: applicable по версия', async () => {
    const at = (fw: string) =>
      w.portalAlfa.get(`/api/v1/errors/E37?model=LTX-500&hw=B&fw=${fw}`).then((r) => r.body.errors);
    const v42 = await at('4.2');
    assert.equal(v42.length, 2);
    assert.deepEqual(
      v42.map((e: { applicable: boolean; title: string }) => [e.title, e.applicable]).sort(),
      [
        ['Guasto encoder', true],
        ['Sovratemperatura inverter', false],
      ],
    );
    const v51 = await at('5.1');
    assert.deepEqual(
      v51
        .filter((e: { applicable: boolean }) => e.applicable)
        .map((e: { title: string }) => e.title),
      ['Sovratemperatura inverter'],
    );
  });
});

describe('AC-02 — несъвместима ревизия не е основен източник', () => {
  test('ръководство за фърмуер 5 при табло 4.2: в пакета, но несъвместимо; цитатът към него отпада', async () => {
    h.model.plan = (pack) => {
      const a = find(pack, 'MAN-500', 'A');
      const b = find(pack, 'MAN-500', 'B');
      assert.ok(a && b);
      return {
        causes: [{ text: 'Encoder', evidenceRefs: [a.ref, b.ref] }],
        evidenceUsed: [cite(a), cite(b)],
      };
    };
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const res = await ask(w.portalAlfa, caseId, 'E37 cavo encoder morsetto');
    const answer = answerOf(res);

    const pack = h.model.packs[0] ?? [];
    assert.equal(find(pack, 'MAN-500', 'A')?.applicable, true);
    assert.equal(find(pack, 'MAN-500', 'B')?.applicable, false);
    const cited = answer.evidence.map(
      (c: { documentCode: string; revision: string }) => c.revision,
    );
    assert.equal(cited.includes('B'), false, 'ревизия B не е цитирана');
    assert.ok(cited.includes('A'));
    assert.deepEqual(
      answer.gate.droppedCitations.map((d: { reason: string }) => d.reason),
      ['gate.citation.notApplicable'],
    );
    assert.deepEqual(answer.conflicts, [], 'несъвместимата ревизия не е конфликт');
  });

  test('ако моделът се опре САМО на несъвместимия източник, няма подкрепена причина и няма сигурност', async () => {
    h.model.plan = (pack) => {
      const b = find(pack, 'MAN-500', 'B');
      assert.ok(b);
      return { causes: [{ text: 'Inverter', evidenceRefs: [b.ref] }], evidenceUsed: [cite(b)] };
    };
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const answer = answerOf(await ask(w.portalAlfa, caseId, 'sovratemperatura inverter trazione'));
    assert.deepEqual(answer.causes, []);
    assert.notEqual(answer.status, 'identified');
    assert.equal(answer.escalation.recommended, true);
  });

  test('на фърмуер 5.1 ролите се разменят: ревизия B е основна, A — несъвместима', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-2' });
    await ask(w.portalAlfa, caseId, 'E37 inverter');
    const pack = h.model.packs[0] ?? [];
    assert.equal(find(pack, 'MAN-500', 'B')?.applicable, true);
    assert.equal(find(pack, 'MAN-500', 'A')?.applicable, false);
  });
});

describe('AC-03 — поне един източник с документ, ревизия, страница и цитат', () => {
  test('има съвместим източник → отговорът носи цитат и той е записан като проследимост', async () => {
    h.model.plan = (pack) => {
      const a = find(pack, 'MAN-500', 'A');
      assert.ok(a);
      return { causes: [{ text: 'Encoder', evidenceRefs: [a.ref] }], evidenceUsed: [cite(a)] };
    };
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const res = await ask(w.portalAlfa, caseId, 'E37 cavo encoder morsetto X3');
    const answer = answerOf(res);
    assert.ok(answer.evidence.length >= 1);
    const man = answer.evidence.find((c: { documentCode: string }) => c.documentCode === 'MAN-500');
    assert.equal(man.revision, 'A');
    assert.equal(man.page, 4);
    assert.equal(man.quote, TEXT.manualFw4);
    assert.equal(man.documentId, w.docs.manFw4);

    const rows = await db.caseEvidence.findMany({ where: { caseId } });
    assert.equal(rows.length, answer.evidence.length);
    assert.ok(rows.some((r) => r.documentId === w.docs.manFw4 && r.page === 4));
    const message = await db.caseMessage.findUniqueOrThrow({ where: { id: res.body.answer.id } });
    assert.match(message.knowledgeSnapshotId ?? '', /^ks_[0-9a-f]{32}$/);
    assert.ok(message.promptVersion);
  });

  test('цитатите се възстановяват и от публичната справка за страница (дословно)', async () => {
    const page = await w.portalAlfa.get(`/api/v1/documents/${w.docs.manFw4}/pages/4`);
    assert.equal(page.status, 200);
    assert.equal(page.body.chunks[0].text, TEXT.manualFw4);
    assert.equal(page.body.document.revision, 'A');
  });
});

describe('AC-04 — недостатъчно доказателства: изрично „не е определено“, без модел', () => {
  test('продукт без знание → моделът не се вика, ескалация, нищо измислено', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ZZ-1' });
    const res = await ask(w.portalAlfa, caseId, 'Errore E37 durante la corsa');
    assert.equal(res.status, 201);
    assert.equal(h.model.calls, 0);
    const answer = answerOf(res);
    assert.equal(answer.status, 'undetermined');
    assert.equal(answer.gate.evidenceLevel, 'none');
    assert.equal(answer.escalation.recommended, true);
    assert.deepEqual([answer.causes, answer.checks, answer.evidence], [[], [], []]);
    assert.ok(answer.missingData.includes('gate.noApplicableSource'));
    const c = await db.case.findUniqueOrThrow({ where: { id: caseId } });
    assert.equal(c.status, 'WAITING_TECHNICIAN');
  });

  test('знанието съществува, но не е за тази версия (фърмуер 3.0) → пак без модел', async () => {
    const caseId = await newCase(w.portalAlfa, { context: { firmware: '3.0' } });
    const res = await ask(w.portalAlfa, caseId, 'E37');
    assert.equal(h.model.calls, 0);
    const answer = answerOf(res);
    assert.equal(answer.gate.evidenceLevel, 'none');
    assert.equal(answer.status, 'undetermined');
    assert.equal(answer.evidence.length, 0);
  });
});

describe('AC-05 — safety-relevant без документ → без процедура; с документ → с потвърждение', () => {
  const SAFETY = 'Verificare il contatto porta di piano con il multimetro.';

  test('без одобрена процедура стъпката се маха, отговорът е blocked със ескалация', async () => {
    h.model.plan = (pack) => {
      const a = find(pack, 'MAN-500', 'A');
      assert.ok(a);
      return {
        causes: [{ text: 'Encoder', evidenceRefs: [a.ref] }],
        // моделът я обявява за безобидна диагностика — речникът не е съгласен
        checks: [
          {
            step: 1,
            action: SAFETY,
            expected: 'Contatto chiuso',
            actionClass: 'DIAGNOSTIC',
            evidenceRefs: [a.ref],
          },
        ],
        evidenceUsed: [cite(a)],
      };
    };
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const answer = answerOf(await ask(w.portalAlfa, caseId, 'Errore E37 in corsa'));
    assert.equal(
      find(h.model.packs[0] ?? [], 'PROC-DOOR-001'),
      undefined,
      'процедурата не е в пакета',
    );
    assert.deepEqual(answer.checks, []);
    assert.deepEqual(answer.gate.removedSteps, [
      { step: 1, reason: 'gate.removed.safetyUnapproved' },
    ]);
    assert.equal(answer.safety.level, 'blocked');
    assert.equal(answer.escalation.recommended, true);
  });

  test('с публикувана процедура по безопасност стъпката остава и иска потвърждение', async () => {
    h.model.plan = (pack) => {
      const proc = find(pack, 'PROC-DOOR-001');
      assert.ok(proc, 'процедурата е в пакета');
      return {
        causes: [{ text: 'Contatto porta', evidenceRefs: [proc.ref] }],
        checks: [
          {
            step: 1,
            action: SAFETY,
            expected: 'Contatto chiuso',
            actionClass: 'SAFETY_RELEVANT',
            evidenceRefs: [proc.ref],
          },
        ],
        evidenceUsed: [cite(proc)],
      };
    };
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const answer = answerOf(
      await ask(
        w.portalAlfa,
        caseId,
        'Come verifico il contatto porta di piano con il multimetro?',
      ),
    );
    assert.equal(answer.checks.length, 1);
    assert.equal(answer.checks[0].requiresConfirmation, true);
    assert.deepEqual(answer.gate.removedSteps, []);
    assert.equal(answer.safety.level, 'caution');
    assert.equal(answer.evidence[0].documentCode, 'PROC-DOOR-001');
  });

  test('същата процедура, но още в чернова/след отписване, не отключва стъпката', async () => {
    const deprecated = await w.ownerA1.post(
      `/api/v1/admin/documents/${w.docs.procedure}/deprecate`,
    );
    assert.equal(deprecated.status, 204);
    h.model.plan = (pack) => {
      const a = find(pack, 'MAN-500', 'A');
      assert.ok(a && !find(pack, 'PROC-DOOR-001'));
      return {
        causes: [{ text: 'Contatto', evidenceRefs: [a.ref] }],
        checks: [
          {
            step: 1,
            action: SAFETY,
            expected: 'Chiuso',
            actionClass: 'DIAGNOSTIC',
            evidenceRefs: [a.ref],
          },
        ],
      };
    };
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const answer = answerOf(
      await ask(w.portalAlfa, caseId, 'E37 contatto porta di piano multimetro impianto fermo'),
    );
    assert.deepEqual(answer.checks, []);
    assert.equal(answer.safety.level, 'blocked');
  });
});

describe('AC-07 — контекстът модел / HW / FW се ползва при търсенето', () => {
  test('смяна на фърмуера в контекста сменя съвместимите записи без ново обучение', async () => {
    const caseId = await newCase(w.portalAlfa);
    await ask(w.portalAlfa, caseId, 'Errore E37');
    const patched = await w.portalAlfa.patch(`/api/v1/cases/${caseId}/context`, {
      context: {
        productModel: 'LTX-500',
        hardwareRevision: 'C',
        firmware: '5.1',
        serial: null,
        errorCode: 'E37',
      },
    });
    assert.equal(patched.status, 200);
    await ask(w.portalAlfa, caseId, 'Errore E37');

    const applicable = (pack: PackItem[]) => errorsIn(pack).filter((p) => p.applicable);
    const first = applicable(h.model.packs[0] ?? []);
    const second = applicable(h.model.packs[1] ?? []);
    assert.deepEqual(
      first.map((p) => p.text.includes('versione quattro')),
      [true],
    );
    assert.deepEqual(
      second.map((p) => p.text.includes('versione cinque')),
      [true],
    );
  });

  test('моделът от контекста ограничава търсенето: документ за LTX-900 не влиза в LTX-500', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'E37 ventilatore ZEBRA');
    assert.equal(find(h.model.packs[0] ?? [], 'FAQ-900'), undefined);

    const other = await newCase(w.portalAlfa, {
      context: { productModel: 'LTX-900', hardwareRevision: 'A', firmware: '1.0' },
    });
    await ask(w.portalAlfa, other, 'E37 ventilatore ZEBRA');
    const pack = h.model.packs[1] ?? [];
    assert.ok(find(pack, 'FAQ-900')?.applicable);
    assert.equal(find(pack, 'MAN-500'), undefined);
  });

  test('табло от регистъра презаписва ръчно въведеното (модел, HW, FW идват от базата)', async () => {
    const res = await w.portalAlfa.post('/api/v1/sessions', {
      context: {
        productModel: 'LTX-900',
        hardwareRevision: 'Z',
        firmware: '9.9',
        serial: 'ВЪВЕДЕНО-РЪЧНО',
        errorCode: 'E37',
      },
      deviceSerial: 'SN-ALFA-1',
    });
    assert.equal(res.status, 201);
    assert.deepEqual(
      [
        res.body.case.context.productModel,
        res.body.case.context.hardwareRevision,
        res.body.case.context.firmware,
        res.body.case.context.serial,
      ],
      ['LTX-500', 'B', '4.2', 'SN-ALFA-1'],
    );
  });

  test('непознат продукт → 422, не случай', async () => {
    const res = await w.portalAlfa.post('/api/v1/sessions', {
      context: {
        productModel: 'NEMA-1',
        hardwareRevision: 'A',
        firmware: '1.0',
        serial: null,
        errorCode: null,
      },
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'unknown_product');
  });
});

describe('AC-08 — тикет с автоматично обобщение от сървъра', () => {
  test('обобщението има контекст, предложени проверки, източници и решенията на Gate', async () => {
    h.model.plan = (pack) => {
      const a = find(pack, 'MAN-500', 'A');
      assert.ok(a);
      return {
        causes: [{ text: 'Encoder', evidenceRefs: [a.ref] }],
        checks: [
          {
            step: 1,
            action: 'Leggere il codice errore sul display del quadro.',
            expected: 'E37 visibile',
            actionClass: 'DIAGNOSTIC',
            evidenceRefs: [a.ref],
          },
        ],
        evidenceUsed: [cite(a)],
      };
    };
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'E37 cavo encoder morsetto X3');

    const res = await w.portalAlfa.post('/api/v1/tickets', {
      caseId,
      reason: 'Il problema persiste',
    });
    assert.equal(res.status, 201);
    assert.match(res.body.ticket.number, /^TS-\d{4}-\d{6}$/);
    const s = res.body.ticket.summary;
    assert.equal(s.context.firmware, '4.2');
    assert.equal(s.context.serial, 'SN-ALFA-1');
    assert.equal(s.humanMessages, 1);
    assert.equal(s.aiAnswers, 1);
    assert.equal(s.lastAnswer.checks[0].action, 'Leggere il codice errore sul display del quadro.');
    assert.ok(s.lastAnswer.gateDecisions !== undefined);
    assert.ok(
      s.sources.some(
        (x: { documentCode: string; revision: string; pages: number[] }) =>
          x.documentCode === 'MAN-500' && x.revision === 'A' && x.pages.includes(4),
      ),
    );
    assert.equal(s.knowledgeSnapshots.length, 1);

    const c = await db.case.findUniqueOrThrow({ where: { id: caseId } });
    assert.equal(c.status, 'WAITING_TECHNICIAN');
    assert.equal(c.outcome, 'ESCALATED');
    const stored = await db.ticket.findUniqueOrThrow({ where: { caseId } });
    assert.deepEqual(stored.summary, s);
  });

  test('втори тикет за същия случай → 409; тикет за чужд случай → 404', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    assert.equal(
      (await w.portalAlfa.post('/api/v1/tickets', { caseId, reason: 'Primo' })).status,
      201,
    );
    const again = await w.portalAlfa.post('/api/v1/tickets', { caseId, reason: 'Secondo' });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'ticket_exists');
    const foreign = await w.portalBeta.post('/api/v1/tickets', { caseId, reason: 'Intruso' });
    assert.equal(foreign.status, 404);
  });

  test('тикет и без AI отговор: обобщението е пълно, без lastAnswer', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const res = await w.portalAlfa.post('/api/v1/tickets', {
      caseId,
      reason: 'Subito al supporto',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.ticket.summary.lastAnswer, null);
    assert.equal(res.body.ticket.summary.aiAnswers, 0);
  });
});

describe('AC-10 — публикуване и отписване без преобучение', () => {
  test('нова ревизия: чернова не се вижда; след публикуване е в търсенето, старата е DEPRECATED', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'E37 cavo encoder');
    const before = answerOf(await ask(w.portalAlfa, caseId, 'E37 cavo encoder'));

    const NEW = 'Nuova revisione: il codice E37 indica cavo encoder o schermatura difettosa.';
    const upload = await w.ownerA1.post('/api/v1/admin/documents', {
      code: 'MAN-500',
      title: 'Manuale MAN-500 rev C',
      type: 'MANUAL',
      language: 'it',
      revision: 'C',
      audience: 'PORTAL',
      safetyRelevant: false,
      sourceFilename: 'man500c.pdf',
      supersedesRevision: 'A',
      applicability: [{ productModel: 'LTX-500', fwMin: '4.0', fwMax: '4.9' }],
      pages: [{ page: 4, text: NEW }],
    });
    assert.equal(upload.status, 201);
    const id = upload.body.documentId as string;
    await ask(w.portalAlfa, caseId, 'E37 cavo encoder');
    assert.equal(
      find(h.model.packs.at(-1) ?? [], 'MAN-500', 'C'),
      undefined,
      'чернова не се вижда',
    );

    assert.equal((await w.ownerA1.post(`/api/v1/admin/documents/${id}/submit`)).status, 204);
    await ask(w.portalAlfa, caseId, 'E37 cavo encoder');
    assert.equal(
      find(h.model.packs.at(-1) ?? [], 'MAN-500', 'C'),
      undefined,
      'преглед не се вижда',
    );

    assert.equal((await w.ownerA1.post(`/api/v1/admin/documents/${id}/publish`)).status, 204);
    const after = answerOf(await ask(w.portalAlfa, caseId, 'E37 cavo encoder'));
    const pack = h.model.packs.at(-1) ?? [];
    assert.equal(find(pack, 'MAN-500', 'C')?.applicable, true);
    assert.equal(find(pack, 'MAN-500', 'A'), undefined, 'заменената ревизия е изчезнала');
    assert.notEqual(
      after.knowledgeSnapshotId,
      before.knowledgeSnapshotId,
      'новата версия на знанието',
    );

    const list = await w.ownerA1.get('/api/v1/admin/documents?status=DEPRECATED');
    assert.deepEqual(
      list.body.documents.map((d: { code: string; revision: string }) => `${d.code}@${d.revision}`),
      ['MAN-500@A'],
    );
  });

  test('отписване на документ: изчезва от следващото търсене и от справката за страница', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'E37 cavo encoder');
    assert.ok(find(h.model.packs[0] ?? [], 'MAN-500', 'A'));
    assert.equal(
      (await w.portalAlfa.get(`/api/v1/documents/${w.docs.manFw4}/pages/4`)).status,
      200,
    );

    assert.equal(
      (await w.ownerA1.post(`/api/v1/admin/documents/${w.docs.manFw4}/deprecate`)).status,
      204,
    );

    await ask(w.portalAlfa, caseId, 'E37 cavo encoder');
    assert.equal(find(h.model.packs[1] ?? [], 'MAN-500', 'A'), undefined);
    assert.equal(
      (await w.portalAlfa.get(`/api/v1/documents/${w.docs.manFw4}/pages/4`)).status,
      404,
    );
  });

  test('код за грешка: нова версия със същата валидност отписва старата; отписаният изчезва', async () => {
    const v3 = await publishError(w.ownerA1, {
      code: 'E37',
      title: 'Guasto encoder (rivisto)',
      description: 'Cavo encoder o schermatura difettosa (E37 versione quattro rivista).',
      fwMin: '4.0',
      fwMax: '4.9',
      sourceDocumentId: w.docs.errList,
    });
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'Errore E37');
    const texts = errorsIn(h.model.packs[0] ?? [])
      .filter((p) => p.applicable)
      .map((p) => p.text);
    assert.equal(texts.length, 1);
    assert.match(texts[0] ?? '', /rivista/);

    const statuses = await db.errorCode.findMany({
      where: { id: { in: [w.errors.e37v1, v3] } },
      select: { id: true, status: true },
    });
    assert.deepEqual(Object.fromEntries(statuses.map((s) => [s.id, s.status])), {
      [w.errors.e37v1]: 'DEPRECATED',
      [v3]: 'PUBLISHED',
    });

    assert.equal((await w.ownerA1.post(`/api/v1/admin/errors/${v3}/deprecate`)).status, 204);
    await ask(w.portalAlfa, caseId, 'Errore E37');
    assert.equal(
      errorsIn(h.model.packs[1] ?? []).filter((p) => p.applicable).length,
      0,
      'отписаният запис не се намира',
    );
  });

  test('код не може да се публикува, докато източникът му не е публикуван', async () => {
    const draft = w.docs.draft;
    const created = await w.ownerA1.post('/api/v1/admin/errors', {
      productModel: 'LTX-500',
      code: 'E99',
      title: 'Test',
      description: 'Descrizione di prova',
      severity: 'INFO',
      safetyRelevant: false,
      sourceDocumentId: draft,
      relations: [],
    });
    assert.equal(created.status, 201);
    const res = await w.ownerA1.post(`/api/v1/admin/errors/${created.body.errorId}/publish`);
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'source_not_published');
  });
});

describe('AC-11 + §15 „accessi incrociati“ — изолация между фирми и клиенти', () => {
  test('техник от фирма A не вижда случая на фирма B: 404 навсякъде, не 403', async () => {
    const caseId = await newCase(w.portalBeta, { deviceSerial: 'SN-BETA-1' });
    const intruder = w.portalAlfa;
    const probes = await Promise.all([
      intruder.get(`/api/v1/cases/${caseId}`),
      intruder.get(`/api/v1/cases/${caseId}/timeline`),
      intruder.patch(`/api/v1/cases/${caseId}/context`, {
        context: {
          productModel: 'LTX-500',
          hardwareRevision: 'B',
          firmware: '4.2',
          serial: null,
          errorCode: null,
        },
      }),
      intruder.post(`/api/v1/cases/${caseId}/outcome`, { outcome: 'RESOLVED' }),
      ask(intruder, caseId, 'E37'),
      intruder.post('/api/v1/tickets', { caseId, reason: 'Intruso' }),
    ]);
    assert.deepEqual(
      probes.map((p) => p.status),
      Array(6).fill(404),
    );
    assert.equal(h.model.calls, 0, 'моделът не е викан за чужд случай');
    const list = await intruder.get('/api/v1/cases');
    assert.deepEqual(list.body.cases, []);
    assert.equal(
      await db.caseMessage.count({ where: { caseId } }),
      0,
      'в чуждия случай не е записано нищо',
    );
  });

  test('обратна връзка върху AI отговор от чужд случай → 404', async () => {
    const caseId = await newCase(w.portalBeta, { deviceSerial: 'SN-BETA-1' });
    const res = await ask(w.portalBeta, caseId, 'Errore E37');
    const messageId = res.body.answer.id as string;
    const foreign = await w.portalAlfa.post('/api/v1/feedback', { messageId, rating: 'USEFUL' });
    assert.equal(foreign.status, 404);
    const own = await w.portalBeta.post('/api/v1/feedback', { messageId, rating: 'USEFUL' });
    assert.equal(own.status, 204);
  });

  test('табло на чужда фирма: 404 при справка и при отваряне на случай', async () => {
    assert.equal((await w.portalAlfa.get('/api/v1/devices/SN-BETA-1')).status, 404);
    assert.equal((await w.portalAlfa.get('/api/v1/devices/SN-INT-1')).status, 404, 'без фирма');
    assert.equal((await w.portalAlfa.get('/api/v1/devices/SN-ALFA-1')).status, 200);
    const res = await w.portalAlfa.post('/api/v1/sessions', {
      context: {
        productModel: 'LTX-500',
        hardwareRevision: 'B',
        firmware: '4.2',
        serial: null,
        errorCode: null,
      },
      deviceSerial: 'SN-BETA-1',
    });
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'device_not_found');
    assert.equal(await db.case.count(), 0);
  });

  test('другият клиент (tenant) не вижда нищо: случаи, табла, продукти, кодове, документи', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const b = w.portalB;
    assert.equal((await b.get(`/api/v1/cases/${caseId}`)).status, 404);
    assert.equal((await b.get('/api/v1/devices/SN-ALFA-1')).status, 404);
    assert.equal((await b.get(`/api/v1/documents/${w.docs.manFw4}/pages/4`)).status, 404);
    assert.deepEqual((await b.get('/api/v1/errors/E37?model=LTX-500&hw=B&fw=4.2')).body.errors, []);
    const products = await b.get('/api/v1/products/search?q=LTX');
    assert.equal(products.body.products.length, 1, 'само собствения LTX-500');
    assert.equal(products.body.products[0].revisions[0].fwMax, null);
    // собственото му знание не се смесва с чуждото
    const own = await newCase(b);
    await ask(b, own, 'E37 guasto riservato');
    const pack = h.model.packs[0] ?? [];
    assert.ok(pack.length > 0);
    assert.ok(pack.every((p) => !p.text.includes('encoder') && !p.text.includes('ARCOBALENO')));
    assert.ok(pack.some((p) => p.text.includes('TENANT-B-SECRET')));
  });

  test('администраторът на знанието на друг клиент не може да управлява чужд документ', async () => {
    for (const action of ['submit', 'publish', 'deprecate', 'reject']) {
      const res = await w.ownerB.post(`/api/v1/admin/documents/${w.docs.manFw4}/${action}`);
      assert.equal(res.status, 404, action);
    }
    const list = await w.ownerB.get('/api/v1/admin/documents');
    assert.deepEqual(
      list.body.documents.map((d: { code: string }) => d.code),
      ['MAN-500'],
    );
    const stillPublished = await db.document.findUniqueOrThrow({ where: { id: w.docs.manFw4 } });
    assert.equal(stillPublished.status, 'PUBLISHED');
  });

  test('портален техник не вижда INTERNAL документи; вътрешен — да', async () => {
    assert.equal(
      (await w.portalAlfa.get(`/api/v1/documents/${w.docs.internal}/pages/1`)).status,
      404,
    );
    assert.equal(
      (await w.internal.get(`/api/v1/documents/${w.docs.internal}/pages/1`)).status,
      200,
    );

    const portalCase = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, portalCase, 'E37 procedura ARCOBALENO');
    assert.equal(find(h.model.packs[0] ?? [], 'INT-BULL-001'), undefined);

    const internalCase = await newCase(w.internal, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.internal, internalCase, 'E37 procedura ARCOBALENO');
    assert.ok(find(h.model.packs[1] ?? [], 'INT-BULL-001'));
  });

  test('непубликувани документи (чернова) не се виждат от никого в търсенето', async () => {
    const caseId = await newCase(w.internal, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.internal, caseId, 'documento FENICE bozza');
    const all = (h.model.packs[0] ?? []).map((p) => p.text).join('\n');
    assert.equal(all.includes('FENICE'), false);
    assert.equal((await w.ownerA1.get(`/api/v1/documents/${w.docs.draft}/pages/1`)).status, 404);
  });

  test('поддръжка вижда случаите на цялата организация на клиента (но не на другия клиент)', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    assert.equal((await w.support.get(`/api/v1/cases/${caseId}`)).status, 200);
    assert.equal((await w.support.get('/api/v1/cases')).body.cases.length, 1);
    assert.equal((await w.ownerB.get(`/api/v1/cases/${caseId}`)).status, 404);
  });

  test('одитът е по клиент: администраторът на клиента A вижда само събития на A', async () => {
    await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await newCase(w.ownerB, { deviceSerial: 'SN-B-1' });
    const res = await w.tenantAdmin.get('/api/v1/audit');
    assert.equal(res.status, 200);
    assert.ok(res.body.events.length > 0);
    assert.ok(res.body.events.every((e: { tenantId: string }) => e.tenantId === w.tenantA.id));
    assert.equal((await w.portalAlfa.get('/api/v1/audit')).status, 403);
  });
});

describe('AC-12 — повторно изпращане със същия clientMessageId не дублира', () => {
  test('един човешки и един AI запис, моделът е викан веднъж, отговорът е същият', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const clientMessageId = '3f0c1f0e-7a52-4a76-9d54-0a6c8f0b9e11';
    const first = await ask(w.portalAlfa, caseId, 'Errore E37', { clientMessageId });
    const second = await ask(w.portalAlfa, caseId, 'Errore E37', { clientMessageId });
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.body.message.id, first.body.message.id);
    assert.equal(second.body.answer.id, first.body.answer.id);
    assert.equal(h.model.calls, 1);
    assert.equal(await db.caseMessage.count({ where: { caseId, kind: 'HUMAN' } }), 1);
    assert.equal(await db.caseMessage.count({ where: { caseId, kind: 'AI' } }), 1);
    assert.equal(
      await db.caseEvidence.count({ where: { caseId } }),
      answerOf(first).evidence.length,
    );
  });

  test('различен clientMessageId е ново съобщение; без clientMessageId — също', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'Errore E37', {
      clientMessageId: '3f0c1f0e-7a52-4a76-9d54-0a6c8f0b9e11',
    });
    await ask(w.portalAlfa, caseId, 'Errore E37', {
      clientMessageId: '3f0c1f0e-7a52-4a76-9d54-0a6c8f0b9e12',
    });
    await ask(w.portalAlfa, caseId, 'Errore E37');
    await ask(w.portalAlfa, caseId, 'Errore E37');
    assert.equal(await db.caseMessage.count({ where: { caseId, kind: 'HUMAN' } }), 4);
    assert.equal(h.model.calls, 4);
  });

  test('същият clientMessageId в друг случай е независимо съобщение', async () => {
    const a = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const b = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const clientMessageId = '3f0c1f0e-7a52-4a76-9d54-0a6c8f0b9e11';
    assert.equal((await ask(w.portalAlfa, a, 'Errore E37', { clientMessageId })).status, 201);
    assert.equal((await ask(w.portalAlfa, b, 'Errore E37', { clientMessageId })).status, 201);
  });
});

describe('AC-16 (част) — деактивиран потребител: сесията спира да важи', () => {
  test('деактивиране в базата → следващата заявка с жива бисквитка е 401', async () => {
    assert.equal((await w.portalAlfa.get('/api/v1/auth/me')).status, 200);
    await db.user.update({ where: { id: w.users.portalAlfa.id }, data: { active: false } });
    assert.equal((await w.portalAlfa.get('/api/v1/auth/me')).status, 401);
    assert.equal((await w.portalAlfa.get('/api/v1/cases')).status, 401);
    const res = await w.portalAlfa.post('/api/v1/sessions', {
      context: {
        productModel: 'LTX-500',
        hardwareRevision: 'B',
        firmware: '4.2',
        serial: null,
        errorCode: null,
      },
    });
    assert.equal(res.status, 401);
    assert.equal(await db.case.count(), 0);
  });

  test('изтекъл срок на акаунта и отнета сесия също спират достъпа', async () => {
    await db.user.update({
      where: { id: w.users.internal.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal((await w.internal.get('/api/v1/auth/me')).status, 401);

    assert.equal((await w.support.get('/api/v1/auth/me')).status, 200);
    await db.session.updateMany({
      where: { userId: w.users.support.id },
      data: { revokedAt: new Date() },
    });
    assert.equal((await w.support.get('/api/v1/auth/me')).status, 401);
  });

  test('изход отнема сесията: старата бисквитка вече не важи', async () => {
    assert.equal((await w.portalAlfa.post('/api/v1/auth/logout')).status, 204);
    assert.equal((await w.portalAlfa.get('/api/v1/auth/me')).status, 401);
  });

  test('други потребители не са засегнати от деактивирането', async () => {
    await db.user.update({ where: { id: w.users.portalAlfa.id }, data: { active: false } });
    assert.equal((await w.portalBeta.get('/api/v1/auth/me')).status, 200);
  });
});

describe('AC-18 — портален случай получава само PORTAL доказателства, дори за SUPPORT', () => {
  test('SUPPORT пише в портален случай → INTERNAL документът не стига до модела', async () => {
    const portalCase = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    assert.equal((await db.case.findUniqueOrThrow({ where: { id: portalCase } })).portal, true);
    const res = await ask(w.support, portalCase, 'E37 procedura interna ARCOBALENO');
    assert.equal(res.status, 201);
    const pack = h.model.packs[0] ?? [];
    assert.ok(pack.length > 0);
    assert.equal(find(pack, 'INT-BULL-001'), undefined);
    assert.ok(pack.every((p) => !p.text.includes('ARCOBALENO')));
    assert.equal(
      JSON.stringify(res.body.answer).includes('ARCOBALENO'),
      false,
      'вътрешният текст не е и в отговора',
    );
  });

  test('контрола: същият въпрос в собствен (не портален) случай на SUPPORT вижда вътрешния документ', async () => {
    const own = await newCase(w.support, { deviceSerial: 'SN-ALFA-1' });
    assert.equal((await db.case.findUniqueOrThrow({ where: { id: own } })).portal, false);
    await ask(w.support, own, 'E37 procedura interna ARCOBALENO');
    assert.ok(find(h.model.packs[0] ?? [], 'INT-BULL-001'));
  });

  test('ENGINEERING/KNOWLEDGE_OWNER в портален случай също остават само на PORTAL', async () => {
    const portalCase = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.ownerA1, portalCase, 'E37 procedura interna ARCOBALENO');
    assert.equal(find(h.model.packs[0] ?? [], 'INT-BULL-001'), undefined);
  });
});

describe('AC-19 — хронологията различава човек, AI и система', () => {
  test('събитията носят source = human | ai | system', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'Errore E37');
    await db.caseTimelineEvent.create({
      data: { caseId, type: 'case.autoreminder', actorId: null, payload: {} },
    });
    const res = await w.portalAlfa.get(`/api/v1/cases/${caseId}/timeline`);
    assert.equal(res.status, 200);
    const bySource = new Map<string, string[]>();
    for (const e of res.body.events as Array<{
      type: string;
      source: string;
      actorId: string | null;
    }>) {
      bySource.set(e.source, [...(bySource.get(e.source) ?? []), e.type]);
    }
    assert.ok(bySource.get('human')?.includes('case.created'));
    assert.ok(bySource.get('human')?.includes('message.created'));
    assert.deepEqual(bySource.get('ai'), ['ai.answer']);
    assert.deepEqual(bySource.get('system'), ['case.autoreminder']);
    const aiEvent = res.body.events.find((e: { type: string }) => e.type === 'ai.answer');
    assert.equal(aiEvent.actorId, null);
    assert.equal(aiEvent.payload.evidenceLevel, 'strong');
  });

  test('съобщенията в случая са HUMAN / AI; AI няма автор, човекът има име', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'Errore E37');
    const res = await w.portalAlfa.get(`/api/v1/cases/${caseId}`);
    const kinds = res.body.messages.map((m: { kind: string; authorName: string | null }) => [
      m.kind,
      m.authorName,
    ]);
    assert.deepEqual(kinds, [
      ['HUMAN', 'Tecnico Alfa'],
      ['AI', null],
    ]);
    assert.equal(res.body.messages[1].payload.generatedBy, 'ai');
  });

  test('оператор поема случая: AI → човек, със същата история (assign)', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'Errore E37');
    assert.equal((await w.portalAlfa.post(`/api/v1/cases/${caseId}/assign`)).status, 403);
    const assigned = await w.support.post(`/api/v1/cases/${caseId}/assign`);
    assert.equal(assigned.status, 200);
    assert.equal(assigned.body.case.status, 'IN_PROGRESS');
    const events = (await w.support.get(`/api/v1/cases/${caseId}/timeline`)).body.events;
    const last = events.at(-1);
    assert.deepEqual(
      [last.type, last.source, last.actorId],
      ['case.assigned', 'human', w.users.support.id],
    );
  });
});

describe('Резервираност — AI недостъпен', () => {
  test('човешкото съобщение остава, когато AI е изключен (503 ai_unavailable)', async () => {
    const off = await startApp({ diagnose: 'none' });
    try {
      const c = new Client(off.base, w.portalAlfa.cookie, w.portalAlfa.csrfToken);
      const caseId = await newCase(c, { deviceSerial: 'SN-ALFA-1' });
      const res = await ask(c, caseId, 'Errore E37');
      assert.equal(res.status, 503);
      assert.equal(res.body.code, 'ai_unavailable');
      assert.equal(await db.caseMessage.count({ where: { caseId, kind: 'HUMAN' } }), 1);
      const noAi = await ask(c, caseId, 'Messaggio per l’operatore', { askAi: false });
      assert.equal(noAi.status, 201);
      assert.equal(noAi.body.answer, null);
    } finally {
      await off.close();
    }
  });

  test('срив на модела: 503, случаят се връща в предишния статус, в одита има ai.error', async () => {
    const broken = await startApp({
      diagnose: async () => {
        throw new Error('vertex down');
      },
    });
    try {
      const c = new Client(broken.base, w.portalAlfa.cookie, w.portalAlfa.csrfToken);
      const caseId = await newCase(c, { deviceSerial: 'SN-ALFA-1' });
      const res = await ask(c, caseId, 'Errore E37');
      assert.equal(res.status, 503);
      const stored = await db.case.findUniqueOrThrow({ where: { id: caseId } });
      assert.equal(stored.status, 'OPEN');
      assert.equal(
        await db.auditEvent.count({ where: { action: 'ai.error', objectId: caseId } }),
        1,
      );
      assert.equal(await db.caseMessage.count({ where: { caseId, kind: 'AI' } }), 0);
    } finally {
      await broken.close();
    }
  });
});

describe('Права върху случай: изход, контекст, затваряне', () => {
  test('изход/контекст — само създателят или поелият; други с достъп получават 403', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const ctx = {
      productModel: 'LTX-500',
      hardwareRevision: 'B',
      firmware: '4.2',
      serial: null,
      errorCode: null,
    };
    assert.equal(
      (await w.support.post(`/api/v1/cases/${caseId}/outcome`, { outcome: 'RESOLVED' })).status,
      403,
    );
    assert.equal(
      (await w.support.patch(`/api/v1/cases/${caseId}/context`, { context: ctx })).status,
      403,
    );
    assert.equal((await w.support.post(`/api/v1/cases/${caseId}/assign`)).status, 200);
    assert.equal(
      (await w.support.post(`/api/v1/cases/${caseId}/outcome`, { outcome: 'RESOLVED' })).status,
      200,
    );
  });

  test('затворен случай: повторен изход и тикет → 409', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await w.portalAlfa.post(`/api/v1/cases/${caseId}/outcome`, { outcome: 'RESOLVED' });
    const again = await w.portalAlfa.post(`/api/v1/cases/${caseId}/outcome`, {
      outcome: 'RESOLVED',
    });
    assert.deepEqual([again.status, again.body.code], [409, 'case_closed']);
    assert.equal(
      (await w.portalAlfa.post('/api/v1/tickets', { caseId, reason: 'Troppo tardi' })).status,
      409,
    );
  });

  test('личните данни в свободния текст се маскират преди запис', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'Errore E37, chiamare mario.rossi@example.com', {
      askAi: false,
    });
    const m = await db.caseMessage.findFirstOrThrow({ where: { caseId, kind: 'HUMAN' } });
    assert.equal(m.body.includes('mario.rossi@example.com'), false);
  });
});
