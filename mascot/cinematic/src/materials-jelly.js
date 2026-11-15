// Желето: прозрачно тяло с ПОГЛЪЩАНЕ ПО ДЕБЕЛИНА (закон на Бер–Ламбер), а не боядисан цвят.
// Тънките ръбове и ръцете остават светли и чисти, дебелият торс потъмнява и се насища към
// accent-а — точно по това окото различава реално желе/стъкло от гума. Сметката на three е
// T = attenuationColor^(thickness / attenuationDistance); тук `thickness` не е константа за целия
// меш, а се мащабира на пиксел с приблизителната хорда през тялото (виж `chord` по-долу).
import * as THREE from 'three';

// Споделен часовник на вторичното движение: едно време, една сила на трептене — задава ги scene.js
// на всеки кадър, четат ги всички желирани повърхности (торс + крайници), та щракването да се разнесе
// по всички наведнъж.
export const jellyMotion = { uTime: { value: 0 }, uJiggle: { value: 0 } };

const v2 = (x, y = x) => new THREE.Vector2(x, y);

// Шейдър-куки върху MeshPhysicalMaterial: (1) трептене на върховете, (2) хорда → дебелина на пиксел,
// (3) тънък ръбов блясък (светлина, която излиза през ръба), разцепен по канал за лека дисперсия.
function jellyShader(mat, { rim, rimStrength, chordMin }) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: new THREE.Color(rim) };
    shader.uniforms.uRimStrength = { value: rimStrength };
    shader.uniforms.uTime = jellyMotion.uTime;
    shader.uniforms.uJiggle = jellyMotion.uJiggle;
    shader.vertexShader = `uniform float uTime;\nuniform float uJiggle;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float jw = sin(uTime * 2.2 + position.y * 2.4) * uJiggle * 0.04;
      transformed.x += jw * normal.x;
      transformed.z += jw * normal.z;`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;')
      // След физичния слой: за изпъкнал обем хордата през пиксела е ~ 2R·(n·v) — в центъра
      // най-дългият път през желето, към силуета → 0. `chordMin` пази ръба от пълна прозрачност.
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        float chord = mix(${chordMin.toFixed(2)}, 1.0, pow(clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 0.75));
        material.thickness *= chord;`,
      )
      // Точковите светлини (лампата) върху мокър лак дават 2–3 пикселни „горещи точки“ — това чете
      // като CG. Реалната лампа е голям абажур: отражението ѝ е мека петна. Режем директния
      // спекулар на точковите светлини; формите на софтбокса идват от средата (остават остри).
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n        reflectedLight.directSpecular *= 0.3;\n        clearcoatSpecularDirect *= 0.3;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float ndv = max(dot(normalize(vViewPosition), normalize(vNormal)), 0.0);
        vec3 disp = vec3(pow(1.0 - ndv, 2.3), pow(1.0 - ndv, 2.6), pow(1.0 - ndv, 3.1));
        gl_FragColor.rgb += uRimColor * disp * uRimStrength;`,
      );
  };
  mat.customProgramCacheKey = () => `jelly-${rim}-${rimStrength}-${chordMin}`;
  return mat;
}

// `dispersion` е ~28% от цената на кадър (три пъти повече семпли на прозрачния слой, мерено под
// swiftshader) за едва видим ръбов ефект — затова се пуска само за статичния печен кадър.
export function createJelly(T, p, dispersion = 0) {
  const jelly = jellyShader(
    new THREE.MeshPhysicalMaterial({
      name: 'jelly',
      color: new THREE.Color(p.olive).lerp(new THREE.Color(p.pale), 0.3), // разсеяната в обема светлина е в цвета на желето, не бяла (бялата правеше млечно-сивкаво тяло)
      transmission: 0.8, // не 1: останалите 14% са осветен дифузен слой (подповърхностно разсейване, формата от ключовата светлина)
      thickness: 1.5, // макс. път през тялото; на пиксел се мащабира с хордата
      ior: 1.4,
      dispersion, // лек хроматичен процеп по ръбовете на пречупването (0 = изключен)
      roughness: 0.18, // ниска, но ненулева: лек мат във вътрешността като истинско желе
      clearcoat: 1,
      clearcoatRoughness: 0.22, // втори, остър слой лак: ясни меки отражения на софтбокса
      specularIntensity: 1,
      normalMap: T.carbon.normalMap,
      normalScale: v2(0.05), // микро-неравност на повърхността — едва доловима, не шарка
      attenuationColor: new THREE.Color(p.olive).lerp(new THREE.Color(p.pale), 0.2), // леко изсветлен: чистият accent поглъщаше до „горска“ зеленина вместо лайм
      attenuationDistance: 1.6, // по-кратко = по-наситено при дебелина (виж горе)
      envMapIntensity: 1.0,
      side: THREE.DoubleSide,
    }),
    { rim: p.olive, rimStrength: 0.12, chordMin: 0.18 },
  );
  const limb = jelly.clone();
  limb.thickness = 0.5;
  limb.attenuationDistance = 0.8;
  limb.onBeforeCompile = jelly.onBeforeCompile;
  limb.customProgramCacheKey = jelly.customProgramCacheKey;
  return { jelly, limb };
}

// Метал, който стои до точкова лампа (пискюлът до месинговата арматура), хваща директния ѝ спекулар
// като тясна пламтяща линия — чете като неонова тръба. Режем само директния принос на точковите
// светлини; четканото отражение на средата (софтбокс, анизотропия) остава.
export function softenPunctual(mat, k) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>\n        reflectedLight.directSpecular *= ${k.toFixed(2)};`);
  };
  mat.customProgramCacheKey = () => `soft-punctual-${k}`;
  return mat;
}
