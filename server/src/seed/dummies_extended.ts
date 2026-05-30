/**
 * Extended player pool — populates the arena leaderboard and marketplace
 * so a fresh server feels lived-in. Names are drawn from a mixed-origin
 * (Bulgarian / Italian / Slavic / Romance / generic fantasy) name pool
 * so they read as real players, not bots.
 */

import type { CharacterClass } from '../types/domain';

export interface ExtendedDummy {
  name: string;
  class: CharacterClass;
  level: number;
  rating: number;
  bio: string;
  gear_tier: 1 | 2 | 3;        // pull starter / mid / late kit
  joined_days_ago: number;
}

// Mixed-origin first names that don't lean too hard on one culture.
const NAMES: string[] = [
  // Bulgarian / Slavic
  'Stoyan', 'Velina', 'Boyan', 'Radoslav', 'Iliyana', 'Vesela', 'Krasimir', 'Mira', 'Petromir',
  'Tihomir', 'Lyuben', 'Zorana', 'Vasilena', 'Yordan', 'Dragomira', 'Branimir', 'Yana',
  // Italian
  'Lorenzo', 'Beatrice', 'Matteo', 'Chiara', 'Edoardo', 'Sofia', 'Davide', 'Greta',
  'Tommaso', 'Aurora', 'Federico', 'Martina', 'Cesare', 'Luna', 'Elia', 'Giulietta',
  // Romance / general European
  'Cassiel', 'Rosella', 'Aldovar', 'Selene', 'Ottavio', 'Vivienne', 'Tarek', 'Larissa',
  'Renaud', 'Saskia', 'Maximilien', 'Astrid', 'Dorian', 'Cordelia',
  // Generic fantasy
  'Vorth', 'Lyra', 'Thessaly', 'Brann', 'Sable', 'Eowin', 'Kael', 'Ariadne',
  'Aetius', 'Idris', 'Belisaria', 'Roderic', 'Hespera', 'Caelis', 'Mavros',
  'Sylas', 'Nerys', 'Aelius', 'Mireille', 'Talon', 'Yorr', 'Rishan', 'Anneka',
  'Valdis', 'Cyran', 'Imogen', 'Halia', 'Orrin', 'Ysolde',
  // House suffixes for variety
  'Brenwick', 'Carrion', 'Druaga', 'Eldrin', 'Faelar', 'Grimhart', 'Halbridge', 'Ironbough',
];

// Brief, varied bios. Empty bio is realistic — most casual players don't write one.
const BIOS: string[] = [
  '', '', '', '',
  'Looking for a guild that does daily raids.',
  'Mostly arena. DM me before friending.',
  'Casual evenings, drink in hand.',
  'Three-class veteran. Mage main.',
  'Crafting and exploring. War only when poked.',
  'Sword & shield. Old habits.',
  'Hi from Sofia.',
  'Milano based.',
  'New here. Tips welcome!',
  'Quiet but always online.',
  'Recovering raid leader.',
  '#noP2W',
];

const CLASSES: CharacterClass[] = ['warrior', 'ranger', 'mage', 'rogue'];

function seeded(rng: () => number, arr: any[]) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function makeRng(seed: number) {
  // Tiny deterministic PRNG (mulberry32). Keeps seed reproducible across runs.
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateExtendedDummies(): ExtendedDummy[] {
  const rng = makeRng(0xc0ffee);
  const out: ExtendedDummy[] = [];
  const usedNames = new Set<string>();
  let attempts = 0;
  while (out.length < 80 && attempts < 5000) {
    attempts++;
    const first = seeded(rng, NAMES);
    const sure = rng();
    const surname = sure > 0.55 ? ' ' + seeded(rng, NAMES) : '';
    const name = first + surname;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    const cls = seeded(rng, CLASSES) as CharacterClass;
    // Level distribution: weighted toward 3–18.
    const r = rng();
    let level = 1;
    if (r < 0.20) level = 1 + Math.floor(rng() * 3);          // 1–3 newer
    else if (r < 0.55) level = 4 + Math.floor(rng() * 7);     // 4–10 most common
    else if (r < 0.85) level = 11 + Math.floor(rng() * 7);    // 11–17 mid
    else level = 18 + Math.floor(rng() * 8);                  // 18–25 veterans

    // Rating loosely correlates with level + jitter.
    const rating = Math.round(950 + level * 22 + (rng() - 0.5) * 200);
    const gear_tier: 1 | 2 | 3 = (level <= 6 ? 1 : level <= 14 ? 2 : 3);
    const joined_days_ago = 1 + Math.floor(rng() * 220);
    const bio = seeded(rng, BIOS);
    out.push({ name, class: cls, level, rating, bio, gear_tier, joined_days_ago });
  }
  return out;
}
