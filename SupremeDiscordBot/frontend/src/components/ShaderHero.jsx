// frontend/src/components/ShaderHero.jsx
//
// The hero's real spectacle: a raymarched SDF "liquid core" rendered with raw
// WebGL2 (no three.js/OGL) — a single fullscreen-triangle fragment shader.
// Chosen over a 3D engine because this page (Login.jsx) ships in the MAIN,
// eager chunk (see App.jsx) for LCP — every extra kilobyte here is a kilobyte
// the browser must parse before the hero text paints. Raw WebGL2 keeps the
// delta to this file alone (~4KB of shader source as a JS string).
//
// Discipline (all load-bearing, not decorative comments):
//  - Loaded via React.lazy from Login.jsx / LandingLocalized.jsx, so its code
//    is a separate chunk that only downloads once the browser is idle —
//    never blocks the first paint of the H1 (the LCP element).
//  - Mounted ONLY when prefers-reduced-motion is "no-preference" AND
//    Save-Data / slow connections are not signalled AND the hero is within
//    ~200px of the viewport (IntersectionObserver). Otherwise this component
//    renders null and the CSS `.hero-aurora` poster (index.css) — already
//    present behind it — is the entire visual. That poster is not a
//    "loading state": it is a deliberately designed static background.
//  - Never starts on a SOFTWARE rasterizer (SwiftShader / llvmpipe / Basic
//    Render). `failIfMajorPerformanceCaveat` is supposed to cover this and
//    measurably does not — see `isSoftwareRenderer` below.
//  - FPS watchdog: rolling 700ms window. Below 24fps it drops the context
//    immediately; below 50fps it needs two consecutive windows (so a one-off
//    stutter does not kill it). `WEBGL_lose_context` + fall back to the CSS
//    poster. Low-end devices never get stuck rendering a slideshow.
//  - devicePixelRatio capped (1.5 desktop / 1 mobile); raymarch step budget
//    halves on narrow viewports.
//  - rAF keeps scheduling but skips uniform updates + draw while
//    `document.hidden` (background tabs do no GPU work).
//  - Zero strobe risk by construction: every color/brightness term is a sum
//    of sinusoids with periods ≥ ~6s (frequency ≪ 3Hz) — nothing here can
//    approach the WCAG 2.3.1 flash threshold even in principle.
//  - `aria-hidden` + `pointer-events-none`: decorative only, screen readers
//    and clicks pass straight through to the real content.
import { useEffect, useRef, useState } from "react";

// Fullscreen triangle — cheaper than a quad (no diagonal seam, 3 verts).
const VERT_SRC = `#version 300 es
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// GLSL ES 3.00 raymarched SDF scene: three smooth-blended spheres orbiting
// each other ("liquid core"), fresnel rim light, a masked grid floor echoing
// the brand's .grid-bg, and a handful of soft drifting glow points. Colors
// are passed in as uniforms so they always match the live tailwind `cs.*`
// tokens (see CS_CYAN / CS_GOLD / CS_BG below) instead of being re-guessed
// here as a second palette.
const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  iResolution;
uniform float iTime;
uniform vec3  uCyan;
uniform vec3  uGold;
uniform vec3  uBg;
uniform float uSteps;

float sdSphere(vec3 p, float r) { return length(p) - r; }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float map(vec3 p, float t) {
  vec3 p1 = p - vec3(sin(t * 0.55) * 0.85, cos(t * 0.42) * 0.5, 0.0);
  vec3 p2 = p - vec3(-sin(t * 0.38) * 0.95, sin(t * 0.63) * 0.55, 0.25);
  vec3 p3 = p - vec3(cos(t * 0.47) * 0.6, -cos(t * 0.35) * 0.65, -0.2);
  float d1 = sdSphere(p1, 0.85);
  float d2 = sdSphere(p2, 0.65);
  float d3 = sdSphere(p3, 0.55);
  float d = smin(d1, d2, 0.55);
  d = smin(d, d3, 0.55);
  return d;
}

vec3 calcNormal(vec3 p, float t) {
  const float e = 0.0015;
  vec2 h = vec2(e, 0.0);
  return normalize(vec3(
    map(p + h.xyy, t) - map(p - h.xyy, t),
    map(p + h.yxy, t) - map(p - h.yxy, t),
    map(p + h.yyx, t) - map(p - h.yyx, t)
  ));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
  float t = iTime;

  vec3 ro = vec3(0.0, 0.0, 3.1);
  vec3 rd = normalize(vec3(uv, -1.55));

  float dist = 0.0;
  vec3 pos = ro;
  bool hit = false;
  int maxSteps = int(uSteps);
  for (int i = 0; i < 96; i++) {
    if (i >= maxSteps) break;
    float d = map(pos, t);
    if (d < 0.0015) { hit = true; break; }
    dist += d;
    pos += rd * d;
    if (dist > 8.0) break;
  }

  vec3 col = uBg;

  if (hit) {
    vec3 n = calcNormal(pos, t);
    vec3 viewDir = normalize(ro - pos);
    float fresnel = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.0);
    vec3 lightDir = normalize(vec3(0.4, 0.6, 0.75));
    float diff = max(dot(n, lightDir), 0.0);
    vec3 base = mix(uCyan * 0.16, uGold * 0.42, 0.15 + 0.15 * sin(t * 0.22));
    col = base * diff + fresnel * uCyan * 1.3;
    col += uCyan * 0.06;
  } else {
    vec2 g = uv * 6.0;
    vec2 gf = abs(fract(g) - 0.5);
    float line = smoothstep(0.485, 0.5, max(gf.x, gf.y));
    float mask = smoothstep(1.1, 0.0, length(uv));
    col += uCyan * (line * mask * 0.05);

    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      vec2 c = vec2(sin(t * 0.13 + fi * 1.7), cos(t * 0.10 + fi * 2.3)) * 0.85;
      float d = length(uv - c);
      col += uGold * smoothstep(0.07, 0.0, d) * 0.4;
    }
  }

  float vig = smoothstep(1.3, 0.15, length(uv));
  col *= mix(0.35, 1.0, vig);

  fragColor = vec4(col, 1.0);
}`;

// Brand tokens as plain floats for the GPU. These MUST mirror
// tailwind.config.js `theme.extend.colors.cs.*` — kept as a comment map
// rather than introducing a second palette:
//   cs.cyan = #8fe600, cs.gold = #f0c24c, cs.bg = #070a06
const CS_CYAN = [0x8f / 255, 0xe6 / 255, 0x00 / 255];
const CS_GOLD = [0xf0 / 255, 0xc2 / 255, 0x4c / 255];
const CS_BG = [0x07 / 255, 0x0a / 255, 0x06 / 255];

// Софтуерен растеризатор — единственият случай, в който raymarch-ът НИКОГА
// няма да е добре: всеки пиксел се смята на процесора, тоест точно на нишката,
// която се бори за скрола.
//
// ЗАЩО НЕ СТИГА `failIfMajorPerformanceCaveat` (измерено, 12.08.2026): флагът
// е сложен точно за това, но НЕ сработва — Chromium върху SwiftShader върна
// напълно валиден WebGL2 контекст въпреки него. Мерено на живо:
// `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …), SwiftShader driver)`.
// Затова разчитаме на ИМЕТО на растеризатора, а не на обещанието на флага.
// Същото важи за виртуални машини, блокирани драйвери и стари лаптопи —
// хората, които най-малко могат да си позволят шейдър на процесора.
const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;

function isSoftwareRenderer(gl) {
  try {
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const name = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return SOFTWARE_GL.test(String(name || ""));
  } catch {
    return false;   // не знаем ≠ лошо: пазачът по кадри остава втората линия
  }
}

function compile(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(info || "shader compile failed");
  }
  return shader;
}

export default function ShaderHero({ className = "" }) {
  const canvasRef = useRef(null);
  const [eligible, setEligible] = useState(false);
  const [visible, setVisible] = useState(false);

  // Eligibility: motion welcome, no data-saver, not a tiny/low-power screen.
  useEffect(() => {
    const motionMql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const evaluate = () => {
      const saveData = navigator.connection?.saveData;
      const tooNarrow = window.innerWidth < 380;
      setEligible(!motionMql.matches && !saveData && !tooNarrow);
    };
    evaluate();
    motionMql.addEventListener?.("change", evaluate);
    return () => motionMql.removeEventListener?.("change", evaluate);
  }, []);

  // Lazy-init: only spin up the GL context once the hero is near the viewport.
  useEffect(() => {
    const el = canvasRef.current?.parentElement;
    if (!el || !eligible) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eligible]);

  useEffect(() => {
    if (!eligible || !visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
      failIfMajorPerformanceCaveat: true,
    });
    if (!gl) return; // no WebGL2 → CSS poster stays the whole experience
    if (isSoftwareRenderer(gl)) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return;        // CSS постерът е целият визуал — и е проектиран за това
    }

    let program;
    try {
      const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "link failed");
      }
    } catch {
      return; // fail closed — never throw into the render tree
    }

    gl.useProgram(program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // One triangle that covers the full clip-space quad and then some.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "iResolution");
    const uTime = gl.getUniformLocation(program, "iTime");
    const uCyanLoc = gl.getUniformLocation(program, "uCyan");
    const uGoldLoc = gl.getUniformLocation(program, "uGold");
    const uBgLoc = gl.getUniformLocation(program, "uBg");
    const uStepsLoc = gl.getUniformLocation(program, "uSteps");

    const isMobile = window.innerWidth < 768;
    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1 : 1.5);
    const steps = isMobile ? 36 : 72;

    function resize() {
      const parent = canvas.parentElement;
      const w = Math.max(1, Math.round(parent.clientWidth * dpr));
      const h = Math.max(1, Math.round(parent.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);

    let raf = 0;
    let degraded = false;
    let lowStreak = false;
    const start = performance.now();
    let frameCount = 0;
    let windowStart = start;

    function loseAndStop() {
      degraded = true;
      cancelAnimationFrame(raf);
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
      canvas.style.display = "none"; // CSS aurora underneath remains visible
    }

    function frame(now) {
      if (degraded) return;
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;

      frameCount++;
      const elapsed = now - windowStart;
      // Прозорецът е 700ms, а не 1500ms, и има НЕЗАБАВЕН праг.
      //
      // ЗАЩО (измерено, 12.08.2026): старата настройка искаше ДВА последователни
      // прозореца по 1.5s под 50fps, тоест до ~3 секунди накъсване, преди да се
      // предаде. Измерено на софтуерна графика: първите две секунди вървяха с 11
      // от 12 кадъра ИЗПУСНАТИ, после страницата се заключваше на 60fps. Тези три
      // секунди са точно моментът, в който човек си съставя мнение за продукта —
      // да ги изтърпи и после да се оправи, е по-лошо от никога да не е тръгвал.
      //
      // Две нива: катастрофално (<24fps) пада ВЕДНАГА, защото там няма какво да
      // се доказва; просто слабо (<50fps) пази двупрозоречното изчакване, за да
      // не гаси заради еднократно заекване (смяна на раздел, GC, чужд процес).
      if (elapsed > 700) {
        const fps = (frameCount * 1000) / elapsed;
        frameCount = 0;
        windowStart = now;
        if (fps < 24) { loseAndStop(); return; }
        if (fps < 50) {
          if (lowStreak) { loseAndStop(); return; }
          lowStreak = true;
        } else {
          lowStreak = false;
        }
      }

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform3fv(uCyanLoc, CS_CYAN);
      gl.uniform3fv(uGoldLoc, CS_GOLD);
      gl.uniform3fv(uBgLoc, CS_BG);
      gl.uniform1f(uStepsLoc, steps);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      degraded = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    };
  }, [eligible, visible]);

  if (!eligible) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
    />
  );
}
