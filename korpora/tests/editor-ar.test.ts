// AR (editor/viewer-ar.js): which of the two ways a phone has, and the copy of the furniture it shows — boards in the
// colour of their decor, no instanced meshes, standing on the floor and centred; the USDZ for Quick Look is a ZIP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserGlobals, browserModule, editorModule } from './editor-modules.js';

// the few parts of three.js the test touches (the editor is untyped browser JS; three has no types installed)
interface Obj {
  userData: Record<string, unknown>;
  position: { set(x: number, y: number, z: number): void };
  add(...o: Obj[]): void;
  traverse(
    fn: (
      o: Obj & { isMesh?: boolean; isInstancedMesh?: boolean; material?: { type: string } },
    ) => void,
  ): void;
  updateMatrixWorld(force: boolean): void;
}
interface Box {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  setFromObject(o: Obj): Box;
}
type Ctor<T> = new (...args: unknown[]) => T;
interface Three {
  Group: Ctor<Obj>;
  Mesh: Ctor<Obj>;
  InstancedMesh: Ctor<Obj>;
  BoxGeometry: Ctor<unknown>;
  CylinderGeometry: Ctor<unknown>;
  MeshPhysicalMaterial: Ctor<unknown>;
  MeshBasicMaterial: Ctor<unknown>;
  Box3: Ctor<Box>;
}
interface ArModule {
  arMode(nav: unknown, doc: unknown): Promise<string | null>;
  plainCopy(root: Obj): Obj;
  quickLookBlob(copy: Obj): Promise<Blob>;
}

browserGlobals();
const THREE = await browserModule<Three>('node_modules/three/build/three.module.js', [
  'Group',
  'Mesh',
  'Box3',
]);
const ar = await editorModule<ArModule>('viewer-ar.js', ['arMode', 'plainCopy', 'quickLookBlob']);

const anchor = (ar: boolean) => ({
  createElement: () => ({ relList: { supports: (v: string) => ar && v === 'ar' } }),
});

test('WebXR where the browser offers immersive-ar, Quick Look where an <a> supports rel="ar", else nothing', async () => {
  const xr = (yes: boolean) => ({ xr: { isSessionSupported: async () => yes } });
  assert.equal(await ar.arMode(xr(true), anchor(false)), 'webxr');
  assert.equal(await ar.arMode(xr(false), anchor(true)), 'quicklook');
  assert.equal(await ar.arMode({}, anchor(true)), 'quicklook');
  assert.equal(await ar.arMode({}, anchor(false)), null);
  const broken = { xr: { isSessionSupported: async () => Promise.reject(new Error('no')) } };
  assert.equal(await ar.arMode(broken, anchor(false)), null);
});

function furniture(): Obj {
  const root = new THREE.Group();
  const board = new THREE.Group();
  board.userData.part = { decor: 'demo:oak' };
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.02, 0.5),
    new THREE.MeshPhysicalMaterial(),
  );
  board.add(mesh);
  board.position.set(2, 0.5, -1);
  root.add(board);
  root.add(
    new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.0025, 0.0025, 0.01),
      new THREE.MeshBasicMaterial(),
      4,
    ),
  );
  root.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.01, 0.01),
      new THREE.MeshPhysicalMaterial({ metalness: 1 }),
    ),
  );
  return root;
}

test('the copy: decor colours, plain metal for hardware, no instanced meshes, on the floor and centred', () => {
  const copy = ar.plainCopy(furniture());
  const materials: string[] = [];
  let instanced = 0;
  copy.traverse((o) => {
    if (o.isInstancedMesh) instanced += 1;
    else if (o.isMesh) materials.push(o.material?.type ?? '');
  });
  assert.equal(instanced, 0);
  assert.deepEqual(materials, ['MeshStandardMaterial', 'MeshStandardMaterial']);
  copy.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(copy);
  assert.ok(Math.abs(box.min.y) < 1e-9, `on the floor: ${box.min.y}`);
  assert.ok(
    Math.abs(box.min.x + box.max.x) < 1e-9 && Math.abs(box.min.z + box.max.z) < 1e-9,
    'centred',
  );
});

test('the USDZ for Quick Look is a ZIP (USDZ is an uncompressed ZIP of the USD and its files)', async () => {
  const blob = await ar.quickLookBlob(ar.plainCopy(furniture()));
  const head = new Uint8Array(await blob.arrayBuffer()).subarray(0, 4);
  assert.deepEqual([...head], [0x50, 0x4b, 0x03, 0x04]);
  assert.equal(blob.type, 'model/vnd.usdz+zip');
});
