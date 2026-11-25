// Светлината на сета като при продуктова фотография: голям мек софтбокс отпред-вляво (формата на
// отраженията върху желето и лака), топла практическа лампа отдясно-отзад (единствената светлина,
// която хвърля сянка), студен лунен контур от прозореца и топъл отскок от дървото отдолу.
// Средата за отраженията е процедурна (PMREM от малка сцена) — нула външни картинки/HDR.
import * as THREE from 'three';

export function addLights(scene, p) {
  // Практическата лампа: SpotLight от мястото на месинговата ѝ арматура (desk.js LAMP_POS), та
  // сянката да съвпада с видимия източник. Топла (~2700 K) и по-слаба от предния софтбокс —
  // лампата е акцент и контур, не основна светлина.
  const lamp = new THREE.SpotLight(0xffa860, 30, 7, 0.95, 0.85, 2);
  lamp.position.set(1.35, 2.0, -0.1);
  lamp.target.position.set(-0.2, 0, 0.2);
  scene.add(lamp.target);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.camera.near = 1;
  lamp.shadow.camera.far = 10;
  lamp.shadow.bias = -0.00055;
  lamp.shadow.normalBias = 0.02;
  lamp.shadow.radius = 5;
  scene.add(lamp);

  // Основна светлина: мека, топло-бяла, отпред-вляво-отгоре; без сянка (иначе втора карта на кадър).
  const key = new THREE.DirectionalLight(0xfff0dc, 2.2);
  key.position.set(-3.2, 3.4, 5);
  scene.add(key);

  // Лунна светлина през прозореца отзад — студен контур по горния ляв ръб на тялото.
  const moon = new THREE.DirectionalLight(0x9fb4ff, 0.55);
  moon.position.set(-2.6, 1.9, -3.4);
  scene.add(moon);

  // Висок и слаб (виж историята: нисък контур се оглеждаше в лака право в камерата).
  const rim = new THREE.DirectionalLight(0xaebfff, 0.4);
  rim.position.set(0.4, 3.4, -2.6);
  scene.add(rim);

  // Мек фил отдолу-отпред за корема и крачетата. Нарочно НАСОЧЕНА светлина отдолу, не точкова:
  // точков източник пред бюрото се отразяваше в лака като дълга бяла ивица (виж smoke кадъра),
  // а насочена светлина отдолу не осветява горната страна на плота изобщо. Под папийонката няма
  // PointLight (test/geometry.test.js) — през прозрачното тяло такъв пече зелен диск върху корема.
  const underFill = new THREE.DirectionalLight(new THREE.Color(p.pale), 0.4);
  underFill.position.set(0, -0.85, 2.1);
  scene.add(underFill);

  const overhead = new THREE.DirectionalLight(new THREE.Color(p.gold), 0.5);
  overhead.position.set(0.6, 5, 0.6);
  scene.add(overhead);

  // Небе студено (прозорецът), земя топла (дървото и лампата) — ambient половината на разделянето.
  scene.add(new THREE.HemisphereLight(0x1c2740, 0x3a2410, 0.6));
}

// Ръчно изработена среда вместо RoomEnvironment: голи панели с HDR яркост и малко размазване —
// така лещата, желето, лакът и златото отразяват меки правоъгълни софтбоксове (като на снимка),
// а не остър огледален ромб. Панелите са по-ярки от 1.0 нарочно — тонмапингът ги връща в обхват.
export function softStudioEnvironment(renderer) {
  const envScene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(20, 16, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { top: { value: new THREE.Color(0x1a2230) }, bottom: { value: new THREE.Color(0x2a1a0e) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bottom; void main(){ float h = clamp(normalize(vP).y * 0.5 + 0.5, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0); }',
    }),
  );
  envScene.add(sky);
  const panel = (pos, rot, w, h, color, intensity) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, toneMapped: false, side: THREE.DoubleSide }));
    m.material.color.multiplyScalar(intensity);
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    m.rotateZ(rot);
    envScene.add(m);
  };
  panel([-4.5, 4.2, 5.5], 0, 6.5, 6.5, 0xfff0dc, 3.2); // основен софтбокс, топло-бял
  panel([6, 1.2, 2.5], 0, 1.6, 7, 0xffc88a, 2.4); // вертикална ивица вдясно — топъл контур от лампата
  panel([-1, 1.8, -6], 0, 8, 4, 0x7f9fe8, 1.3); // прозорец отзад — студен контур
  panel([0, 7, 0.5], 0, 8, 6, 0xdfe6ff, 0.35); // таван — мек връх за шапката
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0.12).texture;
  sky.geometry.dispose();
  sky.material.dispose();
  return env;
}
