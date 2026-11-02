import { answered, IDRAULICO, no, yes } from './field-conditions.js';
import type { SectionDef } from './field-types.js';

/**
 * Разделът „Centralina“ на картата (част от списъка в fields.ts) — при хидравлична уредба, на мястото на
 * аргано и ограничителя. От 21 октомври 2026 (собственикът) — само „Centralina da sostituire?“ (колоната
 * е `centralinaDaFare` отпреди), марката и моделът при всеки отговор; при „No“ — „Emendamento A3 da
 * installare“, а при неговото „Sì“ — гъвкава тръба за монтиране (диаметър, дължина, бележки).
 * Бележките на раздела — винаги. Махнатите данни за централата (задвижване, бутала, налягане, масло…)
 * остават в колоните си със старите отговори — проверката не ги чете, записът не ги пипа.
 */
export const SEZIONE_CENTRALINA = {
  key: 'centralina',
  when: IDRAULICO,
  fields: [
    { key: 'centralinaDaFare', kind: 'yesno', wide: true, question: true },
    { key: 'centralinaMarca', kind: 'text', maxLength: 120, when: answered('centralinaDaFare') },
    { key: 'emendamentoA3', kind: 'yesno', when: no('centralinaDaFare') },
    { key: 'tuboFlessibile', kind: 'yesno', when: yes('emendamentoA3') },
    {
      key: 'tuboFlessibileDiametroMm',
      kind: 'decimal',
      min: 0,
      max: 1_000,
      unit: 'mm',
      when: yes('tuboFlessibile'),
    },
    {
      key: 'tuboFlessibileLunghezzaM',
      kind: 'decimal',
      min: 0,
      max: 1_000,
      unit: 'm',
      when: yes('tuboFlessibile'),
    },
    {
      key: 'tuboFlessibileNote',
      kind: 'textarea',
      maxLength: 4000,
      wide: true,
      when: yes('tuboFlessibile'),
    },
    { key: 'centralinaNote', kind: 'textarea', maxLength: 4000, wide: true },
  ],
} as const satisfies SectionDef;
