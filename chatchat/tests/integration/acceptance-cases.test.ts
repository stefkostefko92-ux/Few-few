import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { PROMPT_VERSION } from '../../src/ai/prompt.js';
import { GATE_VERSION } from '../../src/safety/gate.js';
import { MAGIC } from '../file-fixtures.js';
import { cite, db, makeUser, resetDb, signIn, startApp, type Harness } from './helpers.js';
import { cleanUpload, FakeScanner, signedUrl, SpyStore, URL_KEY } from './files.js';
import { answerOf, ask, newCase, publishDoc, seedWorld, TEXT, type World } from './world.js';

/**
 * Критерии за приемане върху случаите (docs/acceptance.md): AC-09 (версии на всеки AI отговор),
 * AC-12 (повторно изпращане), AC-14 (предаване AI → оператор), AC-18 (аудитории на отговора) и
 * AC-19 (хронология с час и автор). Допълват api.test.ts — не го повтарят.
 */

let h: Harness;
let w: World;
const store = new SpyStore();
const scanner = new FakeScanner();

before(async () => {
  h = await startApp({ attachments: { store, scanner, urlKey: URL_KEY } });
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  store.reset();
  scanner.mode = 'auto';
  h.model.reset();
  w = await seedWorld(h);
});

describe('AC-09 — всеки AI отговор носи версията на промпта, правилата и знанието', () => {
  test('отговор с доказателства и отговор „не е определено“: колона, payload и одит са едно и също', async () => {
    const full = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const withEvidence = await ask(w.portalAlfa, full, 'E37 cavo encoder morsetto X3');
    const empty = await newCase(w.portalAlfa, { deviceSerial: 'SN-ZZ-1' });
    const noEvidence = await ask(w.portalAlfa, empty, 'Errore E37 durante la corsa');
    assert.equal(h.model.calls, 1, 'вторият отговор е без модел');

    const expected = `${PROMPT_VERSION}+${GATE_VERSION}`;
    for (const res of [withEvidence, noEvidence]) {
      const payload = answerOf(res);
      const row = await db.caseMessage.findUniqueOrThrow({ where: { id: res.body.answer.id } });
      assert.equal(row.promptVersion, expected);
      assert.equal(payload.promptVersion, expected);
      assert.match(row.knowledgeSnapshotId ?? '', /^ks_[0-9a-f]{32}$/);
      assert.equal(payload.knowledgeSnapshotId, row.knowledgeSnapshotId);
      const audit = await db.auditEvent.findFirstOrThrow({
        where: { action: 'ai.answer', objectId: row.id },
      });
      const detail = audit.detail as { promptVersion: string; knowledgeSnapshotId: string };
      assert.equal(detail.promptVersion, expected);
      assert.equal(detail.knowledgeSnapshotId, row.knowledgeSnapshotId);
    }
  });

  test('снимката сочи манифест с точно публикуваните документи и кодове; чернова не влиза', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const res = await ask(w.portalAlfa, caseId, 'E37');
    const snap = await db.knowledgeSnapshot.findUniqueOrThrow({
      where: { id: answerOf(res).knowledgeSnapshotId },
    });
    const manifest = snap.manifest as {
      documents: Array<{ id: string }>;
      errors: Array<{ id: string }>;
    };
    const docs = manifest.documents.map((d) => d.id);
    assert.ok(docs.includes(w.docs.manFw4) && docs.includes(w.docs.manFw5));
    assert.equal(docs.includes(w.docs.draft), false);
    assert.equal(docs.includes(w.docs.tenantB), false, 'документ на друг клиент');
    assert.ok(manifest.errors.some((e) => e.id === w.errors.e37v1));
  });

  test('обобщението на тикета пази версията на последния AI отговор (AI Act чл. 50)', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'E37');
    const t = await w.portalAlfa.post('/api/v1/tickets', { caseId, reason: 'Serve il supporto' });
    assert.equal(
      t.body.ticket.summary.lastAnswer.promptVersion,
      `${PROMPT_VERSION}+${GATE_VERSION}`,
    );
    assert.equal(t.body.ticket.summary.lastAnswer.generatedBy, 'ai');
  });
});

describe('AC-12 — повторно изпращане: отговорът е на самото съобщение', () => {
  test('повтор на съобщение без AI не взема по-късен чужд отговор и не вика модела', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const note = '3f0c1f0e-7a52-4a76-9d54-0a6c8f0b9e21';
    const question = '3f0c1f0e-7a52-4a76-9d54-0a6c8f0b9e22';
    const first = await ask(w.portalAlfa, caseId, 'Nota per l’operatore', {
      clientMessageId: note,
      askAi: false,
    });
    assert.equal(first.status, 201);
    const asked = await ask(w.portalAlfa, caseId, 'Errore E37', { clientMessageId: question });
    assert.ok(asked.body.answer);

    const retryNote = await ask(w.portalAlfa, caseId, 'Nota per l’operatore', {
      clientMessageId: note,
      askAi: false,
    });
    assert.equal(retryNote.status, 200);
    assert.equal(retryNote.body.message.id, first.body.message.id);
    assert.equal(retryNote.body.answer, null, 'бележката няма отговор на AI');
    const retryQuestion = await ask(w.portalAlfa, caseId, 'Errore E37', {
      clientMessageId: question,
    });
    assert.equal(retryQuestion.body.answer.id, asked.body.answer.id);
    assert.equal(h.model.calls, 1);
    assert.equal(await db.caseMessage.count({ where: { caseId, kind: 'HUMAN' } }), 2);
  });
});

describe('AC-14 — предаване AI → оператор без повторно въвеждане', () => {
  test('поемане: операторът получава контекст, отговор с източници и проверки, файлове и може да ги свали', async () => {
    h.model.plan = (pack) => {
      const a = pack.find((p) => p.documentCode === 'MAN-500' && p.revision === 'A');
      assert.ok(a);
      return {
        summary: 'Encoder scollegato.',
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
    const photo = await cleanUpload(w.portalAlfa, caseId, 'PHOTO', MAGIC.jpeg, 'display.jpg');
    const log = await cleanUpload(w.portalAlfa, caseId, 'LOG', Buffer.from('E37 10:01\n'), 'a.log');
    // Качен, но непривързан към съобщение файл не е част от предаването.
    await cleanUpload(w.portalAlfa, caseId, 'LOG', Buffer.from('non usato\n'), 's.log');
    await ask(w.portalAlfa, caseId, 'E37 cavo encoder morsetto X3', {
      attachmentIds: [photo, log],
    });
    const ticket = await w.portalAlfa.post('/api/v1/tickets', { caseId, reason: 'Non si risolve' });
    assert.equal(ticket.status, 201);

    // Операторът поема — и вижда всичко от случая, без да пита техника за нищо.
    assert.equal((await w.support.post(`/api/v1/cases/${caseId}/assign`)).status, 200);
    const view = await w.support.get(`/api/v1/cases/${caseId}`);
    assert.equal(view.body.case.context.firmware, '4.2');
    assert.equal(view.body.case.context.serial, 'SN-ALFA-1');
    assert.equal(view.body.ticket.number, ticket.body.ticket.number);
    const [human, ai] = view.body.messages;
    assert.deepEqual(
      human.attachments.map((a: { id: string }) => a.id),
      [photo, log],
    );
    assert.equal(ai.payload.checks[0].action, 'Leggere il codice errore sul display del quadro.');
    assert.equal(ai.payload.summary, 'Encoder scollegato.');
    assert.ok(
      ai.payload.evidence.some(
        (e: { documentCode: string; revision: string; page: number; quote: string }) =>
          e.documentCode === 'MAN-500' && e.revision === 'A' && e.page === 4 && e.quote !== '',
      ),
    );
    const file = await w.support.download(await signedUrl(w.support, photo));
    assert.equal(file.status, 200);
    assert.ok(file.bytes.equals(MAGIC.jpeg));

    // Обобщението на тикета носи същите файлове (само описание, без байтове и без адреси).
    const summary = ticket.body.ticket.summary;
    assert.deepEqual(
      summary.attachments.map((a: { id: string }) => a.id),
      [photo, log],
    );
    assert.deepEqual(Object.keys(summary.attachments[0]).sort(), [
      'id',
      'kind',
      'mime',
      'originalName',
    ]);
    assert.equal(summary.lastAnswer.checks[0].step, 1);
    assert.ok(summary.sources.some((s: { documentCode: string }) => s.documentCode === 'MAN-500'));
    const stored = await db.ticket.findUniqueOrThrow({ where: { caseId } });
    assert.deepEqual(stored.summary, summary);
  });

  test('обобщението не включва заразен файл, файл без съобщение и файл от друг случай', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const other = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const bound = await cleanUpload(w.portalAlfa, caseId, 'LOG', Buffer.from('uno\n'), 'uno.log');
    await ask(w.portalAlfa, caseId, 'Log allegato', { askAi: false, attachmentIds: [bound] });
    await cleanUpload(w.portalAlfa, caseId, 'LOG', Buffer.from('libero\n'), 'libero.log');
    const foreign = await cleanUpload(w.portalAlfa, other, 'LOG', Buffer.from('due\n'), 'due.log');
    await ask(w.portalAlfa, other, 'Log altro caso', { askAi: false, attachmentIds: [foreign] });
    await db.attachment.updateMany({ where: { id: foreign }, data: { scanStatus: 'INFECTED' } });

    const t = await w.portalAlfa.post('/api/v1/tickets', { caseId, reason: 'Serve il supporto' });
    assert.deepEqual(
      t.body.ticket.summary.attachments.map((a: { id: string }) => a.id),
      [bound],
    );
  });

  test('оператор пита в поетия случай без контекст: търсенето ползва модела и фърмуера на случая', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'Errore E37');
    await w.support.post(`/api/v1/cases/${caseId}/assign`);
    h.model.reset();
    const res = await ask(w.support, caseId, 'e adesso?');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const pack = h.model.packs[0] ?? [];
    assert.ok(pack.some((p) => p.documentCode === 'MAN-500' && p.revision === 'A' && p.applicable));
    assert.equal(
      pack.some((p) => p.documentCode === 'MAN-500' && p.revision === 'B' && p.applicable),
      false,
    );
  });
});

describe('AC-18 — AI отговорът не излиза извън аудиторията на читателя', () => {
  test('отговор, търсен с аудитория ENGINEERING, е „задържан“ за поддръжката и излиза за инженера', async () => {
    const engineer = await makeUser({ tenantId: w.tenantA.id, role: 'ENGINEERING', name: 'Enzo' });
    const eng = await signIn(h, engineer);
    await publishDoc(w.ownerA1, {
      code: 'ENG-NOTE-001',
      type: 'BULLETIN',
      audience: 'ENGINEERING',
      pages: [
        { page: 1, text: 'Nota ingegneria: per E37 usare il banco prova ZAFFIRO riservato.' },
      ],
    });
    h.model.plan = (pack) => {
      const a = pack.find((p) => p.documentCode === 'ENG-NOTE-001');
      assert.ok(a, 'документът за инженеринг е в пакета на инженера');
      return {
        summary: 'Usare il banco ZAFFIRO.',
        causes: [{ text: 'Banco', evidenceRefs: [a.ref] }],
        evidenceUsed: [cite(a)],
      };
    };
    const caseId = await newCase(eng, { deviceSerial: 'SN-ALFA-1' });
    const own = await ask(eng, caseId, 'E37 banco prova ZAFFIRO');
    assert.equal(own.status, 201, JSON.stringify(own.body));
    assert.equal(own.body.answer.body, 'Usare il banco ZAFFIRO.');

    // Колегата с по-малко аудитории вижда кода, не съдържанието — на всички пътища.
    const view = await w.support.get(`/api/v1/cases/${caseId}`);
    const aiMessage = view.body.messages.find((m: { kind: string }) => m.kind === 'AI');
    assert.equal(aiMessage.body, 'gate.audienceWithheld');
    assert.equal(aiMessage.payload, null);
    assert.equal(JSON.stringify(view.body).includes('ZAFFIRO'), true, 'само в човешкия въпрос');
    assert.equal(JSON.stringify(aiMessage).includes('ENG-NOTE-001'), false);
    const engineerView = await eng.get(`/api/v1/cases/${caseId}`);
    assert.equal(engineerView.body.messages[1].body, 'Usare il banco ZAFFIRO.');

    // Обобщението на тикета от колегата също не го разширява.
    const ticket = await w.support.post('/api/v1/tickets', { caseId, reason: 'Serve il tecnico' });
    assert.equal(ticket.body.ticket.summary.aiAnswers, 0);
    assert.equal(JSON.stringify(ticket.body).includes('ENG-NOTE-001'), false);

    // Следващ въпрос на поддръжката: историята към модела е без отговора, който тя не вижда.
    const seen: string[] = [];
    const original = h.model.create.bind(h.model);
    h.model.create = async (params) => {
      seen.push(JSON.stringify(params.messages));
      return original(params);
    };
    try {
      h.model.plan = () => ({});
      const follow = await ask(w.support, caseId, 'E37 cosa si fa?');
      assert.equal(follow.status, 201, JSON.stringify(follow.body));
    } finally {
      h.model.create = original;
    }
    assert.ok(seen.length >= 1);
    assert.equal(seen.join('\n').includes('Usare il banco ZAFFIRO'), false);
    assert.equal(seen.join('\n').includes('ENG-NOTE-001'), false);
    assert.equal(TEXT.internal.includes('ZAFFIRO'), false);
  });
});

describe('AC-19 — хронологията различава човек, AI, система и източници, с час и автор', () => {
  test('един случай: човек, AI, система (фърмуер извън ревизията), оператор, тикет — с час и автор', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'Errore E37');
    const patched = await w.portalAlfa.patch(`/api/v1/cases/${caseId}/context`, {
      context: {
        productModel: 'LTX-500',
        hardwareRevision: 'B',
        firmware: '5.5',
        serial: 'SN-ALFA-1',
        errorCode: 'E37',
      },
    });
    assert.equal(patched.status, 200);
    assert.deepEqual(patched.body.warnings, ['ctx.firmwareOutsideRevision']);
    await w.support.post(`/api/v1/cases/${caseId}/assign`);
    await w.support.post('/api/v1/tickets', { caseId, reason: 'Serve il tecnico' });

    for (const reader of [w.portalAlfa, w.support]) {
      const { events } = (await reader.get(`/api/v1/cases/${caseId}/timeline`)).body as {
        events: Array<{ type: string; source: string; actorId: string | null; at: string }>;
      };
      const times = events.map((e) => Date.parse(e.at));
      assert.ok(
        times.every((t) => !Number.isNaN(t)),
        'всяко събитие има час',
      );
      assert.deepEqual(
        times,
        [...times].sort((a, b) => a - b),
        'подредба по час',
      );
      const by = (type: string) => events.find((e) => e.type === type);
      assert.deepEqual(
        [by('case.created')?.source, by('case.created')?.actorId],
        ['human', w.users.portalAlfa.id],
      );
      assert.deepEqual([by('ai.answer')?.source, by('ai.answer')?.actorId], ['ai', null]);
      assert.deepEqual(
        [
          by('context.firmwareOutsideRevision')?.source,
          by('context.firmwareOutsideRevision')?.actorId,
        ],
        ['system', null],
      );
      assert.deepEqual(
        [by('case.assigned')?.source, by('case.assigned')?.actorId],
        ['human', w.users.support.id],
      );
      assert.deepEqual(
        [by('ticket.created')?.source, by('ticket.created')?.actorId],
        ['human', w.users.support.id],
      );
    }
  });

  test('съобщенията: човек с автор, AI без автор и с техническите източници (документ, ревизия, страница, цитат)', async () => {
    h.model.plan = (pack) => {
      const a = pack.find((p) => p.documentCode === 'MAN-500' && p.revision === 'A');
      assert.ok(a);
      return { causes: [{ text: 'Encoder', evidenceRefs: [a.ref] }], evidenceUsed: [cite(a)] };
    };
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'E37 cavo encoder morsetto X3');
    await ask(w.support, caseId, 'Ho controllato anch’io', { askAi: false });

    const portal = (await w.portalAlfa.get(`/api/v1/cases/${caseId}`)).body.messages;
    const staff = (await w.support.get(`/api/v1/cases/${caseId}`)).body.messages;
    for (const messages of [portal, staff]) {
      assert.deepEqual(
        messages.map((m: { kind: string }) => m.kind),
        ['HUMAN', 'AI', 'HUMAN'],
      );
      assert.ok(
        messages.every((m: { createdAt: string }) => !Number.isNaN(Date.parse(m.createdAt))),
      );
      assert.equal(messages[1].authorName, null);
      assert.equal(messages[1].payload.generatedBy, 'ai');
      const source = messages[1].payload.evidence[0];
      assert.equal(source.documentCode, 'MAN-500');
      assert.equal(source.revision, 'A');
      assert.equal(source.page, 4);
      assert.equal(source.quote, TEXT.manualFw4);
    }
    // Порталът вижда РОЛЯТА на служителя, не името; операторът — собственото си име.
    assert.deepEqual([portal[2].authorName, portal[2].authorRole], [null, 'SUPPORT']);
    assert.deepEqual([staff[2].authorName, staff[2].authorRole], ['Supporto', null]);
    assert.equal(portal[0].authorName, 'Tecnico Alfa');
  });
});
