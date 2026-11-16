// AR: the furniture in the room through the phone's camera, at its real size. On Android (Chrome with ARCore) a WebXR
// session — point at the floor, tap to place it; on iPhone and iPad (Safari) AR Quick Look with a USDZ made here. The
// model goes in the plain colours of its decors: the wood and stone textures are drawn on the GPU (tex-bake.js) and
// do not travel to AR. The button shows only where one of the two is there; nothing leaves the browser.
import * as THREE from 'three';
import { decor } from '../engine/materials.js';
import { $ } from './dom.js';

// 'webxr', 'quicklook' or null (the button stays hidden)
export async function arMode(nav = globalThis.navigator, doc = globalThis.document) {
  try {
    if (nav?.xr && (await nav.xr.isSessionSupported('immersive-ar'))) return 'webxr';
  } catch {
    // no WebXR here: Quick Look may still be
  }
  return doc?.createElement('a').relList?.supports?.('ar') ? 'quicklook' : null;
}

// A copy of the furniture for AR: boards in the colour of their decor, hardware in plain metal, no instanced meshes
// (shelf pins, holes — Quick Look does not take them), standing on the floor (y = 0) and centred on x and z.
export function plainCopy(root) {
  const copy = root.clone(true);
  const cache = new Map();
  const material = (hex, roughness, metalness) => {
    const k = `${hex}|${roughness}|${metalness}`;
    if (!cache.has(k))
      cache.set(
        k,
        new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness, metalness }),
      );
    return cache.get(k);
  };
  const drop = [];
  copy.traverse((o) => {
    if (o.isInstancedMesh) drop.push(o);
    else if (o.userData.ops) drop.push(o);
    else if (o.isMesh) {
      let p = o;
      while (p && !p.userData.part) p = p.parent;
      const part = o.userData.board ? p?.userData.part : null;
      o.material = part
        ? material(decor(part.decor)?.hex ?? '#cccccc', 0.6, 0)
        : material('#9a9a9a', 0.35, 0.8);
    }
  });
  for (const o of drop) o.removeFromParent();
  copy.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(copy);
  copy.position.sub(
    new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2),
  );
  const holder = new THREE.Group();
  holder.add(copy);
  return holder;
}

// The copy at rest — the fronts closed, nothing exploded — whatever pose the view is in; the view is put back.
export function restingCopy(viewer) {
  const { open, explode } = viewer;
  viewer.open = 0;
  viewer.explode = 0;
  viewer.applyPose();
  try {
    return plainCopy(viewer.root);
  } finally {
    viewer.open = open;
    viewer.explode = explode;
    viewer.applyPose();
  }
}

// iPhone, iPad: a USDZ of the copy, opened by AR Quick Look (an <a rel="ar"> with an image inside, as Safari wants)
export async function quickLookBlob(copy) {
  const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js');
  const data = await new USDZExporter().parseAsync(copy);
  return new Blob([data], { type: 'model/vnd.usdz+zip' });
}

async function quickLook(viewer) {
  const url = URL.createObjectURL(await quickLookBlob(restingCopy(viewer)));
  const a = document.createElement('a');
  a.rel = 'ar';
  a.href = url;
  a.hidden = true;
  a.appendChild(document.createElement('img'));
  // Safari opens Quick Look from a link in the page; it leaves again at once
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Android: an immersive-ar session with hit-test; a ring on the floor where the phone points, a tap puts the furniture
// there, turned to face the phone. The page's own overlay (#ar-overlay) carries the hint and the way out.
async function webxr(viewer) {
  const overlay = $('#ar-overlay');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.xr.enabled = true;
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.className = 'ar-canvas';
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x77736a, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(1, 3, 2);
  scene.add(sun);
  const model = restingCopy(viewer);
  model.visible = false;
  scene.add(model);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.15, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  ring.matrixAutoUpdate = false;
  ring.visible = false;
  scene.add(ring);
  const camera = new THREE.PerspectiveCamera();
  const release = () => {
    renderer.setAnimationLoop(null);
    renderer.domElement.remove();
    renderer.dispose();
    renderer.forceContextLoss();
  };
  let session;
  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: overlay },
    });
  } catch (err) {
    release();
    throw err;
  }
  let source = null;
  const exit = $('#ar-exit');
  const end = () => session.end().catch(() => {});
  session.addEventListener('end', () => {
    overlay.hidden = true;
    exit.removeEventListener('click', end);
    source?.cancel();
    release();
  });
  exit.addEventListener('click', end);
  overlay.hidden = false;
  try {
    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(session);
    const viewerSpace = await session.requestReferenceSpace('viewer');
    source = await session.requestHitTestSource({ space: viewerSpace });
  } catch (err) {
    await end();
    throw err;
  }
  session.addEventListener('select', () => {
    if (!ring.visible) return;
    model.position.setFromMatrixPosition(ring.matrix);
    const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    model.rotation.y = Math.atan2(eye.x - model.position.x, eye.z - model.position.z);
    model.visible = true;
  });
  renderer.setAnimationLoop((t, frame) => {
    const hits = frame ? frame.getHitTestResults(source) : [];
    const pose = hits[0]?.getPose(renderer.xr.getReferenceSpace());
    ring.visible = Boolean(pose);
    if (pose) ring.matrix.fromArray(pose.transform.matrix);
    renderer.render(scene, camera);
  });
}

export async function bindAr(viewer, text) {
  const button = $('#ar');
  if (!button) return;
  const mode = await arMode();
  if (!mode) return;
  button.hidden = false;
  $('#ar-overlay')?.addEventListener('beforexrselect', (ev) => ev.preventDefault());
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      if (mode === 'webxr') await webxr(viewer);
      else await quickLook(viewer);
    } catch {
      $('#photo-state').textContent = text.arFailed;
    } finally {
      button.disabled = false;
    }
  });
}
