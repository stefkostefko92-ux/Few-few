> Част от умението `igrovo-studio` (изходно умение `game-playtest` от `openai/plugins` @ `981b02c0c440`, MIT; променено от Carbon Stealth VCC на 2026-11-23).
> Важат „Наши предпазители“ от `../SKILL.md`: зависимости, нищо от CDN, активи, localhost, сървърът решава, достъпност.

# Game Playtest

## Overview

Use this skill to test browser games the way players experience them: through boot, input, scene transitions, HUD readability, and visual state changes. Prefer browser automation and screenshot review when the project supports it.

## Preferred Workflow

1. Boot the game and confirm the first actionable screen.
2. Exercise the main verbs.
3. Capture screenshots from representative states.
4. Check the UI layer independently from the render layer.
5. Report findings in severity order with reproduction steps.

## Tooling Guidance

- Prefer Playwright or equivalent browser automation already available in the repo.
- Point automation only at `localhost` or the product's local dev server — never production, a staging site with real users, or a third-party URL; never set a `*_BASE_URL` (e.g. `NEXUS_E2E_BASE_URL`) to anything else. Use only synthetic or test accounts, never a copy of a production database. Screenshots and traces go to `.tmp/` or the session scratchpad, never into a commit, and are deleted when the playtest ends.
- When the game is canvas or WebGL heavy, screenshots are mandatory because DOM assertions alone miss visual regressions.
- Use screenshots to judge playfield obstruction and HUD weight, not just correctness of text or layout.
- When deterministic automation is not practical, do a structured manual pass and capture evidence.
- For 3D rendering bugs or unexplained frame cost, use SpectorJS and browser performance tooling rather than guessing from code alone.

## Common Checks

### 2D checks

- sprite alignment and baseline consistency
- hit or hurt animation readability
- HUD overlap with the playfield
- command menu state changes
- tile or platform readability
- input-state feedback and turn-state clarity

### 3D checks

- first-load playability versus dashboard-like chrome
- persistent overlay weight versus playfield visibility
- camera control and camera reset behavior
- pointer-lock or drag-look transitions when menus and overlays open
- depth readability and silhouette clarity
- secondary panels collapsed or dismissible during normal play
- resize behavior
- WebGL context loss or renderer fallback behavior
- material or lighting regressions
- GLB or texture streaming stalls
- collision proxy or physics mismatch
- performance cliffs tied to post-processing or asset load

## Responsive and Browser Checks

- desktop and mobile viewport sanity
- safe-area and notch issues where relevant
- reduced-motion behavior for UI transitions
- keyboard, pointer, and pause-state handling
- React state and scene state synchronization when the project uses React Three Fiber

## Reporting Standard

Lead with findings. Keep each finding concrete:

- what the user sees
- how to reproduce it
- why it matters
- what likely subsystem owns it

## References

- Shared architecture: `skill-web-game-foundations.md`
- Frontend review cues: `skill-game-ui-frontend.md`
- 3D debugging notes: `webgl-debugging-and-performance.md`
- Full checklist: `playtest-checklist.md`
