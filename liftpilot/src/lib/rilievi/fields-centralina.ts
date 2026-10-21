// The sheet's section «Centralina» (part of the list in fields.ts) — with a hydraulic lift, in the place of the argano
// and the governor. Since 21 October 2026 (the owner) only «Centralina da sostituire?» (the column `centralinaDaFare`),
// its make and model with either answer; with «No» — «Emendamento A3 da installare», and with its «Sì» a flexible hose to
// install (diameter, length, notes). The section's notes — always. The data of the power unit rilievi asked for a few
// days before (drive, pistons, pressure, oil…) were never in LiftPilot (prisma/schema.prisma, Scheda). Ported 1:1 from
// rilievi (src/schede/fields-centralina.ts, commit 988f3cf37).
import { answered, IDRAULICO, no, yes } from './field-conditions';
import type { SectionDef } from './field-types';

export const SEZIONE_CENTRALINA = {
  key: 'centralina',
  when: IDRAULICO,
  fields: [
    { key: 'centralinaDaFare', kind: 'yesno', wide: true, question: true },
    { key: 'centralinaMarca', kind: 'text', maxLength: 120, when: answered('centralinaDaFare') },
    { key: 'emendamentoA3', kind: 'yesno', when: no('centralinaDaFare') },
    { key: 'tuboFlessibile', kind: 'yesno', when: yes('emendamentoA3') },
    { key: 'tuboFlessibileDiametroMm', kind: 'decimal', min: 0, max: 1_000, unit: 'mm', when: yes('tuboFlessibile') },
    { key: 'tuboFlessibileLunghezzaM', kind: 'decimal', min: 0, max: 1_000, unit: 'm', when: yes('tuboFlessibile') },
    { key: 'tuboFlessibileNote', kind: 'textarea', maxLength: 4000, wide: true, when: yes('tuboFlessibile') },
    { key: 'centralinaNote', kind: 'textarea', maxLength: 4000, wide: true },
  ],
} as const satisfies SectionDef;
