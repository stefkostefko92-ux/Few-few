# Character Rigs (Blender / glTF)

This folder accepts authored character rigs that **automatically replace** the
procedural sprite stand-ins used by `CombatScene3D`. Drop a `.glb` here with
the matching class slug and the next combat will pick it up.

## File slots

| Class   | Path                                           |
|---------|------------------------------------------------|
| warrior | `public/assets/characters/warrior.glb`         |
| ranger  | `public/assets/characters/ranger.glb`          |
| mage    | `public/assets/characters/mage.glb`            |
| rogue   | `public/assets/characters/rogue.glb`           |

## Blender export specs

- Engine target: Three.js GLTFLoader (glTF 2.0)
- Y-up, +Z forward, scale 1.0
- Character ~1.8m tall, origin at feet
- ≤ 60 bones, ≤ 8k tris
- Single PBR material with packed AO/Rough/Metal
- No Draco compression (the loader is the plain GLTFLoader)

## Required animation clips

The combat director will look for these clip names on the imported
`AnimationMixer`:

- `idle` — looped breathing pose
- `attack` — 0.6s lunge (peak frame at 0.30s)
- `hit` — 0.4s hurt reaction
- `dodge` — 0.5s sidestep
- `defeat` — 1.0s slump

Optional class-specific clips:

- `magic` — staff cast (mage)
- `shoot` — bow draw + release (ranger)
- `stab` — backstab thrust (rogue)

## How fallback works

When the GLB fails to load (no asset shipped, or a network/CORS issue), the
procedural sprite remains the live fighter. The game keeps shipping without
an external asset dependency; you can author rigs in Blender at your own
cadence and drop them in without code changes.
