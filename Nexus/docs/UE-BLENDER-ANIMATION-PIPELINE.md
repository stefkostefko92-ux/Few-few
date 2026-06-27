# Unreal Engine / Blender → glTF animation pipeline

How to author high-quality combat animations in **Unreal Engine** or
**Blender** and get them into Nexus Dominion's browser combat without
breaking the "runs in the browser, no installer" premise.

## Why not run Unreal in the browser?

Unreal is a native engine. Its two web paths are both dead ends for a free
browser MMORPG:

- **UE → WebAssembly (HTML5 export)** — Epic deprecated it in UE 4.24 (2019);
  it doesn't exist in UE5. Third-party revivals are experimental, ship
  100 MB+ bundles, and break instant-play.
- **Pixel Streaming** — UE renders on a server and streams video to the
  browser. Works, but needs a **GPU server per concurrent player** — economically
  impossible for a free game with many simultaneous users.

So Unreal/Blender are used as the **animation production tool**, and the
result is exported to glTF and played by the existing Three.js
choreographer. The browser stays the runtime; the animation quality jumps.

## The contract: clip names

The rig loader (`client/src/combat/CombatScene3D.tsx › tryLoadRig`) resolves
authored clip names into a stable action map. Name your action tracks to
match and the choreographer drives them automatically:

| Action  | Clip name(s) — first match wins                                   |
|---------|-------------------------------------------------------------------|
| idle    | `Idle` / `Idle_Neutral`                                           |
| attack  | `Sword_Attack` (warrior) · `Bow_Shoot` (ranger) · `Staff_Attack` or `Spell1` (mage) · `Dagger_Attack` (rogue) |
| attack2 | `Sword_Attack2` · `Bow_Shoot` · `Spell2` · `Dagger_Attack2` (used on crits) |
| draw    | `Bow_Draw` (ranger wind-up)                                       |
| cast    | `Spell1` / `Spell2` / `Staff_Attack` (mage)                       |
| hit     | `RecieveHit` / `RecieveHit_2` / `HitRecieve` (plays on the struck fighter) |
| dodge   | `Roll`                                                            |
| death   | `Death` / `Defeat`                                                |

A clip that isn't present is skipped — the choreographer's procedural
body-lean fallback covers it, so partial rigs ship fine.

## Export specs (both engines)

- **Format:** glTF 2.0 **Binary (.glb)**, textures **embedded**.
- **Up axis:** Y-up. **Forward:** +Z.
- **Scale:** character ≈ 1.8 m tall, **origin at the feet** (so the rig sits
  on the ground plane).
- **Root motion:** **none** — animate in place. The choreographer drives the
  lunge / knockback by sliding `model.position`; a clip that also translates
  the root would double the motion.
- **Skin:** one skinned mesh hierarchy, **≤ 60 bones** (mobile budget).
- **Materials:** single PBR material per mesh, packed AO/Rough/Metal where
  possible. No Draco (the loader is the plain `GLTFLoader`).
- **Clip count:** keep it lean — the eight actions above plus `Run`/`Walk`
  if you want locomotion. Each clip adds to the `.glb` size that every
  player downloads.

## Path A — Unreal Engine 5

1. **Rig + animate.** Use a Mannequin-compatible skeleton (or your own).
   Author attacks with **Sequencer + Control Rig**, or import mocap
   (UE Marketplace / Mixamo / your own) and retarget via **IK Retargeter**
   to your character skeleton.
2. **Name the Animation Sequences** to match the clip table (rename the
   asset, e.g. `Sword_Attack`, `RecieveHit`, `Death`).
3. **Bake** Control-Rig results to the skeleton (Bake to Anim Sequence) so
   the export carries plain bone tracks.
4. **Export glTF.** Install the free **glTF Exporter** plugin (Epic's
   `GLTFExporter`, enabled in Plugins). Select the SkeletalMesh + its
   AnimSequences → *Export Selected* → glTF Binary. Tick *Export Vertex
   Skin Weights* and *Bake Materials*. One `.glb` with all clips.
5. If the exporter splits clips, combine them in Blender (Path B step 4) or
   re-export with all sequences selected.

## Path B — Blender (faster for low-poly / retargeting)

1. **Import** your base character (FBX/glTF). Quaternius RPG Characters (the
   current rigs) are CC0 and already in this shape — a good template.
2. **Retarget mocap** with **Auto-Rig Pro** (Remap), **Rokoko** plugin, or
   Mixamo (`mixamo.com` → Mixamo Add-on). Or hand-key in the Dope Sheet /
   NLA editor.
3. **Name each Action** (NLA strip) to the clip table. In the NLA editor,
   one strip per action keeps them as separate glTF animations.
4. **Combine** all actions: push each Action down as an NLA strip on the
   armature so the exporter emits one animation per strip.
5. **Export** `File → Export → glTF 2.0 (.glb)`:
   - Format: **glTF Binary (.glb)**
   - Include: **Selected Objects** (armature + mesh)
   - Transform: **+Y Up**
   - Animation: **All Actions** (or *NLA Strips*), *Always Sample Animations*
     on, *Group by NLA Track* off (we want flat clip names).
6. Drop the result in `client/public/assets/characters/<class>.glb`.

## Converting a multi-file glTF to a single .glb

If your export is `.gltf` + `.bin` + textures, collapse it to one binary:

```bash
npm i -g gltf-pipeline
gltf-pipeline -i Warrior.gltf -o warrior.glb --binary
```

`gltf-pipeline` inlines the buffer + textures into a single `.glb`.

## Verifying a rig before committing

```bash
# List the animation clips inside a .glb
python3 - <<'PY'
import json, struct
with open('warrior.glb','rb') as f:
    f.read(12); cl, ct = struct.unpack('<II', f.read(8)); js = json.loads(f.read(cl))
print(len(js.get('animations', [])), 'clips:',
      ', '.join(a.get('name','?') for a in js.get('animations', [])))
PY
```

Confirm `Idle`, your class `*_Attack`, `RecieveHit`, `Death`, `Roll` are
present, then drop the file in and reload `/demo/combat`.

## What the choreographer does with the clips

`client/src/combat/choreo/` is **timeline-driven**. Each attack Timeline
fires `rig.crossfade` cues at the right beats:

- wind-up → `attack` (or `draw` for ranger)
- impact frame → `callback.onImpact` + `hit` on the **target**
- recovery → back to `idle`
- defeat → `death` (clamped on the last frame)

So the authored clip plays *in place* while the choreographer slides the
fighter, fires VFX (slash arc, god-ray, dust, sigil), shakes the camera,
and runs hit-stop / slow-mo. The animation and the cinematics are layered,
not baked together — swap a clip and the whole cinematic still works.
