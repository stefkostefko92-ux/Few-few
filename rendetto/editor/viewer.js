// 3D view: boards with decor materials, doors swinging on their hinge edge, drawers sliding on their slides,
// exploded assembly, drilled holes, purchased items, and an optional room around the furniture.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MaterialCache } from './viewer-materials.js';
import { S } from './viewer-hw.js';
import { extents, addSymbols, lightFor, buildRoom } from './viewer-scene.js';
import { reduceMotion } from './dom.js';
import { addHinges, addHoles, faceMaterials, remapUv } from './viewer-parts.js';

export class Viewer {
  constructor(host) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute(
      'aria-label',
      '3D изглед на мебелта: влачи за въртене, колелце за мащаб',
    );
    this.scene = new THREE.Scene();
    this.scene.environment = new THREE.PMREMGenerator(this.renderer).fromScene(
      new RoomEnvironment(),
      0.04,
    ).texture;
    this.scene.environmentIntensity = 0.85;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 60);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !reduceMotion.matches;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener('change', () => this.invalidate());
    this.controls.addEventListener('start', () => {
      this.userMoved = true;
    });
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.radius = 5;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.01;
    this.scene.add(this.sun, this.sun.target, new THREE.HemisphereLight(0xffffff, 0x8a8170, 0.35));
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ opacity: 0.2 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.roomGroup = new THREE.Group();
    this.roomGroup.visible = false;
    this.scene.add(this.roomGroup);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.mats = new MaterialCache(this.renderer);
    this.open = 0;
    this.explode = 0;
    this.showOps = true;
    this.dirty = true;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    const loop = () => {
      const moved = this.controls.update();
      if (this.dirty || moved) {
        this.renderer.render(this.scene, this.camera);
        this.dirty = false;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  invalidate() {
    this.dirty = true;
  }

  resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const changed = Math.abs(this.camera.aspect - w / h) > 0.05;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (changed && this.ext && !this.userMoved) this.frame();
    this.invalidate();
  }

  // mm (model) → m (scene), centred on the furniture footprint
  P(x, y, z) {
    return new THREE.Vector3((x + this.off[0]) * S, y * S, (z + this.off[2]) * S);
  }

  setModel(model) {
    for (const child of [...this.root.children]) {
      child.traverse((o) => o.geometry?.dispose());
      this.root.remove(child);
    }
    const ext = extents(model);
    this.ext = ext;
    this.off = [-(ext.x0 + ext.x1) / 2, 0, -(ext.z0 + ext.z1) / 2];
    this.items = [];
    const meshOf = new Map();
    const doors = new Map(model.groups.filter((g) => g.type === 'door').map((g) => [g.id, g]));
    const drawerOf = new Map();
    for (const g of model.groups.filter((x) => x.type === 'drawer'))
      for (const id of g.partIds) drawerOf.set(id, g);
    const drawerHolders = new Map();
    const holeGeo = new THREE.CylinderGeometry(1, 1, 1, 18);
    for (const part of model.parts) {
      const size = [0, 1, 2].map((i) => (part.box.max[i] - part.box.min[i]) * S);
      const centre = this.P(...[0, 1, 2].map((i) => (part.box.max[i] + part.box.min[i]) / 2));
      const geo = new THREE.BoxGeometry(...size);
      remapUv(geo, part);
      const mesh = new THREE.Mesh(geo, faceMaterials(this.mats, part));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.centre = centre.clone();
      meshOf.set(part.id, mesh);
      const door = doors.get(part.id);
      const drawer = drawerOf.get(part.id);
      if (door) {
        const pivot = this.P(door.axisX, (part.box.min[1] + part.box.max[1]) / 2, door.axisZ);
        const holder = new THREE.Group();
        holder.position.copy(pivot);
        mesh.position.copy(centre).sub(pivot);
        holder.add(mesh);
        this.root.add(holder);
        this.items.push({ kind: 'door', part, holder, base: pivot.clone(), explode: part.explode });
        addHinges(this, mesh, part, centre);
      } else if (drawer) {
        let holder = drawerHolders.get(drawer.id);
        if (!holder) {
          holder = new THREE.Group();
          drawerHolders.set(drawer.id, holder);
          this.root.add(holder);
          const front = model.parts.find((p) => p.id === drawer.id);
          this.items.push({
            kind: 'drawer',
            part: front,
            holder,
            base: new THREE.Vector3(),
            explode: front.explode,
            travel: drawer.travel,
          });
        }
        mesh.position.copy(centre);
        holder.add(mesh);
      } else {
        const holder = new THREE.Group();
        mesh.position.copy(centre);
        holder.add(mesh);
        this.root.add(holder);
        this.items.push({
          kind: 'part',
          part,
          holder,
          base: new THREE.Vector3(),
          explode: part.explode,
        });
      }
      addHoles(this, mesh, part, centre, holeGeo);
    }
    addSymbols(this, model, meshOf);
    this.applyPose();
    lightFor(this, ext);
    buildRoom(this, ext);
    if (!this.framed || this.lastType !== model.spec.type) {
      this.userMoved = false;
      this.frame();
    }
    this.lastType = model.spec.type;
    this.framed = true;
    this.invalidate();
  }

  frame() {
    const e = this.ext;
    const W = (e.x1 - e.x0) * S;
    const D = (e.z1 - e.z0) * S;
    const H = e.y1 * S;
    const radius = Math.hypot(W, H, D) * 0.5;
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * Math.max(this.camera.aspect, 0.2));
    const dist = (radius / Math.sin(Math.min(vHalf, hHalf))) * 1.06 * (1 + 0.55 * this.explode);
    const dir = new THREE.Vector3(0.62, 0.42, 1).normalize();
    this.controls.target.set(0, H / 2, 0);
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.camera.near = dist / 60;
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = radius * 0.5;
    this.controls.maxDistance = dist * 3;
    this.controls.update();
  }

  setOpen(f) {
    this.open = f;
    this.applyPose();
  }

  setExplode(e) {
    const prev = 1 + 0.55 * this.explode;
    this.explode = e;
    const next = 1 + 0.55 * e;
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.camera.position.copy(this.controls.target).addScaledVector(offset, next / prev);
    this.controls.maxDistance = Math.max(
      this.controls.maxDistance,
      offset.length() * (next / prev) * 1.2,
    );
    this.applyPose();
  }

  setShowOps(on) {
    this.showOps = on;
    this.root.traverse((o) => {
      if (o.userData.ops) o.visible = on;
    });
    this.invalidate();
  }

  setRoom(on) {
    this.roomGroup.visible = on;
    this.ground.visible = !on;
    this.invalidate();
  }

  applyPose() {
    if (!this.items) return;
    const dist = 0.24 * this.explode;
    for (const it of this.items) {
      const e = it.explode ?? [0, 0, 0];
      it.holder.position.set(
        it.base.x + e[0] * dist,
        it.base.y + e[1] * dist + (it.kind === 'static' ? 0 : dist),
        it.base.z + e[2] * dist,
      );
      if (it.kind === 'door')
        it.holder.rotation.y =
          (it.part.hingeSide === 'left' ? -1 : 1) * THREE.MathUtils.degToRad(105 * this.open);
      if (it.kind === 'drawer') it.holder.position.z += it.travel * S * this.open;
    }
    this.invalidate();
  }
}
