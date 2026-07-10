// GLSL шейдъри за hero сцената „THE FORGE CORE".
// Техники: domain-warped fBm noise (течно енергийно поле), fresnel rim glow,
// GPU point-particles с pointer отблъскване. Палитра: cyan #00e5ff върху черно.
// Без строб: времето тече непрекъснато, без резки премигвания.

/** Споделен noise + fbm блок (hash-based gradient noise, бърз, WebGL2-съвместим). */
const NOISE = /* glsl */ `
  vec3 hash3(vec3 p){
    p = vec3(dot(p,vec3(127.1,311.7,74.7)),
             dot(p,vec3(269.5,183.3,246.1)),
             dot(p,vec3(113.5,271.9,124.6)));
    return -1.0 + 2.0*fract(sin(p)*43758.5453123);
  }
  float gnoise(vec3 p){
    vec3 i = floor(p); vec3 f = fract(p);
    vec3 u = f*f*(3.0-2.0*f);
    return mix(mix(mix(dot(hash3(i+vec3(0,0,0)),f-vec3(0,0,0)),
                       dot(hash3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                   mix(dot(hash3(i+vec3(0,1,0)),f-vec3(0,1,0)),
                       dot(hash3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
               mix(mix(dot(hash3(i+vec3(0,0,1)),f-vec3(0,0,1)),
                       dot(hash3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                   mix(dot(hash3(i+vec3(0,1,1)),f-vec3(0,1,1)),
                       dot(hash3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);
  }
  float fbm(vec3 p){
    float v = 0.0; float a = 0.5;
    for(int i=0;i<5;i++){ v += a*gnoise(p); p *= 2.02; a *= 0.5; }
    return v;
  }
`;

// --- Фонов fullscreen quad: течно cyber-поле ---
export const bgVertex = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const bgFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uRes;
  uniform vec2 uMouse;
  ${NOISE}
  void main(){
    vec2 uv = (vUv - 0.5) * vec2(uRes.x/uRes.y, 1.0);
    float t = uTime * 0.06;

    // Domain warping — полето „тече"
    vec3 p = vec3(uv * 2.2, t);
    vec3 q = vec3(fbm(p + vec3(0.0)), fbm(p + vec3(5.2,1.3,0.0)), fbm(p + vec3(1.7,9.2,0.0)));
    vec3 r = vec3(fbm(p + 4.0*q + vec3(1.7,9.2,t)), fbm(p + 4.0*q + vec3(8.3,2.8,t)), 0.0);
    float f = fbm(p + 4.0*r);

    // Реакция към курсора — леко издуване на енергията около него
    float md = length(uv - uMouse * vec2(uRes.x/uRes.y, 1.0));
    float glow = smoothstep(0.9, 0.0, md) * 0.35;

    float energy = smoothstep(0.1, 0.75, f + glow);
    // Тънки нишки (гребени на шума)
    float filaments = pow(1.0 - abs(f - 0.15), 6.0) * 0.6;

    vec3 cyan = vec3(0.0, 0.898, 1.0);
    vec3 col = cyan * (energy * 0.16 + filaments * 0.5 + glow * 0.4);

    // Радиален vignette към чисто черно (95% скрим — фонът не се бори с текста)
    float vig = smoothstep(1.25, 0.15, length(uv));
    col *= vig;
    col = mix(col, col * 0.4, 0.5);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// --- Централен кристал: fresnel rim glow + noise displacement ---
export const coreVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  uniform float uTime;
  ${NOISE}
  void main(){
    vNormal = normalize(normalMatrix * normal);
    vec3 pos = position;
    // Дишане + noise изместване по повърхността
    float d = fbm(position * 1.4 + vec3(0.0, 0.0, uTime * 0.25));
    pos += normal * d * 0.22;
    pos *= 1.0 + 0.04 * sin(uTime * 0.9);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

export const coreFragment = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vView;
  uniform float uTime;
  void main(){
    float fres = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.2);
    vec3 cyan = vec3(0.0, 0.898, 1.0);
    vec3 col = cyan * fres * 1.6;
    // Слаба вътрешна пулсация (плавна, не строб)
    col += cyan * 0.06 * (0.5 + 0.5 * sin(uTime * 0.7));
    gl_FragColor = vec4(col, fres * 0.9);
  }
`;

// --- GPU частици ---
export const particlesVertex = /* glsl */ `
  precision highp float;
  attribute float aSeed;
  uniform float uTime;
  uniform vec3 uMouse;
  uniform float uSize;
  varying float vAlpha;
  ${NOISE}
  void main(){
    vec3 pos = position;
    // Бавно вихрене около оста + noise дрейф
    float ang = uTime * 0.08 + aSeed * 6.2831;
    float s = sin(ang), c = cos(ang);
    pos.xz = mat2(c, -s, s, c) * pos.xz;
    pos += 0.18 * vec3(
      fbm(pos * 0.6 + uTime * 0.05),
      fbm(pos * 0.6 + 10.0 + uTime * 0.05),
      fbm(pos * 0.6 + 20.0 + uTime * 0.05)
    );

    // Отблъскване от курсора (проектиран в сцената)
    vec3 toM = pos - uMouse;
    float md = length(toM);
    pos += normalize(toM + 0.0001) * smoothstep(1.4, 0.0, md) * 0.5;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 / -mv.z) * (0.6 + 0.4 * aSeed);
    vAlpha = 0.35 + 0.65 * aSeed;
  }
`;

export const particlesFragment = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  void main(){
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if(d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    vec3 cyan = vec3(0.0, 0.898, 1.0);
    vec3 col = mix(cyan, vec3(1.0), pow(core, 3.0)); // бяло ядро
    gl_FragColor = vec4(col, core * vAlpha);
  }
`;
