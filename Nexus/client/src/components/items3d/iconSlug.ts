// Споделена логика за резолвиране на старата рисувана икона (client/public/assets/icons/*.jpg) —
// използвана от Sprite.tsx (решетката, ВИНАГИ старата икона) и ItemViewer3DHost.tsx (голямата
// икона в прегледа за предмети без boy 3D геометрия — виж support.ts previewMode 'icon').

const CATEGORY_BASES: Record<string, string> = {
  shield: 'shield', helm: 'helm', armor: 'armor', gloves: 'gloves', boots: 'boots',
  ring: 'ring', amulet: 'amulet', potion: 'potion-red', cloak: 'cloak', gem: 'gem',
};

/* Equipment slots that ship 10 tier variants per slot (T1 crude iron →
   T10 divine radiance). resolveIconSlug resolves `${base}-t${tier}.jpg` when a
   tier is supplied; missing tier files fall through to the bare
   `${base}.jpg` thanks to the onError handler in Sprite.tsx. */
const TIERED_BASES = new Set<string>([
  'sword', 'axe', 'bow', 'dagger', 'mace', 'staff', 'spear',
  'armor', 'helm', 'boots', 'gloves', 'shield', 'cloak',
  'amulet', 'ring', 'gem',
]);

/** Resolve a base slug (without -tN suffix) into a tier-aware slug, falling
 *  back gracefully when the asset isn't available. */
export function resolveIconSlug(name?: string, category?: string, subType?: string, tier?: number): string {
  if (name && !name.match(/^(sword|dagger|bow|staff|axe|mace|shield|helm|armor|gloves|boots|ring|amulet|gem)$/)) {
    return name; // already specific (e.g. "monster-wolf", "camp-fish")
  }
  const base =
    name ||
    (category === 'weapon' ? (subType || 'sword') :
     category && CATEGORY_BASES[category] ? CATEGORY_BASES[category] : 'sword');
  const t = Math.min(10, Math.max(1, tier || 1));
  if (TIERED_BASES.has(base)) return `${base}-t${t}`;
  return base;
}
