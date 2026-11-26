// Сцена „кондоминиум фоайе с асансьор“ — three.js, акумулационен рендер (supersampling + DOF + меки сенки + размазано отражение на пода).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import * as TX from './textures.mjs';
import { shots } from './shots.mjs';

const GREEN_A = new THREE.Color('#5FD11E'), GREEN_B = new THREE.Color('#2E7D12');
const halton = (i, b) => { let f = 1, r = 0; i = i + 1; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };

let W3 = null; // свят (кеширан)
function build(renderer) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x14120f);
  const mats = [];
  const T = { terr: TX.terrazzo(), trav: TX.travertine(), wal: TX.walnut(), steel: TX.brushedSteel() };
  const rep = (t, a, b = a) => { const c = t.clone(); c.repeat.set(1 / a, 1 / b); c.needsUpdate = true; return c; };

  const reg = (m, envI = 0.8) => { m.envMapIntensity = envI; mats.push(m); return m; };
  const steelMat = (tint = 0xd3d7db, rough = 1) => reg(new THREE.MeshPhysicalMaterial({
    color: tint, metalness: 1, roughness: 0.36 * rough, roughnessMap: rep(T.steel.rough, 1), bumpMap: rep(T.steel.bump, 1), bumpScale: 0.35,
    anisotropy: 0.65, anisotropyRotation: 0 }), 2.0);
  const matte = (c, r = 0.9, e = 0.8) => reg(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 }), e);
  const travMat = reg(new THREE.MeshPhysicalMaterial({ map: rep(T.trav.map, 2.4), bumpMap: rep(T.trav.bump, 2.4), bumpScale: 0.6, roughness: 0.62, specularIntensity: 0.5 }), 0.5);
  const walMat = reg(new THREE.MeshPhysicalMaterial({ map: rep(T.wal.map, 1.32, 1.98), roughnessMap: rep(T.wal.rough, 1.32, 1.98), roughness: 1, clearcoat: 0.25, clearcoatRoughness: 0.5 }), 0.5);
  const floorMat = reg(new THREE.MeshPhysicalMaterial({ color: 0xdcd8d0, map: rep(T.terr, 2.4), roughness: 0.42, specularIntensity: 0.0 }), 0.4);
  const plaster = matte(0x3b3833, 0.95, 0.6), graphite = matte(0x22262a, 0.7, 0.6);
  const steel = steelMat();

  // ---- планарно отражение на пода ----
  const refl = { tex: { value: null }, mat: { value: new THREE.Matrix4() }, str: { value: 0 } };
  floorMat.onBeforeCompile = (sh) => {
    sh.uniforms.reflTex = refl.tex; sh.uniforms.reflMat = refl.mat; sh.uniforms.reflStr = refl.str;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 reflMat;\nvarying vec4 vRefl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRefl = reflMat * (modelMatrix * vec4(transformed, 1.0));');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D reflTex;uniform float reflStr;varying vec4 vRefl;')
      .replace('#include <opaque_fragment>', `
        vec3 rc = texture2DProj(reflTex, vRefl).rgb; rc = min(max(rc, vec3(0.0)), vec3(6.0));
        float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        float fr = 0.075 + 0.925 * pow(1.0 - ndv, 5.0);
        outgoingLight += rc * fr * reflStr;
        #include <opaque_fragment>`);
  };

  // ---- помощници за геометрия (UV в метри) ----
  const metersUV = (geo, cx, cy, cz) => {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx, y = p.getY(i) + cy, z = p.getZ(i) + cz, ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      if (ax >= ay && ax >= az) uv.setXY(i, z, y); else if (ay >= az) uv.setXY(i, x, z); else uv.setXY(i, x, y);
    }
    uv.needsUpdate = true;
  };
  const group = new THREE.Group(); scene.add(group);
  const box = (w, h, d, mat, x, y, z, o = {}) => {
    const g = o.r ? new RoundedBoxGeometry(w, h, d, 3, o.r) : new THREE.BoxGeometry(w, h, d);
    metersUV(g, x, y, z);
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.castShadow = o.cast !== false; m.receiveShadow = o.recv !== false; (o.parent || group).add(m); return m;
  };
  const span = (x0, x1, y0, y1, z0, z1, mat, o) => box(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);

  const X0 = -4.6, X1 = 5.0, ZF = 10, H = 2.9, DX0 = 0.6, DX1 = 1.6, DH = 2.12, DCX = 1.1;
  // под
  const floor = span(X0, X1, -0.2, 0, -0.2, ZF, floorMat); floor.castShadow = false;
  // таван + плафон с графит
  span(X0, X1, H, H + 0.2, -0.2, ZF, graphite);
  // стени
  span(X0, DX0, 0, H, -0.2, 0, travMat); // лява част на челната стена
  span(DX0, DX1, DH, H, -0.2, 0, travMat); // над вратата
  span(DX1, X1, 0, H, -0.2, 0, walMat); // орех вдясно
  span(X1, X1 + 0.2, 0, H, -0.2, ZF, walMat); // дясна стена
  span(X0, X1, 0, H, ZF, ZF + 0.2, plaster); // задна стена (зад камерата)
  // лява стена с прозорец (z 2.2..5.4, y 0.2..2.6)
  span(X0 - 0.2, X0, 0, H, -0.2, 2.2, travMat); span(X0 - 0.2, X0, 0, H, 5.4, ZF, travMat);
  span(X0 - 0.2, X0, 0, 0.2, 2.2, 5.4, travMat); span(X0 - 0.2, X0, 2.6, H, 2.2, 5.4, travMat);
  const win = matte(0x1d2023, 0.6);
  for (const z of [3.27, 4.33]) span(X0 - 0.12, X0 - 0.02, 0.2, 2.6, z - 0.03, z + 0.03, win);
  span(X0 - 0.12, X0 - 0.02, 1.75, 1.81, 2.2, 5.4, win);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 3.7, 4.2) }));
  sky.position.set(X0 - 5, 1.8, 3.8); sky.rotation.y = Math.PI / 2; scene.add(sky);
  span(X1 - 0.02, X1, 0.3, 2.6, 6.4, 9.2, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.2, 3.3) }), { cast: false }); span(2.4, 4.0, 0.25, 2.6, ZF - 0.02, ZF, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.4) }), { cast: false }); // светла кутия зад камерата (за отраженията)
  // плинт (графит)
  span(X0, DX0, 0, 0.07, 0, 0.012, graphite, { r: 0.003 }); span(DX1, X1, 0, 0.07, 0, 0.012, graphite, { r: 0.003 });

  // ---- асансьорна рамка + крила ----
  const fz0 = -0.035, fz1 = 0.02;
  span(0.535, 0.62, 0, DH + 0.07, fz0, fz1, steel, { r: 0.004 }); span(DX1 - 0.02, DX1 + 0.065, 0, DH + 0.07, fz0, fz1, steel, { r: 0.004 });
  span(0.535, DX1 + 0.065, DH, DH + 0.07, fz0, fz1, steel, { r: 0.004 });
  span(0.6, 1.6, 0, 0.014, -0.25, 0.02, steel, { r: 0.003 }); // праг
  // отвор: странични ревюта (метал) + кабина
  const warm = reg(new THREE.MeshStandardMaterial({ color: 0xd9c3a0, roughness: 0.55 }), 0.5);
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.3, 1.45, 0.68) });
  span(0.6, 1.6, 0.0, 2.35, -1.6, -1.5, lamp, { cast: false }); // задна светеща стена на кабината
  span(0.5, 0.6, 0, 2.4, -1.6, -0.2, warm); span(1.6, 1.7, 0, 2.4, -1.6, -0.2, warm);
  span(0.6, 1.6, 2.28, 2.4, -1.6, -0.2, lamp, { cast: false }); // таван-светлина на кабината
  span(0.6, 1.6, -0.02, 0.0, -1.6, -0.2, matte(0x3a3631, 0.6)); // под на кабината
  const leafY0 = 0.014, leafH = 2.09, lz = -0.12;
  span(0.52, 1.02, leafY0, leafY0 + leafH, lz - 0.016, lz + 0.016, steelMat(0xd3d7db), { r: 0.003 });
  span(1.18, 1.68, leafY0, leafY0 + leafH, lz - 0.016, lz + 0.016, steelMat(0xd3d7db), { r: 0.003 });
  // дискретен вертикален кант (втори слой) на крилата
  span(0.96, 1.02, leafY0, leafY0 + leafH, lz + 0.01, lz + 0.02, steelMat(0xc9cccf, 1.25), { r: 0.002 });
  span(1.18, 1.24, leafY0, leafY0 + leafH, lz + 0.01, lz + 0.02, steelMat(0xc9cccf, 1.25), { r: 0.002 });

  // ---- индикатор над вратата (зелена стрелка нагоре) ----
  const gTex = TX.greenGradient();
  span(DCX - 0.17, DCX + 0.17, 2.31, 2.45, 0, 0.012, steelMat(0xd3d7db), { r: 0.003 });
  span(DCX - 0.14, DCX + 0.14, 2.335, 2.425, 0.012, 0.0135, new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }), { cast: false });
  const chev = (s, t) => { const sh = new THREE.Shape(); const a = [[-s, -s * 0.5], [0, s * 0.5], [s, -s * 0.5], [s, -s * 0.5 - t], [0, s * 0.5 - t], [-s, -s * 0.5 - t]]; a.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y)); return sh; };
  const mkChevGeo = (s, t, d) => { const g = new THREE.ExtrudeGeometry(chev(s, t), { depth: d, bevelEnabled: false }); const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5, (p.getY(i) + s * 0.5 + t) / (s + t)); return g; };
  const glowMat = new THREE.MeshBasicMaterial({ map: gTex, color: new THREE.Color(2.4, 2.4, 2.4) });
  const arrow = new THREE.Mesh(mkChevGeo(0.05, 0.02, 0.0008), glowMat); arrow.position.set(DCX, 2.38, 0.0138); group.add(arrow);
  const glowTex = TX.glowTexture();
  const glowSprite = (x, y, z, size, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: glowTex, color: GREEN_A.clone().multiplyScalar(k), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); m.position.set(x, y, z); group.add(m); return m; };
  glowSprite(DCX, 2.38, 0.05, 0.4, 0.16);

  // ---- бутонен панел (вляво от вратата) ----
  const PX = 0.36, PY = 1.1, plateZ = 0.004;
  span(PX - 0.045, PX + 0.045, PY - 0.105, PY + 0.105, 0, 0.008, steelMat(0xd3d7db), { r: 0.003 });
  const lath = (pts) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 64);
  const bezelGeo = lath([[0.0185, 0], [0.0195, 0.0012], [0.0195, 0.0042], [0.0178, 0.0048], [0.0152, 0.0044], [0.0148, 0.0015], [0.0148, 0]]);
  const capGeo = lath([[0, 0.0018], [0.0128, 0.0018], [0.0136, 0.0022], [0.0136, 0.0034], [0.0128, 0.0042], [0.006, 0.0046], [0, 0.0046]]);
  const bellMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0b0c, roughness: 0.6, metalness: 0 });
  const mkButton = (y, lit, up) => {
    const g = new THREE.Group(); g.position.set(PX, y, 0.008); g.rotation.x = Math.PI / 2; group.add(g);
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.0148, 48), bellMat); base.rotation.x = -Math.PI / 2; base.position.y = 0.0004; g.add(base);
    const bz = new THREE.Mesh(bezelGeo, steelMat(0xdadddf, 0.7)); bz.castShadow = bz.receiveShadow = true; g.add(bz);
    const cap = new THREE.Mesh(capGeo, steelMat(0xe0e3e5, 0.55)); cap.castShadow = cap.receiveShadow = true; g.add(cap);
    // гравиран триъгълник
    const tri = new THREE.Shape(); const s = 0.0058; tri.moveTo(-s, up ? -s * 0.7 : s * 0.7); tri.lineTo(s, up ? -s * 0.7 : s * 0.7); tri.lineTo(0, up ? s * 0.8 : -s * 0.8); tri.closePath();
    const tm = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.5 })); tm.rotation.x = -Math.PI / 2; tm.position.y = 0.00475; g.add(tm);
    if (lit) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0163, 0.0011, 12, 96), new THREE.MeshBasicMaterial({ color: GREEN_A.clone().multiplyScalar(2.6) })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.0045; g.add(ring);
    }
    return g;
  };
  mkButton(PY + 0.036, true, true); mkButton(PY - 0.036, false, false);
  glowSprite(PX, PY + 0.036, 0.02, 0.1, 0.4);
  const greenL = { intensity: 0 }, greenL2 = { intensity: 0 };

  // ---- пейка от травертин (вляво) ----
  span(-3.15, -1.45, 0, 0.44, 0.04, 0.5, travMat, { r: 0.012 });

  // ---- светлини ----
  RectAreaLightUniformsLib.init();
  const sun = new THREE.DirectionalLight(0xfff0dc, 9); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 40 }); sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.015; sun.shadow.radius = 2.5; scene.add(sun, sun.target);
  const cab = new THREE.SpotLight(0xffc98a, 90, 0, 1.25, 0.6, 2); cab.castShadow = true; cab.shadow.mapSize.set(2048, 2048);
  cab.shadow.camera.near = 0.05; cab.shadow.camera.far = 14; cab.shadow.bias = -0.0004; cab.shadow.normalBias = 0.01; cab.shadow.radius = 3; scene.add(cab, cab.target);
  const cove = new THREE.RectAreaLight(0xffd6a6, 14, 9.6, 0.12); cove.position.set(0.2, H - 0.07, 0.1); cove.lookAt(0.2, 0, 0.1); scene.add(cove);
  const fillL = new THREE.RectAreaLight(0xffe2c0, 0.3, 9, 6); fillL.position.set(0.2, H - 0.05, 4.8); fillL.lookAt(0.2, 0, 4.8); scene.add(fillL);

  const OFF = (window.OFF || []); if (OFF.includes('nobump')) { travMat.bumpMap = null; } if (OFF.includes('nofloor')) { floorMat.map = null; floorMat.onBeforeCompile = () => {}; } if (OFF.includes('std')) scene.overrideMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc }); if (OFF.includes('norm')) scene.overrideMaterial = new THREE.MeshNormalMaterial(); if (OFF.includes('green')) { greenL.intensity = 0; greenL2.intensity = 0; } if (OFF.includes('sun')) sun.intensity = 0; if (OFF.includes('cab')) cab.intensity = 0; if (OFF.includes('cove')) cove.intensity = 0; if (OFF.includes('fill')) fillL.intensity = 0;
  return { scene, mats, floor, refl, sun, cab, cove, group, floorMat, T };
}

function makeRT(w, h, type = THREE.HalfFloatType, depth = true) {
  return new THREE.WebGLRenderTarget(w, h, { type, format: THREE.RGBAFormat, depthBuffer: depth, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
}

const R = {
  async init(name, opts = {}) {
    const shot = { ...shots[name], ...opts.override };
    const sc = opts.scale ?? 1; const W = Math.round(shot.W * sc), Hh = Math.round(shot.H * sc);
    this.shot = shot; this.W = W; this.H = Hh; this.N = opts.spp ?? shot.spp; this.i = 0;
    if (!this.renderer) {
      const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      r.setPixelRatio(1); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; r.shadowMap.autoUpdate = false;
      r.toneMapping = THREE.NoToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
      document.body.appendChild(r.domElement);
      this.log = []; const t0 = performance.now();
      W3 = build(r); this.log.push('build ' + Math.round(performance.now() - t0) + 'ms');
    }
    const r = this.renderer, w3 = W3; r.setSize(W, Hh, false);
    this.cam = new THREE.PerspectiveCamera(shot.fov, W / Hh, 0.05, 60);
    this.cam.position.set(...shot.pos); this.cam.lookAt(...shot.target); this.cam.updateMatrixWorld();
    this.basePos = this.cam.position.clone();
    this.right = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 0); this.up = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 1);
    // RT-та
    [this.rtS, this.rtR, ...(this.acc || []), ...(this.bl || []).flat()].forEach((x) => x && x.dispose());
    this.rtS = makeRT(W, Hh); this.rtR = makeRT(W, Hh);
    this.acc = [makeRT(W, Hh, THREE.FloatType, false), makeRT(W, Hh, THREE.FloatType, false)]; this.acc0 = this.acc[0]; this.acc1 = this.acc[1];
    this.vcam = new THREE.PerspectiveCamera(); 
    w3.refl.tex.value = this.rtR.texture;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false; this.qscene = new THREE.Scene(); this.qscene.add(this.quad); this.qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.accMat = new THREE.ShaderMaterial({ uniforms: { prev: { value: null }, cur: { value: null }, w: { value: 1 } }, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: 'uniform sampler2D prev,cur;uniform float w;varying vec2 v;void main(){gl_FragColor=vec4(texture2D(prev,v).rgb+clamp(texture2D(cur,v).rgb,0.,40.)*w,1.);}' });
    this.log.push('init ok');
    // ---- процедурна среда чрез 2 „отскока“ от самата сцена ----
    if (!this.envDone) { this.envDone = true; this.captureEnv(); }
    r.shadowMap.needsUpdate = true;
    // блум RT
    this.bl = [2, 3, 4].map((s) => [makeRT(Math.max(2, W >> s), Math.max(2, Hh >> s), THREE.HalfFloatType, false), makeRT(Math.max(2, W >> s), Math.max(2, Hh >> s), THREE.HalfFloatType, false)]);
    r.setRenderTarget(this.acc0); r.setClearColor(0x000000, 1); r.clear(); r.setRenderTarget(this.acc1); r.clear(); r.setRenderTarget(null);
    this.cur = 0;
    return this.log;
  },

  captureEnv() {
    const r = this.renderer, w3 = W3, { scene } = w3;
    const pm = new THREE.PMREMGenerator(r);
    const boot = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    w3.mats.forEach((m) => { m.envMap = boot; });
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false });
    const cc = new THREE.CubeCamera(0.05, 60, cubeRT); cc.position.set(0.7, 1.35, 1.8); scene.add(cc);
    this.setLights(0); w3.refl.str.value = 0;
    w3.group.traverse((o) => { if (o.material?.blending === THREE.AdditiveBlending) o.userData.v = o.visible; });
    if (window.OFF.includes('env')) { w3.mats.forEach((m) => { m.envMap = null; }); return; }
    for (let pass = 0; pass < 2; pass++) {
      r.shadowMap.needsUpdate = true; cc.update(r, scene);
      const env = pm.fromCubemap(cubeRT.texture).texture; w3.mats.forEach((m) => { m.envMap = env; });
    }
    scene.remove(cc);
  },

  setLights(i) {
    const w3 = W3, { sun, cab, cove } = w3;
    const a = halton(i, 11), b = halton(i, 13), c = halton(i, 17), d = halton(i, 19);
    const rr = Math.sqrt(a) * 1.0, th = b * Math.PI * 2; // слънцето: ~мек конус
    const cx = -9.5, cy = 4.4, cz = 6.2; sun.position.set(cx + (c - .5) * 0.6, cy + rr * Math.cos(th) * 1.3, cz + rr * Math.sin(th) * 2.2); sun.target.position.set(1.0, 0, 1.2); sun.target.updateMatrixWorld();
    cab.position.set(1.1 + (c - 0.5) * 0.5, 2.15 + (a - 0.5) * 0.1, -0.7 + (d - 0.5) * 0.5); cab.target.position.set(1.1, 0, 2.2); cab.target.updateMatrixWorld();
  },

  sampleCamera(i) {
    const s = this.shot, cam = this.cam, near = cam.near;
    const jx = halton(i, 2) - 0.5, jy = halton(i, 3) - 0.5;
    const u1 = halton(i, 5), u2 = halton(i, 7); const rad = Math.sqrt(u1) * s.aperture, ang = u2 * Math.PI * 2; const ox = Math.cos(ang) * rad, oy = Math.sin(ang) * rad;
    cam.position.copy(this.basePos).addScaledVector(this.right, ox).addScaledVector(this.up, oy); cam.updateMatrixWorld();
    const t = near * Math.tan(THREE.MathUtils.degToRad(s.fov / 2)), asp = this.W / this.H;
    let l = -t * asp, rt = t * asp, tp = t, b = -t;
    const dx = (rt - l) * s.shift[0], dy = (tp - b) * s.shift[1]; l += dx; rt += dx; tp += dy; b += dy;
    const k = near / s.focus; l -= ox * k; rt -= ox * k; tp -= oy * k; b -= oy * k;
    const pw = (rt - l) / this.W, ph = (tp - b) / this.H; l += jx * pw; rt += jx * pw; tp += jy * ph; b += jy * ph;
    cam.projectionMatrix.makePerspective(l, rt, tp, b, near, cam.far); cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  },

  reflectionPass(i) {
    const r = this.renderer, w3 = W3, cam = this.cam, vc = this.vcam;
    const g = (k) => { const u = Math.max(1e-6, halton(i, k)), v = halton(i, k + 2); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const sigma = 0.011; const n = new THREE.Vector3(g(29) * sigma, 1, g(37) * sigma).normalize();
    const rp = new THREE.Vector3(0, 0, 0), cw = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld), rot = new THREE.Matrix4().extractRotation(cam.matrixWorld);
    const view = rp.clone().sub(cw).reflect(n).negate().add(rp);
    const la = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(cw); const tgt = rp.clone().sub(la).reflect(n).negate().add(rp);
    vc.position.copy(view); vc.up.set(0, 1, 0).applyMatrix4(rot).reflect(n); vc.lookAt(tgt); vc.updateMatrixWorld(true);
    vc.projectionMatrix.copy(cam.projectionMatrix); vc.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
    const tm = w3.refl.mat.value; tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1); tm.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    w3.floor.visible = false; r.setRenderTarget(this.rtR); r.setClearColor(0x14120f, 1); r.clear(); r.render(w3.scene, vc); w3.floor.visible = true;
  },

  step(n) {
    const r = this.renderer, w3 = W3, s = this.shot;
    for (let k = 0; k < n && this.i < this.N; k++, this.i++) {
      const i = this.i; this.setLights(i); this.sampleCamera(i); r.shadowMap.needsUpdate = true;
      const useRefl = s.floorRefl !== false; w3.refl.str.value = useRefl ? (s.reflStr ?? 1) : 0;
      if (useRefl) this.reflectionPass(i);
      r.setRenderTarget(this.rtS); r.setClearColor(0x14120f, 1); r.clear(); r.render(w3.scene, this.cam);
      const src = this.cur ? this.acc1 : this.acc0, dst = this.cur ? this.acc0 : this.acc1;
      this.accMat.uniforms.prev.value = src.texture; this.accMat.uniforms.cur.value = this.rtS.texture; this.accMat.uniforms.w.value = 1 / this.N;
      this.quad.material = this.accMat; r.setRenderTarget(dst); r.render(this.qscene, this.qcam); this.cur ^= 1;
    }
    r.setRenderTarget(null);
    return this.i;
  },

  finish() {
    const r = this.renderer, s = this.shot, acc = this.cur ? this.acc1 : this.acc0;
    const mk = (frag, u) => new THREE.ShaderMaterial({ uniforms: u, depthTest: false, depthWrite: false, vertexShader: 'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}', fragmentShader: frag });
    const bright = mk('uniform sampler2D t;varying vec2 v;void main(){vec3 c=texture2D(t,v).rgb;float l=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(1.4,4.0,l),1.);}', { t: { value: acc.texture } });
    const blur = mk(`uniform sampler2D t;uniform vec2 d;varying vec2 v;void main(){vec3 s=vec3(0.);float w[5]=float[5](0.2270,0.1946,0.1216,0.0540,0.0162);s+=texture2D(t,v).rgb*w[0];for(int i=1;i<5;i++){s+=texture2D(t,v+d*float(i)*1.5).rgb*w[i];s+=texture2D(t,v-d*float(i)*1.5).rgb*w[i];}gl_FragColor=vec4(s,1.);}`, { t: { value: null }, d: { value: new THREE.Vector2() } });
    const run = (mat, rt) => { this.quad.material = mat; r.setRenderTarget(rt); r.render(this.qscene, this.qcam); };
    let src = acc.texture;
    this.bl.forEach(([a, b], li) => {
      run(bright, a); bright.uniforms.t.value = acc.texture; // первоначално: яркост -> a (за най-малкия ще се използва низходящо)
      for (let it = 0; it < 2; it++) { blur.uniforms.t.value = a.texture; blur.uniforms.d.value.set(1 / a.width, 0); run(blur, b); blur.uniforms.t.value = b.texture; blur.uniforms.d.value.set(0, 1 / a.height); run(blur, a); }
    });
    const fin = new THREE.ShaderMaterial({ toneMapped: true, depthTest: false, depthWrite: false,
      uniforms: { t: { value: window.OFF.includes('showR') ? this.rtR.texture : acc.texture }, b1: { value: this.bl[0][0].texture }, b2: { value: this.bl[1][0].texture }, b3: { value: this.bl[2][0].texture }, k: { value: s.bloom ?? 0.5 }, vig: { value: s.vig ?? 0.32 }, asp: { value: this.W / this.H }, grain: { value: 1.0 } },
      vertexShader: 'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `uniform sampler2D t,b1,b2,b3;uniform float k,vig,asp,grain;varying vec2 v;
        float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
        void main(){vec3 c=texture2D(t,v).rgb;c+=k*(texture2D(b1,v).rgb*.4+texture2D(b2,v).rgb*.35+texture2D(b3,v).rgb*.35);
          float d=length((v-.5)*vec2(asp,1.)*vec2(.8,1.));c*=1.-vig*smoothstep(.3,.95,d);
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          float n=(h(v*1733.+.17)+h(v*1291.+.71)-1.);gl_FragColor.rgb+=n*grain*(1.8/255.);
        }` });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = s.exposure ?? 1;
    this.quad.material = fin; r.setRenderTarget(null); r.render(this.qscene, this.qcam);
    const url = r.domElement.toDataURL('image/png');
    r.toneMapping = THREE.NoToneMapping; return url;
  },
};
window.R = R; window.__ready = true;
