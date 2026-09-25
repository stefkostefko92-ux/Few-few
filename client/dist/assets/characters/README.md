# Character Rigs (Blender / glTF)

This folder accepts authored character rigs that **automatically replace**
the procedural sprite stand-ins used by `CombatScene3D`. Drop a `.glb`
with the matching class slug and the next combat will pick it up.

## File slots

| Class   | Path                                           |
|---------|------------------------------------------------|
| warrior | `public/assets/characters/warrior.glb`         |
| ranger  | `public/assets/characters/ranger.glb`          |
| mage    | `public/assets/characters/mage.glb`            |
| rogue   | `public/assets/characters/rogue.glb`           |

## Free animation pipeline — Mixamo (Adobe)

The fastest free path to rigged, animated characters is Adobe's Mixamo:

  https://www.mixamo.com

Mixamo's licence (Adobe FAQ, §"Can I use these in commercial projects?"):
*"Yes. Anything you download from Mixamo can be incorporated into
commercial products. You don't need to credit Mixamo."* — free Adobe
account required (no subscription).

### Step-by-step

1. **Pick a character.** Mixamo's "Characters" tab has ~30 free rigged
   meshes (medieval knight, ranger, archer, mage variants). Pick one
   that matches each class.
2. **Pick the animation clips.** Search the "Animations" tab and queue
   these clip names — they're the ones `CombatScene3D` looks for:

   - `idle`     → Mixamo "Sword And Shield Idle" / "Magic Idle" / etc.
   - `attack`   → "Sword Slash" / "Bow Shot" / "Magic Attack 01"
   - `hit`      → "Hit Reaction" / "Standing React Receive Punch"
   - `dodge`    → "Sword And Shield Slip" / "Jump Backward"
   - `defeat`   → "Standing React Death Backward"
   - *(optional)* `magic` / `shoot` / `stab` per class

3. **Export each clip individually** as **glTF Binary (.glb)** with
   "Skin" + "Without Skin" both checked OFF for the per-clip exports
   (you only need the bone animation tracks). Frame rate: 30.

4. **Combine in Blender (one .glb per class)**
   - Import the character mesh (first download with skin)
   - Import each animation .glb into the same file; rename the action
     `Armature|mixamo.com|Layer0` → match the slot name in the table
     above (`idle`, `attack`, etc.)
   - File → Export → glTF 2.0 (.glb)
   - Format: glTF Binary; Animations: All Actions; Include: Selected only
   - Save as `<class>.glb` in this folder.

5. **Reload combat.** The `GLTFLoader` stub in `CombatScene3D` will
   detect the file, fade out the procedural sprite, and the rig animates
   in its place. Any missing clips fall through to the procedural sprite
   transition, so partial rigs are fine to ship.

## Blender export specs

- Engine target: Three.js GLTFLoader (glTF 2.0)
- Y-up, +Z forward, scale 1.0
- Character ~1.8m tall, origin at feet
- ≤ 60 bones, ≤ 8k tris (keep mobile happy)
- Single PBR material with packed AO/Rough/Metal
- No Draco compression (the loader is the plain GLTFLoader)
- Animation clip names (required): `idle`, `attack`, `hit`, `dodge`, `defeat`

## Alternative free sources

| Source                         | Licence            | Notes                                          |
|--------------------------------|--------------------|------------------------------------------------|
| Mixamo (Adobe)                 | Free commercial    | Recommended. Easy retargeting.                 |
| Sketchfab "Downloadable, CC0"  | CC0                | Filter by `Downloadable` + `Licence: CC0`.     |
| Quaternius                     | CC0                | https://quaternius.com — low-poly RPG packs.   |
| Kenney Game Assets             | CC0                | https://kenney.nl — UI, sprites, light models. |
| OpenGameArt.org                | CC0/CC-BY          | Filter rigs by licence in the sidebar.         |
| Poly Pizza                     | CC0/CC-BY          | https://poly.pizza — searchable 3D asset hub.  |

## How fallback works

When the GLB fails to load (no asset shipped, network/CORS issue, missing
clip), the procedural sprite remains the live fighter. The game keeps
shipping without an external asset dependency — you author rigs on your
own schedule and drop them in without a single code change.
