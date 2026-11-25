> Част от умението `igrovo-studio` (справочник `sprite-pipeline.md` от `openai/plugins` @ `981b02c0c440`, MIT; променено от Carbon Stealth VCC на 2026-11-23).
> Важат „Наши предпазители“ от `../SKILL.md`: зависимости, нищо от CDN, активи, localhost, сървърът решава, достъпност.

# Sprite Pipeline

This is the default 2D animation workflow for the skill.

## Principles

- Start from one approved in-game frame.
- Produce the animation as one strip (drawn or supplied by a human), not isolated frames.
- Normalize the whole strip with one shared scale.
- Use one shared anchor, typically bottom-center.
- Preview before approving the asset.

## Why this works

- The approved seed frame preserves identity.
- Strip-first production reduces frame-to-frame drift.
- Shared-scale normalization prevents one tall pose from making the character feel smaller.
- Locking frame 01 back to the shipped sprite preserves continuity for idle-to-action transitions.

## Brief template

A brief for a human artist — not for an image API without the owner's yes (see `skill-sprite-pipeline.md`).

```text
Intended use: candidate production spritesheet for a 2D browser game animation review.
Edit the provided transparent reference canvas into a single horizontal <N>-frame spritesheet.

The existing sprite in the leftmost slot is the anchor frame and must remain the same character:
- same facing direction
- same silhouette family
- same palette family
- same proportions
- same readable face or key features
- same outfit details

Composition:
- transparent canvas
- exactly one row of <N> equal frame slots
- no extra characters
- no labels
- no scenery
- no poster layout

Action:
- describe the specific animation beat from frame 1 through frame N

Style:
- authentic pixel-art production asset
- crisp pixel clusters
- restrained palette
- not concept art
```

## Normalization notes

- Use the union of detected sprite bounds per slot.
- Compute one scale from the largest detected frame and anchor.
- Bottom-align frames into the target canvas.
- Reuse the exact shipped frame for frame 01 when lockback is appropriate.
