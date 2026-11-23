> Част от умението `igrovo-studio` (изходно умение `sprite-pipeline` от `openai/plugins` @ `981b02c0c440`, MIT; променено от Carbon Stealth VCC на 2026-11-23).
> Важат „Наши предпазители“ от `../SKILL.md`: зависимости, нищо от CDN, активи, localhost, сървърът решава, достъпност.

# Sprite Pipeline

## Overview

Use this skill for 2D sprite generation and normalization. This workflow is intentionally anchored around one approved frame and a whole-strip generation pass because frame-by-frame generation drifts too easily.

This skill is 2D-specific. If the request is for 3D characters, meshes, or materials, route back through `../SKILL.md`.

## Core Workflow

1. Start from an approved in-game seed frame.
   - The seed frame should already reflect the right silhouette, palette, costume, and proportions.
2. Build a larger transparent reference canvas around that frame.
   - No bundled script in our copy: use a tested script in the product's own toolchain, or an image editor.
3. Get the full animation strip as one piece, drawn or supplied by a human artist (owned or licensed art).
   - Do not produce each frame independently unless the user explicitly accepts lower consistency.
4. Normalize the result into fixed-size game frames.
   - No bundled script in our copy: use a tested script in the product's own toolchain, or an image editor.
   - Use one shared scale across the whole strip.
   - Align frames with one shared anchor, typically bottom-center.
5. Optionally lock frame 01 back to the shipped seed frame.
   - Do this when the animation should begin from the exact idle or base pose already in game.
6. Render a preview sheet and inspect the animation in-engine before approving it.
   - No bundled script in our copy: use a tested script in the product's own toolchain, or an image editor.

## Brief Rules

Always preserve these invariants in the brief to the artist:

- same character
- same facing direction
- same palette family
- same silhouette family
- same readable face or key features
- same outfit proportions
- transparent background
- exact frame count and slot layout

Always ask for:

- one strip at once
- a transparent canvas
- no scenery, labels, or poster composition
- crisp pixel-art clusters for pixel work
- production asset tone, not concept art

## Image Generation

Our copy has no image-generation step. The strip is drawn or supplied by a human, as owned or licensed art. An external image API needs the owner's explicit yes and a review of the provider's terms (`vendor-ai-review`: rights to the output, training on inputs, confidentiality of unreleased art); personal data in the input also needs a DPA (GDPR Art. 28) and Chapter V. Our internal rule: processing only in the EU/EEA. The seed frame and the character description do not leave without it.

## Quality Gates

- proportions stay stable across frames
- frame-to-frame size does not drift
- action reads clearly at game scale
- transparency is preserved
- frame 01 matches the shipped sprite when lockback is enabled
- preview looks correct before any in-engine asset index update

## References

- Detailed workflow: `sprite-pipeline.md`
- Shared frontend context: `skill-game-ui-frontend.md`
