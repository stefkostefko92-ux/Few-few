// raven.js — общото от „Двубой в Рейвънхолд" (boy/) за бранд страниците, без библиотеки:
//  · createGovernor — регулаторът на boy/src/quality.js: държи 60 fps, като мести ВЪТРЕШНАТА резолюция
//    (твърде много изпуснати кадри в прозореца → ×0.85; чист прозорец → ×1.08, но не веднага над скала,
//    която току-що не е стигнала — чака holdMs). Чиста логика, покрита с node:test (test/raven.test.mjs).
//  · GRADE — грейдът на boy/src/post-grade.js като GLSL парче: винетка → ACES RRT/ODT (Hill) → sRGB →
//    92% наситеност → студени сенки / топли светлини → мека S-крива → зърно по яркост → 1/255 дитер.
// Класически скрипт (window.CSRaven), зарежда се преди hero.js; тестът го пуска във vm.
(function (root) {
  function createGovernor(opts) {
    var o = opts || {};
    var budgetMs = o.budgetMs || 19.5, windowSize = o.windowSize || 40, minScale = o.minScale || 0.5;
    var warmupMs = o.warmupMs == null ? 3000 : o.warmupMs, holdMs = o.holdMs == null ? 20000 : o.holdMs;
    var scale = 1, samples = [], lastChange = 0, ceiling = 1, ceilingUntil = 0, since = 0;
    return {
      get scale() { return scale; },
      reset: function (nowMs) { scale = 1; samples = []; since = nowMs; ceiling = 1; ceilingUntil = 0; lastChange = 0; },
      // Връща true, когато скалата се е сменила и канвата трябва да се преоразмери.
      sample: function (dtMs, nowMs) {
        if (dtMs > 250 || nowMs - since < warmupMs) return false;
        samples.push(dtMs);
        if (samples.length > windowSize) samples.shift();
        if (samples.length < windowSize * 0.75 || nowMs - lastChange < 1200) return false;
        var slow = samples.filter(function (d) { return d > budgetMs; }).length / samples.length;
        if (slow > 0.12 && scale > minScale) {
          ceiling = scale; ceilingUntil = nowMs + holdMs; scale = Math.max(minScale, scale * 0.85);
        } else if (slow === 0 && scale < 1 && (nowMs > ceilingUntil || scale * 1.08 < ceiling)) {
          scale = Math.min(1, scale * 1.08);
        } else return false;
        lastChange = nowMs; samples = [];
        return true;
      },
    };
  }

  // Телефони и малки екрани тръгват по-леко; регулаторът доуточнява оттам.
  function initialPixelCap(coarsePointer, shortestSide) { return coarsePointer || shortestSide < 700 ? 0.5 : 0.75; }

  // Мълнията на boy: два импулса (70 ms + 160 ms), никога повече от два за секунда (WCAG 2.3.1 — под
  // прага от три). Връща интензитет 0..1 за време t (s) от началото на удара.
  function flashAt(t) {
    if (t < 0 || t > 0.62) return 0;
    var a = t < 0.07 ? Math.sin((t / 0.07) * Math.PI) : 0;
    var b = t > 0.3 && t < 0.46 ? Math.sin(((t - 0.3) / 0.16) * Math.PI) * 0.75 : 0;
    return Math.max(a, b);
  }

  var GRADE = [
    "const vec3 RL = vec3(0.2126, 0.7152, 0.0722);",
    "const mat3 ACESIn = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);",
    "const mat3 ACESOut = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);",
    "vec3 rrtOdt(vec3 v) { return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081); }",
    "float rh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }",
    "vec3 ravenGrade(vec3 col, vec2 uv, float aspect, float time, float grain, float vignette) {",
    "  vec2 d = (uv - 0.5) * vec2(aspect, 1.0);",
    "  col *= clamp(1.0 - vignette * pow(dot(d, d) * 1.6, 1.3), 0.0, 1.0);",
    "  col = clamp(ACESOut * rrtOdt(ACESIn * col), 0.0, 1.0);",
    "  col = pow(col, vec3(1.0 / 2.2));",
    "  float l = dot(col, RL);",
    "  col = mix(vec3(l), col, 0.92);",
    "  col += vec3(-0.012, 0.004, 0.02) * (1.0 - l) * (1.0 - l);",
    "  col += vec3(0.03, 0.012, -0.018) * l * l;",
    "  col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);",
    "  col += (rh(gl_FragCoord.xy + fract(time * 7.13) * 431.0) - 0.5) * grain * (1.0 - l * 0.7);",
    "  col += (rh(gl_FragCoord.xy * 1.37 + 17.0) - 0.5) / 255.0;",
    "  return clamp(col, 0.0, 1.0);",
    "}",
  ].join("\n");

  root.CSRaven = { createGovernor: createGovernor, initialPixelCap: initialPixelCap, flashAt: flashAt, GRADE: GRADE };
})(typeof window !== "undefined" ? window : globalThis);
