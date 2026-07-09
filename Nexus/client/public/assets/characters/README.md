# Combat character rigs (animated glTF)

The four class rigs the 3D combat scene loads. Each is a **fully animated**
glTF binary (`.glb`) with class-appropriate authored animation clips. The
choreographer (`src/combat/choreo/`) maps combat events onto these clips —
drop in a replacement with the same clip names and it just works.

| Class   | File          | Source                          | Licence |
|---------|---------------|---------------------------------|---------|
| warrior | `warrior.glb` | Quaternius "RPG Characters" — Warrior | CC0 |
| ranger  | `ranger.glb`  | Quaternius "RPG Characters" — Ranger  | CC0 |
| mage    | `mage.glb`    | Quaternius "RPG Characters" — Wizard  | CC0 |
| rogue   | `rogue.glb`   | Quaternius "RPG Characters" — Rogue   | CC0 |

CC0 (public domain) — no attribution required; we credit Quaternius anyway.
See `QUATERNIUS_LICENSE.txt`.

## Animation clips the choreographer looks for

The rig loader (`CombatScene3D.tsx › tryLoadRig`) resolves these clip names
into a stable action map. Any clip that's missing is simply skipped and the
choreographer's procedural body-lean covers it.

| Action  | Clip names tried (in order)                          |
|---------|------------------------------------------------------|
| idle    | `Idle`, `Idle_Neutral`                               |
| attack  | per class: `Sword_Attack` · `Bow_Shoot` · `Staff_Attack`/`Spell1` · `Dagger_Attack` |
| attack2 | per class: `Sword_Attack2` · `Bow_Shoot` · `Spell2` · `Dagger_Attack2` (crit / combo) |
| draw    | `Bow_Draw` (ranger wind-up)                          |
| cast    | `Spell1`, `Spell2`, `Staff_Attack` (mage)            |
| hit     | `RecieveHit`, `RecieveHit_2`, `HitRecieve` (struck)  |
| dodge   | `Roll`                                               |
| death   | `Death`, `Defeat`                                    |

Loop modes are set at load: `idle` loops; everything else is `LoopOnce` +
`clampWhenFinished`. The choreographer crossfades between them (~0.08–0.20s).

## Replacing these with your own Unreal Engine / Blender animations

See `Nexus/docs/UE-BLENDER-ANIMATION-PIPELINE.md`. Short version:

1. Author / retarget the animation in **Unreal Engine** (Sequencer + Control
   Rig, or Animation Blueprint) or **Blender** (Auto-Rig Pro / Rokoko / hand-
   keyed).
2. Name the action tracks to match the table above (e.g. `Sword_Attack`,
   `RecieveHit`, `Death`, `Idle`).
3. Export **glTF 2.0 Binary (.glb)**, Y-up, +Z forward, ~1.8 m tall, origin
   at the feet, in-place (no root motion — the choreographer drives the
   lunge slide), single skin, ≤ 60 bones, textures embedded.
4. Drop the file in here as `<class>.glb`. No code change needed.
