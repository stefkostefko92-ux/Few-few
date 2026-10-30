// The options of the sheet's ticks and choices (fields.ts) — the values in the database (the Rilievo* enums in
// prisma/schema.prisma) and in the messages (`rilievi.scheda.option.<field>.<VALUE>`). A new option = a value here, in the
// enum (a migration) and a word in messages/it.json. Ported 1:1 from rilievi (src/schede/field-options.ts, commit
// 988f3cf37).

export const UBICAZIONE_MACCHINA = ['ALTO', 'BASSO'] as const;
// GEARLESS is shown as «MRL» (the messages): the value in the database stays, so that the previous code reads it.
export const TIPO_IMPIANTO = ['ELETTRICO', 'IDRAULICO', 'GEARLESS'] as const;
export const TIPO_PORTE = ['AUTOMATICHE', 'SEMIAUTOMATICHE', 'MANUALI'] as const;
export const QUADRO_MARCA = ['PELAZZA', 'MOVILIFT', 'DMG', 'MASTECH', 'ALTRO'] as const;
/** Mastech: the panel to order — NG120 or QI Touch (each with its own module). */
export const QUADRO_MODELLO = ['NG120', 'QI_TOUCH'] as const;
