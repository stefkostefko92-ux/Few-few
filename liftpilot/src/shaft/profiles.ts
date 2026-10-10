// Rolled steel sections for the machine's support (EN 10365; values of the ArcelorMittal sales catalogue, cross-checked
// with independent data files; IPE 330–400 from two independent EN 10365 tables; registry locale.putrelle): height h,
// flange width b, web tw and flange tf [mm], mass [kg/m], second moment Iy [cm⁴] and elastic section modulus Wel,y
// [cm³] about the strong axis. UPN flanges are tapered: tf is the nominal value. Pure data.
export interface Profile {
  h: number;
  b: number;
  tw: number;
  tf: number;
  mass: number;
  Iy: number;
  Wy: number;
}

const p = (h: number, b: number, tw: number, tf: number, mass: number, Iy: number, Wy: number): Profile => ({ h, b, tw, tf, mass, Iy, Wy });

export const PROFILES = {
  'IPE 120': p(120, 64, 4.4, 6.3, 10.4, 317.8, 52.96),
  'IPE 140': p(140, 73, 4.7, 6.9, 12.9, 541.2, 77.32),
  'IPE 160': p(160, 82, 5, 7.4, 15.8, 869.3, 108.7),
  'IPE 180': p(180, 91, 5.3, 8, 18.8, 1317, 146.3),
  'IPE 200': p(200, 100, 5.6, 8.5, 22.4, 1943, 194.3),
  'IPE 220': p(220, 110, 5.9, 9.2, 26.2, 2772, 252),
  'IPE 240': p(240, 120, 6.2, 9.8, 30.7, 3892, 324.3),
  'IPE 270': p(270, 135, 6.6, 10.2, 36.1, 5790, 428.9),
  'IPE 300': p(300, 150, 7.1, 10.7, 42.2, 8356, 557.1),
  'IPE 330': p(330, 160, 7.5, 11.5, 49.1, 11770, 713.1),
  'IPE 360': p(360, 170, 8, 12.7, 57.1, 16270, 903.6),
  'IPE 400': p(400, 180, 8.6, 13.5, 66.3, 23130, 1156),
  'HEA 120': p(114, 120, 5, 8, 19.9, 606.2, 106.3),
  'HEA 140': p(133, 140, 5.5, 8.5, 24.7, 1033, 155.4),
  'HEA 160': p(152, 160, 6, 9, 30.4, 1673, 220.1),
  'HEA 180': p(171, 180, 6, 9.5, 35.5, 2510, 293.6),
  'HEA 200': p(190, 200, 6.5, 10, 42.3, 3692, 388.6),
  'HEA 220': p(210, 220, 7, 11, 50.5, 5410, 515.2),
  'HEA 240': p(230, 240, 7.5, 12, 60.3, 7763, 675.1),
  'HEB 120': p(120, 120, 6.5, 11, 26.7, 864.4, 144.1),
  'HEB 140': p(140, 140, 7, 12, 33.7, 1509, 215.6),
  'HEB 160': p(160, 160, 8, 13, 42.6, 2492, 311.5),
  'HEB 180': p(180, 180, 8.5, 14, 51.2, 3831, 425.7),
  'HEB 200': p(200, 200, 9, 15, 61.3, 5696, 569.6),
  'HEB 220': p(220, 220, 9.5, 16, 71.5, 8091, 735.5),
  'HEB 240': p(240, 240, 10, 17, 83.2, 11260, 938.3),
  'UPN 100': p(100, 50, 6, 8.5, 10.6, 206, 41.2),
  'UPN 120': p(120, 55, 7, 9, 13.4, 364, 60.7),
  'UPN 140': p(140, 60, 7, 10, 16, 605, 86.4),
  'UPN 160': p(160, 65, 7.5, 10.5, 18.8, 925, 116),
  'UPN 180': p(180, 70, 8, 11, 22, 1350, 150),
  'UPN 200': p(200, 75, 8.5, 11.5, 25.3, 1910, 191),
  'UPN 220': p(220, 80, 9, 12.5, 29.4, 2690, 245),
  'UPN 240': p(240, 85, 9.5, 13, 33.2, 3600, 300),
} as const satisfies Readonly<Record<string, Profile>>;

export type ProfileName = keyof typeof PROFILES;
export const PROFILE_NAMES = Object.keys(PROFILES) as [ProfileName, ...ProfileName[]];
/** A channel (UPN) is drawn as a C, the others as an I. */
export const isChannel = (n: ProfileName): boolean => n.startsWith('UPN');
