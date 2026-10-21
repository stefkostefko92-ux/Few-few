// The sheet's section «Argano» (part of the list in fields.ts) — not with a hydraulic lift (there it is the power unit).
// «Argano da sostituire?»: with Sì the machine's data sheet, for every kind of argano (ordini/); with No the kind of the
// argano that stays and what is changed or added on its brake: the shoes, the shoe check kit and the check on the
// control panel — with their kind by hand (the owner, October 2026; the brake contacts are not asked since 17 October —
// rilievi's column keeps its old answers, LiftPilot never had it). The notes — always. Ported 1:1 from rilievi
// (src/schede/fields-argano.ts, commit 988f3cf37).
import { NON_IDRAULICO, no, yes } from './field-conditions';
import type { SectionDef } from './field-types';

export const SEZIONE_ARGANO = {
  key: 'argano',
  when: NON_IDRAULICO,
  fields: [
    { key: 'arganoPreventivo', kind: 'yesno', wide: true, question: true, modulo: 'preventivoArgano' },
    { key: 'arganoTipo', kind: 'text', maxLength: 120, when: no('arganoPreventivo') },
    { key: 'ganasceFreno', kind: 'yesno', when: no('arganoPreventivo') },
    { key: 'kitControlloGanasce', kind: 'yesno', when: no('arganoPreventivo') },
    { key: 'kitControlloGanasceTipo', kind: 'text', maxLength: 120, when: yes('kitControlloGanasce') },
    { key: 'controlloQuadro', kind: 'yesno', when: no('arganoPreventivo') },
    { key: 'controlloQuadroTipo', kind: 'text', maxLength: 120, when: yes('controlloQuadro') },
    { key: 'arganoNote', kind: 'textarea', maxLength: 4000, wide: true },
  ],
} as const satisfies SectionDef;
