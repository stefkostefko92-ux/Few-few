import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  fieldDiffs,
  lineDiff,
  pageDiffs,
  ruleKey,
  setDiff,
  splitLines,
} from '../src/services/doc-compare.js';
import {
  ApplicabilityInputSchema,
  DocumentRequestSchema,
  effectiveRangeOk,
} from '../src/services/document-meta.js';
import {
  errorIsSafetyRelevant,
  fourEyesBlocked,
  ReasonBody,
  rejectTarget,
  withAuthor,
} from '../src/services/kb-lifecycle.js';

/**
 * Жизненият цикъл на знанието без база: задължителните метаданни (§7.2 — изричен фърмуер, дати
 * на валидност, табло), правилата на четирите очи и връщането, сравнението на ревизии (§4.1).
 */

const rule = (over: object) =>
  ApplicabilityInputSchema.safeParse({ productModel: 'LTX-500', ...over });

describe('метаданни §7.2: фърмуерът е изричен, датите — смислени', () => {
  test('правило без фърмуер се отказва; „всички версии“ или обхват минава', () => {
    assert.equal(rule({}).success, false, 'мълчалив null не минава');
    assert.equal(rule({ allFirmware: true }).success, true);
    assert.equal(rule({ fwMin: '4.0' }).success, true);
    assert.equal(rule({ fwMax: '4.9' }).success, true);
    assert.equal(
      rule({ allFirmware: true, fwMin: '4.0' }).success,
      false,
      'и двете — противоречие',
    );
    assert.equal(rule({ allFirmware: false }).success, false);
    assert.equal(rule({ fwMin: '5.0', fwMax: '4.9' }).success, false, 'обратен обхват');
    assert.equal(rule({ fwMin: 'beta' }).success, false);
  });

  test('табло по сериен номер е по избор; празен низ не е табло', () => {
    assert.equal(rule({ allFirmware: true, deviceSerial: 'SN-1' }).success, true);
    assert.equal(rule({ allFirmware: true, deviceSerial: '' }).success, false);
  });

  test('effectiveFrom е задължителен; effectiveTo — след него', () => {
    const base = {
      code: 'MAN-1',
      title: 'Manuale',
      type: 'MANUAL',
      language: 'it',
      revision: 'A',
      audience: 'PORTAL',
      safetyRelevant: false,
      sourceFilename: 'm.pdf',
      applicability: [{ productModel: 'LTX-500', allFirmware: true }],
      pages: [{ page: 1, text: 'Testo' }],
    };
    assert.equal(DocumentRequestSchema.safeParse(base).success, false, 'без effectiveFrom');
    const from = '2026-01-01T00:00:00.000Z';
    assert.equal(DocumentRequestSchema.safeParse({ ...base, effectiveFrom: from }).success, true);
    const backwards = DocumentRequestSchema.safeParse({
      ...base,
      effectiveFrom: from,
      effectiveTo: '2025-12-31T00:00:00.000Z',
    });
    assert.equal(backwards.success, false);
    assert.deepEqual(
      backwards.error?.issues.map((i) => i.path.join('.')),
      ['effectiveTo'],
    );
    const d = new Date(from);
    assert.equal(effectiveRangeOk({ effectiveFrom: d }), true);
    assert.equal(effectiveRangeOk({ effectiveFrom: d, effectiveTo: d }), false, 'празен прозорец');
    assert.equal(
      effectiveRangeOk({ effectiveFrom: d, effectiveTo: new Date(d.getTime() + 1) }),
      true,
    );
  });
});

describe('четири очи, автори, връщане', () => {
  test('публикуващият не е сред подготвилите (null не брои)', () => {
    assert.equal(fourEyesBlocked('u1', ['u1', null]), true);
    assert.equal(fourEyesBlocked('u2', ['u1', null, undefined]), false);
    assert.equal(fourEyesBlocked('u2', []), false);
  });

  test('авторите се трупат без повторения и подредени', () => {
    assert.deepEqual(withAuthor(['b', 'a'], 'a'), ['a', 'b']);
    assert.deepEqual(withAuthor([], 'c'), ['c']);
  });

  test('код по безопасност: флагът или проверка SAFETY_RELEVANT/DIRECT_COMMAND', () => {
    const r = (actionClass: string) => ({ actionClass });
    assert.equal(errorIsSafetyRelevant({ safetyRelevant: true, relations: [] }), true);
    assert.equal(
      errorIsSafetyRelevant({ safetyRelevant: false, relations: [r('DIAGNOSTIC')] }),
      false,
    );
    assert.equal(
      errorIsSafetyRelevant({ safetyRelevant: false, relations: [r('SAFETY_RELEVANT')] }),
      true,
    );
    assert.equal(
      errorIsSafetyRelevant({ safetyRelevant: false, relations: [r('DIRECT_COMMAND')] }),
      true,
    );
  });

  test('отхвърлено: никога публикуваното → чернова; възстановеното → обратно отписано', () => {
    assert.equal(rejectTarget(false), 'DRAFT');
    assert.equal(rejectTarget(true), 'DEPRECATED');
  });

  test('причината е задължителна (3–500 знака), без други полета', () => {
    assert.equal(ReasonBody.safeParse({}).success, false);
    assert.equal(ReasonBody.safeParse({ reason: 'ok' }).success, false);
    assert.equal(ReasonBody.safeParse({ reason: 'Ritirato' }).success, true);
    assert.equal(ReasonBody.safeParse({ reason: 'Ritirato', status: 'PUBLISHED' }).success, false);
    assert.equal(ReasonBody.safeParse({ reason: 'x'.repeat(501) }).success, false);
  });
});

describe('сравнение на ревизии (§4.1)', () => {
  test('редовата разлика пази реда: махнатото, добавеното, общото', () => {
    assert.deepEqual(lineDiff(['a', 'b', 'c'], ['a', 'x', 'c']), [
      { op: '=', text: 'a' },
      { op: '-', text: 'b' },
      { op: '+', text: 'x' },
      { op: '=', text: 'c' },
    ]);
    assert.deepEqual(lineDiff([], ['n']), [{ op: '+', text: 'n' }]);
    assert.deepEqual(lineDiff(['o'], []), [{ op: '-', text: 'o' }]);
  });

  test('огромна страница → null (таван), вместо да блокира сървъра', () => {
    const big = Array.from({ length: 1000 }, (_, i) => `riga ${i}`);
    assert.equal(lineDiff(big, [...big].reverse()), null);
  });

  test('редовете: празните и интервалите не са разлика', () => {
    assert.deepEqual(splitLines('  Uno   due \n\n\ntre  '), ['Uno due', 'tre']);
  });

  test('страниците: еднаква / променена / нова / липсваща', () => {
    const diff = pageDiffs(
      [
        { page: 1, text: 'Uguale' },
        { page: 2, text: 'Morsetto X3' },
        { page: 3, text: 'Solo in A' },
      ],
      [
        { page: 1, text: 'Uguale' },
        { page: 2, text: 'Morsetto X5' },
        { page: 4, text: 'Solo in B' },
      ],
    );
    assert.deepEqual(
      diff.map((p) => [p.page, p.status]),
      [
        [1, 'same'],
        [2, 'changed'],
        [3, 'removed'],
        [4, 'added'],
      ],
    );
    assert.equal(diff[0]?.lines, undefined);
    assert.deepEqual(diff[1]?.lines, [
      { op: '-', text: 'Morsetto X3' },
      { op: '+', text: 'Morsetto X5' },
    ]);
  });

  test('множества и полета: само в A, само в B, общо; датите като ISO', () => {
    assert.deepEqual(setDiff(['K1', 'X3'], ['X3', 'X5']), {
      onlyA: ['K1'],
      onlyB: ['X5'],
      both: ['X3'],
    });
    const d1 = new Date('2026-01-01T00:00:00.000Z');
    const d2 = new Date('2026-02-01T00:00:00.000Z');
    assert.deepEqual(
      fieldDiffs({ a: 1, from: d1, same: 'x' }, { a: 2, from: d2, same: 'x' }, [
        'a',
        'from',
        'same',
      ]),
      [
        { field: 'a', a: 1, b: 2 },
        { field: 'from', a: d1.toISOString(), b: d2.toISOString() },
      ],
    );
  });

  test('правилото като ключ: изричният фърмуер и таблото се различават', () => {
    const base = {
      productModel: 'LTX-500',
      hwRevision: null,
      fwMin: null,
      fwMax: null,
      allFirmware: true,
      deviceSerial: null,
    };
    assert.notEqual(ruleKey(base), ruleKey({ ...base, deviceSerial: 'SN-1' }));
    assert.notEqual(ruleKey(base), ruleKey({ ...base, allFirmware: false, fwMin: '4.0' }));
    assert.equal(ruleKey(base), ruleKey({ ...base }));
  });
});

describe('кодовете на жизнения цикъл в отговора имат превод (bg/it/en)', () => {
  test('code.kb.* — табло и валидност', () => {
    for (const lang of ['bg', 'it', 'en']) {
      const dict = JSON.parse(
        readFileSync(join(import.meta.dirname, '..', 'public', 'i18n', `${lang}.json`), 'utf8'),
      ) as Record<string, string>;
      for (const key of ['boardSerialRequired', 'sourceExpired', 'sourceNotYetEffective']) {
        assert.ok(dict[`code.kb.${key}`], `${lang}: code.kb.${key}`);
      }
      assert.match(dict['code.kb.sourceExpired'] ?? '', /\{param\}/);
    }
  });
});
