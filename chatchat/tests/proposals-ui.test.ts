import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DiagnosticContextSchema } from '../src/domain/context.js';
import { conflictPayload } from '../src/services/proposals/conflicts.js';
import { wantsProposal } from '../src/services/proposals/feedback.js';
import { solvedCasePages } from '../src/services/proposals/solved-case-text.js';
import { orderMissing } from '../src/safety/missing-order.js';
import type { EvidenceItem } from '../src/retrieval/types.js';

/**
 * FR-10/§11.3 без база: кога обратната връзка става предложение, подписът на конфликта,
 * анонимизираното резюме на решен случай; FR-07: полетата в UI следват реда на сървъра.
 */

interface Field {
  kind: string;
  codes: string[];
}
type FieldsModule = {
  fieldsFor: (items: string[]) => Field[];
  kindOf: (item: string) => string;
};
const loadFields = async (): Promise<FieldsModule> =>
  (await import(
    new URL('../public/app/answer/missing-fields.js', import.meta.url).href
  )) as FieldsModule;

describe('обратна връзка → предложение', () => {
  test('само „не е полезен“/„техническа грешка“ с непразен коментар', () => {
    assert.equal(wantsProposal('NOT_USEFUL', 'manca un passo'), true);
    assert.equal(wantsProposal('TECHNICAL_ERROR', 'valore errato'), true);
    assert.equal(wantsProposal('USEFUL', 'ottimo'), false);
    assert.equal(wantsProposal('NOT_USEFUL', null), false);
    assert.equal(wantsProposal('NOT_USEFUL', '   '), false);
  });
});

describe('подписът на конфликта', () => {
  const item = (ref: string, over: Partial<EvidenceItem>): EvidenceItem => ({
    ref,
    kind: 'document',
    documentId: `d-${ref}`,
    documentCode: 'MAN-1',
    documentTitle: 'Manuale',
    documentType: 'MANUAL',
    revision: 'A',
    language: 'it',
    page: 1,
    section: null,
    text: 'testo',
    safetyRelevant: false,
    applicable: true,
    matchedBy: ['exact_ref'],
    score: 0.8,
    chunkId: `c-${ref}`,
    errorId: null,
    errorCode: null,
    checks: [],
    ...over,
  });

  test('системен конфликт → обекти без текст; един и същ подпис независимо от реда', () => {
    const a = item('E1', { revision: 'A', documentId: 'dA' });
    const b = item('E2', { revision: 'B', documentId: 'dB' });
    const one = conflictPayload({ description: 'revision:MAN-1', refs: ['E1', 'E2'] }, [a, b]);
    const two = conflictPayload({ description: 'revision:MAN-1', refs: ['E2', 'E1'] }, [b, a]);
    assert.ok(one && two);
    assert.equal(one.dedupeKey, two.dedupeKey);
    assert.deepEqual(
      one.payload.items.map((i) => i.revision),
      ['A', 'B'],
    );
    assert.equal(JSON.stringify(one.payload).includes('testo'), false, 'без текст от документа');
  });

  test('конфликт на модела (свободен текст) или с по-малко от два източника → нищо', () => {
    const a = item('E1', {});
    assert.equal(conflictPayload({ description: 'Le fonti divergono', refs: ['E1'] }, [a]), null);
    assert.equal(conflictPayload({ description: 'revision:MAN-1', refs: ['E1', 'E9'] }, [a]), null);
  });
});

describe('резюме на решен случай', () => {
  test('анонимизирано: без сериен номер, с маскиран телефон, стъпките и решението', () => {
    const pages = solvedCasePages({
      context: DiagnosticContextSchema.parse({
        productModel: 'LTX-500',
        hardwareRevision: 'B',
        firmware: '4.2',
        serial: 'SN-SEGRETO-1',
        errorCode: 'E37',
        symptoms: ['Si ferma, chiamare 3331234567'],
        options: { inverter: 'VF-3' },
      }),
      steps: [{ step: 1, action: 'Verificare X3', expected: 'Cavo collegato', result: 'KO' }],
      rootCause: 'Connettore ossidato',
      solution: 'Sostituito il connettore, scrivere a tecnico@example.com',
      language: 'it',
    });
    const text = pages.map((p) => `${p.section}\n${p.text}`).join('\n');
    assert.equal(pages.length, 4);
    assert.equal(text.includes('SN-SEGRETO-1'), false);
    assert.equal(text.includes('3331234567'), false);
    assert.equal(text.includes('tecnico@example.com'), false);
    assert.match(text, /1\. Verificare X3 \(atteso: Cavo collegato\) — esito: KO/);
    assert.match(text, /Opzioni: inverter=VF-3/);
    assert.match(text, /Soluzione: Sostituito il connettore/);
  });

  test('без стъпки — изрично; заглавията на езика на документа', () => {
    const pages = solvedCasePages({
      context: DiagnosticContextSchema.parse({
        productModel: 'LTX-500',
        hardwareRevision: null,
        firmware: null,
        serial: null,
        errorCode: null,
      }),
      steps: [],
      rootCause: null,
      solution: 'Reset eseguito',
      language: 'bg',
    });
    assert.equal(pages[0]?.section, 'Контекст на таблото');
    assert.match(pages[2]?.text ?? '', /няма записани стъпки/);
  });
});

describe('липсващите данни в UI следват реда на сървъра (FR-07)', () => {
  test('видовете полета са в реда на диагностичната стойност', async () => {
    const { fieldsFor } = await loadFields();
    const server = orderMissing([
      'Misura la tensione su X3',
      'collect.checksDone',
      'collect.eventLog',
      'collect.displayPhoto',
      'ctx.photoCodeMismatch:E38',
      'ctx.hardwareRevision',
      'collect.firmware',
      'ctx.firmware',
      'collect.serial',
      'gate.noApplicableSource',
    ]);
    assert.deepEqual(
      fieldsFor(server).map((f) => f.kind),
      [
        'serial',
        'firmware',
        'hardwareRevision',
        'errorCode',
        'photo',
        'log',
        'checks',
        'answer',
        'note',
      ],
    );
    const fw = fieldsFor(server).find((f) => f.kind === 'firmware');
    assert.deepEqual(fw?.codes, ['collect.firmware', 'ctx.firmware'], 'един вид → едно поле');
  });

  test('непознат код не става въпрос; свободният текст — кратък отговор', async () => {
    const { kindOf } = await loadFields();
    assert.equal(kindOf('ctx.somethingNew'), 'note');
    assert.equal(kindOf('kb.boardSerialRequired'), 'note');
    assert.equal(kindOf('Foto della targhetta'), 'answer');
    assert.equal(kindOf('collect.logExcerpt'), 'log');
  });
});
