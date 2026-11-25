> Част от умението `igrovo-studio` (изходно умение `three-webgl-game` от `openai/plugins` @ `981b02c0c440`, MIT; променено от Carbon Stealth VCC на 2026-11-23).
> Важат „Наши предпазители“ от `../SKILL.md`: зависимости, нищо от CDN, активи, localhost, сървърът решава, достъпност.

# Three WebGL Game

## Overview

Use this skill for the default non-React 3D path in the skill. This is not generic WebGL advice. It is an opinionated stack for browser 3D work:

- `three`
- TypeScript
- Vite
- GLB or glTF 2.0 assets
- Three.js loaders such as `GLTFLoader`, `DRACOLoader`, and `KTX2Loader` (decoder and transcoder files served from our own origin, never a CDN)
- Rapier JS for physics
- SpectorJS for GPU and frame debugging
- DOM overlays for HUD, menus, and settings

Use this skill when the project wants direct scene, camera, renderer, and game-loop control. If the app already lives in React, route to `skill-react-three-fiber-game.md` instead.

## Use This Skill When

- the app is plain TypeScript or Vite rather than React-first
- the project wants direct imperative control over the render loop
- the user asks for Three.js specifically
- the runtime needs engine-like control over scene, camera, loaders, and physics

## Do Not Use This Skill When

- the 3D scene lives inside an existing React app
- the main problem is shipped-asset optimization rather than runtime code
- the user explicitly chose Babylon.js or PlayCanvas

## Core Rules

1. Keep simulation state outside Three.js objects.
   - Game rules, AI, quest state, timers, and progression should not live inside meshes or materials.
2. Treat the render graph as an adapter.
   - Scene graph, cameras, materials, loaders, and post-processing are view concerns layered over simulation state.
3. Keep camera behavior explicit.
   - Orbit, follow, chase, rail, and first-person styles each need their own control boundary.
4. Keep UI out of WebGL unless the presentation absolutely depends on it.
   - Menus, HUD, inventories, and settings should default to DOM.
5. Use GLB or glTF 2.0 as the default shipping model format.
   - Do not build the runtime around DCC-native formats.
6. Use Rapier instead of ad hoc collision code when the game has meaningful 3D physics or collision response.
7. Keep the first playable view low-chrome.
   - Default to one compact objective or status cluster plus transient prompts.
   - Long notes, lore, and controls references should be collapsed until asked for.
   - Do not frame the scene with multiple equal-weight cards during normal play.

## Initial Scaffold UX

For exploration, traversal, and character-control prototypes, start with a sparse shell:

- one edge-aligned objective chip
- one transient controls hint
- one optional compact status strip

Only add larger UI surfaces when the game loop truly requires them. Journal, quest log, codex, map, and settings surfaces should open on demand, not occupy the viewport by default.

## Recommended Structure

Use the module shape in `three-webgl-architecture.md`, then keep these boundaries clean:

- `simulation/`: rules, progression, state, and AI
- `render/app/`: renderer, scene, camera, resize, context lifecycle
- `render/loaders/`: GLTF, Draco, KTX2, texture, and environment loading
- `render/objects/`: mesh instantiation and disposal
- `render/materials/`: material setup and shader boundaries
- `physics/`: Rapier world, bodies, colliders, and simulation bridge
- `ui/`: DOM overlays and menus
- `diagnostics/`: debug toggles, perf probes, and capture hooks

## Good Fit Scenarios

- Exploration demos
- Lightweight 3D combat prototypes
- Vehicle or traversal prototypes
- Scene-driven product or world showcases with gameplay
- Material, lighting, or post-process-led experiences
- 3D games where camera movement and depth readability are central

## Loaders, Assets, and Post-Processing

- Start with `GLTFLoader` for shipped 3D content.
- Add `DRACOLoader` or Meshopt-compatible optimization as part of the asset pipeline, not as a random runtime patch.
- Use `KTX2Loader` for compressed textures when the asset pipeline provides them.
- Prefer built-in Three.js render and post-processing utilities first. Add heavier abstraction only when the project actually needs it.
- Keep post-processing optional and measurable. Bloom and color effects should not hide gameplay readability.

## Shader and Material Guidance

- Start with standard Three.js materials and correct lighting before reaching for custom shaders.
- Use custom shaders only when the visual target genuinely needs them.
- Keep shader parameters driven by game state, not by incidental scene mutations.
- If a material stack gets complex, isolate it behind material factories instead of scattering shader setup across scene code.

## Browser Safety

- Handle resize explicitly.
- Expect WebGL context loss and recovery.
- Keep a fallback or degraded mode in mind for fragile GPU paths.
- Watch texture size, geometry count, draw-call growth, and post-processing cost.
- Use SpectorJS when the scene behaves incorrectly or frame cost is unclear.

## Scope Warning

Do not claim that this skill offers equal 3D depth to the Phaser track. It supports serious 3D implementation, but the skill is still 2D-first overall.

## References

- Shared architecture: `skill-web-game-foundations.md`
- Frontend direction: `skill-game-ui-frontend.md`
- 3D HUD layout patterns: `three-hud-layout-patterns.md`
- Three.js ecosystem: `threejs-stack.md`
- Three.js structure: `three-webgl-architecture.md`
- Vanilla starter: `threejs-vanilla-starter.md`
- GLB loader starter: `gltf-loading-starter.md`
- Rapier starter: `rapier-integration-starter.md`
- 3D asset pipeline: `web-3d-asset-pipeline.md`
- WebGL debugging and perf: `webgl-debugging-and-performance.md`
