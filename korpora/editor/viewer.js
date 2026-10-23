// 3D view: boards with decor materials, doors swinging on their hinge edge, drawers sliding on their slides,
// exploded assembly, drilled holes, purchased items — in a photo studio corner or in a room.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MaterialCache } from './viewer-materials.js';
import { S } from './viewer-hw.js';
import { extents, addSymbols } from './viewer-scene.js';
import { Stage, TONE_MAPPING, studioEnvironment } from './viewer-studio.js';
import { Pipeline } from './viewer-render.js';
import { PhotoMode } from './viewer-photo-mode.js';
import { addSlides } from './viewer-slides.js';
import { frameCamera, explodeCamera, bindCameraKeys } from './viewer-camera.js';
import { pixelRatio } from './viewer-device.js';
import { reduceMotion } from './dom.js';
import {
  addHinges,
  addHingeArms,
  addHoles,
  addShelfPins,
  boardMeshes,
  faceMaterials,
} from './viewer-parts.js';

export class Viewer {
  constructor(host) {
    this.host = host;
    // no canvas antialiasing: the frames are multisampled off screen and refined while the camera rests
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.toneMapping = TONE_MAPPING;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute(
      'aria-label',
      '3D изглед на мебелта: влачене или стрелки — въртене, колелце или + и − — мащаб, 0 — цялата мебел',
    );
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 60);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !reduceMotion.matches;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener('change', () => this.invalidate());
    this.controls.addEventListener('start', () => {
      this.userMoved = true;
    });
    bindCameraKeys(this.renderer.domElement, this.camera, this.controls, {
      reframe: () => this.frame(),
      moved: () => (this.userMoved = true),
    });
    this.mats = new MaterialCache(this.renderer);
    this.stage = new Stage(this);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.pipeline = new Pipeline(this.renderer, this.scene, this.camera);
    this.photoMode = new PhotoMode(this);
    this.open = 0;
    this.explode = 0;
    this.showOps = true;
    this.dirty = true;
    this.inSight = true; // false while the page has the view scrolled out of sight (the editor watches it)
    // a lost and restored WebGL context loses all that was drawn on the GPU: the studio environment, the baked
    // decors, the path tracer's buffers. Rebuild them with the model on screen.
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.scene.environment?.renderTarget?.dispose();
      this.scene.environment = studioEnvironment(this.renderer);
      this.photoMode.drop();
      this.mats.reset();
      if (this.model) this.setModel(this.model);
      if (this.photoMode.wanted) this.photoMode.set(true).catch((err) => this.onPhotoError?.(err));
    });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    // sample k of the still image moves the key light (soft shadows)
    this.light = (k) => this.stage.jitter(k);
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      // a hidden panel (another tab of the editor) or a view scrolled out of sight draws nothing; it goes on where it
      // stopped when shown again
      if (!this.visible || !this.inSight) return;
      const moved = this.controls.update();
      if (this.dirty || moved) {
        this.pipeline.reset();
        this.stage.updateFog(this.camera, this.controls.target);
        this.photoMode.moved();
        this.dirty = false;
      }
      if (!this.photoMode.frame()) this.rasterFrame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  invalidate() {
    this.dirty = true;
  }

  // One more sample of the normal (raster) view, until its still image is done.
  rasterFrame() {
    if (!this.pipeline.done) this.pipeline.render(this.light);
  }

  // Something in the scene changed: the photorealistic view gets it again once the changes settle.
  changed() {
    this.invalidate();
    this.photoMode.changed();
  }

  // Photorealistic view on/off (viewer-photo-mode.js); resolves to false if it cannot run here.
  setPhoto(on) {
    return this.photoMode.set(on);
  }

  get photo() {
    return this.photoMode.renderer;
  }

  resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.visible = w > 0 && h > 0;
    if (!this.visible) return;
    const ratio = pixelRatio(w, h);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.pipeline.setSize(w, h, ratio);
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
    this.model = model;
    for (const child of [...this.root.children]) {
      child.traverse((o) => o.geometry?.dispose());
      this.root.remove(child);
    }
    this.mats.begin();
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
      const mesh = new THREE.Group();
      mesh.add(...boardMeshes(part, size, faceMaterials(this.mats, part)));
      mesh.userData.centre = centre.clone();
      mesh.userData.part = part;
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
      addHingeArms(this, mesh, part, centre);
    }
    addShelfPins(this, model, meshOf);
    addSlides(this, model, meshOf, drawerHolders);
    holeGeo.dispose(); // only its merged copies are on screen
    addSymbols(this, model, meshOf);
    this.applyPose();
    this.stage.fit(ext, this.off);
    this.mats.trim();
    if (!this.framed || this.lastType !== model.spec.type) {
      this.userMoved = false;
      this.frame();
    }
    this.lastType = model.spec.type;
    this.framed = true;
    this.changed();
  }

  frame() {
    frameCamera(this.camera, this.controls, this.ext, this.explode);
  }

  setOpen(f) {
    this.open = f;
    this.applyPose();
  }

  setExplode(e) {
    explodeCamera(this.camera, this.controls, this.explode, e);
    this.explode = e;
    this.applyPose();
  }

  setShowOps(on) {
    this.showOps = on;
    this.root.traverse((o) => {
      if (o.userData.ops) o.visible = on;
    });
    this.changed();
  }

  // The room's decors are baked when it is switched on; switched off, the model is built again without it, so that
  // only the model's decors stay pinned and the room's may be freed.
  setRoom(on) {
    this.stage.setRoom(on);
    if (!on && this.model) {
      this.setModel(this.model);
      return;
    }
    this.mats.trim();
    this.changed();
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
      if (it.kind === 'slide') it.holder.position.z += it.travel * S * this.open * 0.5;
    }
    this.changed();
  }
}
