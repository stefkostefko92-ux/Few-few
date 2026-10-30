// The version of the engine of the RT after the owner's model (round 52): an issued RT stores it (TechnicalReport.
// engineVersion, '2.x' — the first RT's records keep '1.x' and its engine), its hash covers it, and a change of the
// components' formulas, their registries, the document's wording or of a reused function's output is a new version.
// 2.1.0 (round 57): the owner's words — «puleggia di trazione», «Diretto»/«Indiretto 1:2», «non soddisfatta».
export const RT2_ENGINE_VERSION = '2.1.0';
/** Whether a record's engine is this one (else the first RT's). */
export const isRt2 = (engineVersion: string): boolean => engineVersion.startsWith('2.');
