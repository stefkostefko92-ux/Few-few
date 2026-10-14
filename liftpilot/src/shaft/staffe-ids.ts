// The Panev articles a design can name by hand (catalogo staffe Panev 2026, panev/docs/catalogo-staffe-panev-2026.pdf
// in the monorepo): the landing-door pairs A + B, of one section only (pp. 14-18: "le serie 37 / 45 / 65 non sono
// intercambiabili"), the counterweight rail supports, each with the SG the catalogue pairs it with (pp. 20-55), and the
// two solutions made to the site's drawing (pp. 61-62). A leaf: the inputs' type and their schema read it.

export const DOOR_PAIRS = [
  'A 65 170 7 + B 65 320', 'A 65 170 7 + B 65 220',
  'A 45 170 7 + B 45 320', 'A 45 170 7 + B 45 220', 'A 45 175 2 + B 45 320', 'A 45 175 2 + B 45 220',
  'A 37 150 7 + B 37 320', 'A 37 150 7 + B 37 220', 'A 37 170 2 + B 37 320', 'A 37 170 2 + B 37 220',
] as const;
export type DoorPairId = (typeof DOOR_PAIRS)[number];

/** The supports of a counterweight rail: SU and SD carry its foot square to the wall, SC along it. */
export const CW_SUPPORTS = [
  'SU 220 160', 'SU 220 180', 'SU 220 200', 'SD 150 160', 'SD 150 180', 'SD 150 200', 'SD 220 160', 'SD 220 180', 'SD 220 200',
  'SC 50 200', 'SC 60 200', 'SC 80 200', 'SC 90 200', 'SC 50 220', 'SC 60 220', 'SC 80 220', 'SC 90 220',
] as const;
export type CwSupportCode = (typeof CW_SUPPORTS)[number];

/** The solutions to the site's drawing: the guide made to measure (projection "A"), the rigid arm at a corner. */
export const CW_SPECIALS = ['SC 50 170 + SG 225 50', 'SN 60 65 + SN 65 200 + BRACCIO 160 190'] as const;
export type CwSpecial = (typeof CW_SPECIALS)[number];

export const CW_CHOICES = [...CW_SUPPORTS, ...CW_SPECIALS] as const;
export type CwChoice = (typeof CW_CHOICES)[number];

export const isCwSpecial = (c: CwChoice): c is CwSpecial => CW_SPECIALS.some((s) => s === c);
