// The landing page's live 3D story (timing in timeline.js). The example kitchen is built by the engine on the base
// catalog and drawn by the editor's own viewer — the decors, light and hardware of the product — and the reader's
// scroll explodes it, flies its parts onto their sheets and runs the router over sheet 1. Loaded only after the first
// interaction; any failure hands the stage back to the stills.
import * as THREE from 'three';
import { registerCatalog, baseCatalogData } from '../engine/catalog.js';
import { buildModel } from '../engine/model.js';
import { nest } from '../engine/nest.js';
import { toGcode } from '../engine/cam.js';
import { Viewer } from '../editor/viewer.js';
import { S } from '../editor/viewer-hw.js';
import { extents } from '../editor/viewer-scene.js';
import { KEY_DIR } from '../editor/viewer-studio.js';
import { storyState, sheetLayout, frameWatch } from './timeline.js';
import { buildSheets, buildToolpath, routerSteps, SLAB } from './story-scene.js';
import { cameraKeys, cameraAt } from './story-camera.js';
import { storyParts } from './story-parts.js';

const STUDIO = 0xe6e8e1; // background and fog: the page's --studio
const FLOOR = 0xeceee8; // studio floor and back wall, a shade lighter so the shadows read
// m: with the sheets in, the studio corner (floor and back wall) moves back into the fog: the floor reads as endless,
// its far edge and the wall's seam leave the view
const STUDIO_BACK = 40;

// gives the main thread back between the heavy steps: the reader's first scroll is not held up by one long task
const breathe = () =>
  globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((r) => setTimeout(r, 0));

export async function startStory(host, { example, ...options }) {
  registerCatalog(baseCatalogData());
  const model = buildModel(example);
  const nesting = nest(model);
  if (!nesting.sheets.length || nesting.errors.length) throw new Error('the example does not nest');
  const sheet1 = nesting.sheets[0];
  const program = toGcode(model, sheet1, {
    product: 'Korpora',
    hash: '',
    owner: '',
    date: '',
    sheetCount: nesting.sheets.length,
  });
  await breathe();

  const viewer = new Viewer(host);
  try {
    return await mount(viewer, { model, nesting, sheet1, program }, options);
  } catch (err) {
    release(viewer); // a scene that failed to set up must not keep drawing an invisible canvas
    throw err;
  }
}

// What the scene holds, given back: its loop, its observer, the GPU context and the canvas.
function release(viewer) {
  cancelAnimationFrame(viewer.raf);
  viewer.ro?.disconnect();
  viewer.renderer.dispose();
  viewer.renderer.forceContextLoss?.();
  viewer.renderer.domElement.remove();
}

async function mount(
  viewer,
  { model, nesting, sheet1, program },
  { progress, onReady, onFail, timed = true },
) {
  const canvas = viewer.renderer.domElement;
  canvas.removeAttribute('role');
  canvas.removeAttribute('aria-label');
  // the scene is not a control here: scrolling and touch go to the page
  viewer.controls.enabled = false;
  viewer.controls.enableDamping = false;
  canvas.style.touchAction = 'auto';
  // a light studio in both themes, the colour of the page's stage panel (--studio in site-story.css), so the scene
  // and the panel meet without a seam; the editor's own theme switch is replaced, not only overridden once
  viewer.stage.applyTheme = () => {
    viewer.stage.surface.color.setHex(FLOOR);
    viewer.scene.background = new THREE.Color(STUDIO);
    viewer.scene.fog.color.setHex(STUDIO);
  };
  viewer.stage.applyTheme();
  await breathe();
  viewer.setModel(model);
  viewer.userMoved = true; // a resize must not re-frame the furniture: the story holds the camera

  // the furniture in metres, and the sheets laid out in front of it, first row nearest the camera: two across on a
  // portrait stage (a desktop's, a phone's), three on a landscape one (a tablet held upright)
  const e = extents(model);
  const ext = { W: (e.x1 - e.x0) * S, H: e.y1 * S, D: (e.z1 - e.z0) * S };
  const front = (e.z1 + viewer.off[2]) * S;
  const layout = sheetLayout(nesting.sheets, viewer.camera.aspect < 1 ? 2 : 3, 260);
  const origin = [-(layout.width / 2) * S, 0, front + 0.9 + layout.height * S];
  const place = { S, point: (x, y) => [origin[0] + x * S, 0, origin[2] - y * S] };

  const bed = buildSheets(layout, nesting.sheets, place);
  viewer.scene.add(bed.group);
  const o1 = layout.origins[0];
  const top1 =
    SLAB +
    Math.max(
      ...sheet1.placements.map((pl) => model.parts.find((p) => p.id === pl.partId)?.T ?? 18),
    ) *
      S;
  const steps = routerSteps(program.moves).map((s) => ({
    ...s,
    a: s.a && [s.a[0] + o1.x, s.a[1] + o1.y],
    b: s.b && [s.b[0] + o1.x, s.b[1] + o1.y],
    drill: s.drill && [s.drill[0] + o1.x, s.drill[1] + o1.y],
  }));
  const router = buildToolpath(steps, new Map(program.tools.map((t) => [t.id, t])), place, top1);
  viewer.scene.add(router.group);

  // the boards that fly to the sheets and the hardware that goes first (story-parts.js)
  const parts = storyParts(viewer, nesting, layout, place);

  // the key light and its shadows follow the action from the furniture to the sheets
  const stage = viewer.stage;
  const wallZ = stage.wall.position.z;
  const floorZ = stage.floor.position.z;
  const shadow = stage.key.shadow.camera;
  const lightAt = (centre, radius) => ({
    target: centre.clone(),
    base: centre.clone().addScaledVector(KEY_DIR, radius * 4),
    span: radius * 1.9 + 0.4,
    far: radius * 8 + 2,
  });
  const allC = new THREE.Vector3(...place.point(layout.width / 2, layout.height / 2));
  const allR = (Math.hypot(layout.width, layout.height) / 2) * S;
  const oneC = new THREE.Vector3(...place.point(o1.x + sheet1.w / 2, o1.y + sheet1.h / 2));
  const oneR = (Math.hypot(sheet1.w, sheet1.h) / 2) * S;
  const furnitureLight = {
    target: stage.key.target.position.clone(),
    base: stage.base.clone(),
    span: shadow.right,
    far: shadow.far,
  };
  const sheetsLight = lightAt(allC, allR);
  let keys = cameraKeys(viewer.camera, ext, {
    all: { centre: allC, radius: allR },
    one: { centre: oneC, radius: oneR },
  });
  // the fog only melts the far floor into the background: it starts behind whatever the story shows
  const furnitureR = Math.hypot(ext.W, ext.H, ext.D) * 0.5;
  let sceneR = furnitureR;
  viewer.stage.updateFog = (camera, target) => {
    const fog = viewer.scene.fog;
    fog.near = camera.position.distanceTo(target) + sceneR * 2.5 + 2;
    fog.far = fog.near + 22;
  };
  let aspect = viewer.camera.aspect;
  const size = new THREE.Vector2();

  const apply = (t) => {
    const st = storyState(t);
    parts.apply(st);
    bed.setShown(st.bed);
    router.group.visible = st.path > 0;
    const done = router.setProgress(st.path);

    const k = st.bed;
    sceneR = furnitureR + (allR - furnitureR) * k;
    stage.wall.position.z = wallZ - k * STUDIO_BACK;
    stage.floor.position.z = floorZ - k * STUDIO_BACK;
    stage.key.target.position.lerpVectors(furnitureLight.target, sheetsLight.target, k);
    stage.base.lerpVectors(furnitureLight.base, sheetsLight.base, k);
    stage.key.position.copy(stage.base);
    shadow.left = shadow.bottom = -(shadow.right = shadow.top =
      furnitureLight.span + (sheetsLight.span - furnitureLight.span) * k);
    shadow.far = furnitureLight.far + (sheetsLight.far - furnitureLight.far) * k;
    shadow.updateProjectionMatrix();

    if (Math.abs(viewer.camera.aspect - aspect) > 0.01) {
      aspect = viewer.camera.aspect;
      keys = cameraKeys(viewer.camera, ext, {
        all: { centre: allC, radius: allR },
        one: { centre: oneC, radius: oneR },
      });
    }
    const cam = cameraAt(keys, t);
    const dist = cam.pos.distanceTo(cam.target);
    viewer.camera.position.copy(cam.pos);
    viewer.controls.target.copy(cam.target);
    viewer.camera.lookAt(cam.target);
    viewer.camera.near = Math.max(0.01, dist / 80);
    viewer.camera.far = dist * 30;
    viewer.camera.updateProjectionMatrix();
    viewer.renderer.getDrawingBufferSize(size);
    router.setResolution(size.x, size.y);
    return done;
  };

  // a slow device gives the stage back to the stills (frameWatch in timeline.js); the stills script draws on a
  // software GPU on purpose and is not timed
  const watch = timed ? frameWatch() : { frame: () => false, pause() {} };
  let raf = 0;
  let last = NaN;
  let stopped = false;
  let readyAfter = 2;
  // what the read-out needs from the scene: the program's moves, to show the line the router is at
  const info = {
    program: program.text.split('\n').filter((line) => /^(G[0-3]|G8[0-9])\b/.test(line)),
    steps: router.count,
    done: 0,
  };
  // motion switched off while the scene runs (prefers-reduced-motion): the stills take over at once
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const onMotion = () => motion.matches && fail('reduced motion');
  const stop = () => {
    if (stopped) return;
    stopped = true;
    motion.removeEventListener('change', onMotion);
    cancelAnimationFrame(raf);
    release(viewer);
  };
  const fail = (why) => {
    stop();
    onFail?.(why);
  };
  canvas.addEventListener('webglcontextlost', () => fail('context lost'));
  motion.addEventListener('change', onMotion);

  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (!viewer.visible || document.hidden) return watch.pause();
    const t = progress();
    if (Math.abs(viewer.camera.aspect - aspect) > 0.01) last = NaN; // resized: the camera keys are made again
    const moves = t !== last;
    if (watch.frame(now, moves)) return fail('slow');
    if (moves) {
      last = t;
      info.done = apply(t);
      viewer.invalidate();
    }
    if (readyAfter > 0 && --readyAfter === 0) onReady?.(info);
  };
  raf = requestAnimationFrame(loop);

  return {
    info,
    stop,
    // the still image is done (stills for the page are made from it — scripts/landing-stills.ts)
    still: () =>
      new Promise((resolve) => {
        const check = () => (viewer.pipeline.done ? resolve() : requestAnimationFrame(check));
        requestAnimationFrame(check);
      }),
  };
}
