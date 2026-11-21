'use client';

import { useEffect, useRef } from 'react';

// Суров WebGL2 (без библиотеки): течен иридесцентен хром.
//
// Как работи: един фрагментен шейдър върху триъгълник, покриващ екрана.
//  1. Височинно поле h(x,y,t) = fBm с двойно domain warping (iq): шумът се
//     подава сам на себе си и дава вити „течни“ гънки.
//  2. Нормалата идва от dFdx/dFdy на h (без допълнителни семплове).
//  3. Хром = отражение на студийна среда (хоризонтни ивици) по нормалата;
//     иридесценцията = тънък филм, фаза ndv + h → рампа розово → виолет →
//     кобалт → лайм → циан.
//  4. Курсорът е гравитационна издутина с пулсиращ пръстен; скролът влачи
//     полето нагоре (uScroll).
// Подредба: стартира СЛЕД първото рисуване (LCP е текстът на hero-то), спира
// при скрит таб / извън екрана / пауза, DPR ≤ 1,5, динамично намалява
// разделителната способност, а при трайно <20 fps се срива към CSS fallback-а.

const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uBump;
uniform float uScroll;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
const mat2 M = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = M * p;
    a *= 0.5;
  }
  return s;
}
float field(vec2 p, float t) {
  vec2 q = vec2(fbm(p + vec2(0.0, 0.11 * t)), fbm(p + vec2(5.2, 1.3) - 0.07 * t));
  vec2 r = vec2(fbm(p + 2.6 * q + vec2(1.7, 9.2) + 0.16 * t),
                fbm(p + 2.6 * q + vec2(8.3, 2.8) - 0.12 * t));
  return fbm(p + 2.4 * r + vec2(0.0, uScroll * 1.4));
}
vec3 ramp(float x) {
  vec3 pink = vec3(1.0, 0.176, 0.584);
  vec3 vio = vec3(0.478, 0.169, 1.0);
  vec3 cob = vec3(0.169, 0.231, 1.0);
  vec3 cyan = vec3(0.16, 0.88, 1.0);
  vec3 lime = vec3(0.84, 1.0, 0.24);
  x = fract(x) * 5.0;
  vec3 c = mix(pink, vio, smoothstep(0.0, 1.0, x));
  c = mix(c, cob, smoothstep(1.0, 2.0, x));
  c = mix(c, cyan, smoothstep(2.0, 3.0, x));
  c = mix(c, lime, smoothstep(3.0, 4.0, x));
  c = mix(c, pink, smoothstep(4.0, 5.0, x));
  return c;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  float h = field(uv * 1.9, t);

  vec2 m = (uMouse - 0.5 * uRes) / uRes.y;
  float d = length(uv - m);
  h += uBump * 0.2 * exp(-d * d * 7.0) * (0.65 + 0.35 * sin(d * 24.0 - t * 1.6));

  vec2 g = vec2(dFdx(h), dFdy(h)) * uRes.y;
  vec3 n = normalize(vec3(-g * 0.8, 1.0));
  float ndv = clamp(n.z, 0.0, 1.0);
  vec3 refl = reflect(vec3(0.0, 0.0, -1.0), n);

  // студийна среда: ярка ивица на хоризонта между тъмни полета
  float e = refl.y * 0.5 + 0.5 + 0.12 * sin(refl.x * 4.0 + t * 0.2);
  float band = smoothstep(0.36, 0.5, e) - 0.75 * smoothstep(0.56, 0.72, e);
  vec3 chromeCol = mix(vec3(0.015, 0.01, 0.04), vec3(0.95, 0.93, 1.0), clamp(band, 0.0, 1.0));

  float film = ndv * 1.7 + h * 1.9 + t * 0.025;
  vec3 irid = ramp(film);

  float rim = pow(1.0 - ndv, 0.7);
  vec3 col = mix(irid * 0.5, chromeCol * (0.55 + 0.45 * irid), clamp(0.3 + 0.7 * rim, 0.0, 1.0));
  vec3 L = normalize(vec3(-0.45, 0.65, 0.6));
  col += vec3(1.0) * pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 36.0) * 0.8;
  col += irid * pow(1.0 - ndv, 3.0) * 0.55;

  col *= 0.55 + 0.9 * smoothstep(0.15, 0.7, h);
  col *= 1.0 - 0.3 * dot(uv, uv);
  outColor = vec4(pow(max(col, 0.0), vec3(0.92)), 1.0);
}`;

export function LxShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // без WebGL2 или при спестяване на данни остава CSS fallback-ът
    if (window.matchMedia('(prefers-reduced-data: reduce)').matches) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    const start = () => {
      if (disposed) return;
      const gl = canvas.getContext('webgl2', {
        antialias: false,
        alpha: false,
        depth: false,
        stencil: false,
        powerPreference: 'default',
      });
      if (!gl) return;

      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
      };
      const vs = compile(gl.VERTEX_SHADER, VERT);
      const fs = compile(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return;
      const program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
      gl.useProgram(program);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      const uRes = gl.getUniformLocation(program, 'uRes');
      const uTime = gl.getUniformLocation(program, 'uTime');
      const uMouse = gl.getUniformLocation(program, 'uMouse');
      const uBump = gl.getUniformLocation(program, 'uBump');
      const uScroll = gl.getUniformLocation(program, 'uScroll');

      let scale = 0.8; // дял от CSS пикселите × DPR (глаткото поле не иска повече)
      let w = 0;
      let h = 0;
      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const nw = Math.max(2, Math.round(canvas.clientWidth * dpr * scale));
        const nh = Math.max(2, Math.round(canvas.clientHeight * dpr * scale));
        if (nw !== w || nh !== h) {
          w = nw;
          h = nh;
          canvas.width = w;
          canvas.height = h;
          gl.viewport(0, 0, w, h);
        }
      };

      let time = 0;
      let last = 0;
      let raf = 0;
      let inView = true;
      let motionOn = true;
      let mouseX = 0.5;
      let mouseY = 0.5;
      let tx = 0.5;
      let ty = 0.5;
      let bump = 0;
      let bumpTarget = 0;
      let firstFrame = true;
      const frames: number[] = [];
      let cuts = 0;

      const draw = () => {
        resize();
        const scroll = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 2);
        gl.uniform2f(uRes, w, h);
        gl.uniform1f(uTime, time);
        gl.uniform2f(uMouse, mouseX * w, (1 - mouseY) * h);
        gl.uniform1f(uBump, bump);
        gl.uniform1f(uScroll, scroll);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (firstFrame) {
          firstFrame = false;
          canvas.classList.add('is-live');
        }
      };

      // `dead`: шейдърът е изключен завинаги (сторожът или изгубен контекст). Без този флаг всеки
      // sync() (видимост, скрол, пауза) рестартира цикъла върху изгубения контекст — безкрайни
      // празни кадри точно на слабите устройства, които сторожът е трябвало да пощади.
      let dead = false;
      const teardown = () => {
        dead = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        canvas.classList.remove('is-live');
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      };

      const frame = (now: number) => {
        raf = 0;
        if (disposed) return;
        const dt = Math.min((now - last) / 1000, 0.1);
        const ms = now - last;
        last = now;
        time += dt;
        mouseX += (tx - mouseX) * 0.06;
        mouseY += (ty - mouseY) * 0.06;
        bump += (bumpTarget - bump) * 0.05;
        draw();

        // сторожът на кадрите: трайно бавно → първо по-малка резолюция,
        // после отказ от шейдъра (CSS градиентът остава)
        frames.push(ms);
        if (frames.length >= 45) {
          const sorted = [...frames].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)];
          frames.length = 0;
          if (median > 42) {
            if (scale > 0.45) {
              scale = Math.max(0.4, scale * 0.7);
              cuts += 1;
            } else {
              teardown();
              return;
            }
          } else if (cuts > 0 && median > 34 && scale <= 0.45) {
            teardown();
            return;
          }
        }
        schedule();
      };

      const shouldRun = () => !dead && inView && motionOn && !document.hidden;
      const schedule = () => {
        if (!raf && shouldRun() && !disposed) {
          last = performance.now();
          raf = requestAnimationFrame(frame);
        }
      };
      const sync = () => {
        if (shouldRun()) {
          schedule();
        } else if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
          frames.length = 0;
        }
      };

      draw(); // първият кадър винаги, дори при пауза (статичен „плакат“)
      sync();

      const onMotion = (event: Event) => {
        motionOn = (event as CustomEvent<{ on: boolean }>).detail.on;
        sync();
      };
      const onVisibility = () => sync();
      const onPointer = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;
        tx = (event.clientX - rect.left) / rect.width;
        ty = (event.clientY - rect.top) / rect.height;
        bumpTarget = ty >= 0 && ty <= 1 && tx >= 0 && tx <= 1 ? 1 : 0;
      };
      const onLeave = () => {
        bumpTarget = 0;
      };
      const onLost = (event: Event) => {
        event.preventDefault();
        dead = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        canvas.classList.remove('is-live');
      };
      const observer = new IntersectionObserver(
        (entries) => {
          inView = entries[0]?.isIntersecting ?? true;
          sync();
        },
        { threshold: 0 },
      );
      observer.observe(canvas);
      const resizeObserver = new ResizeObserver(() => {
        if (dead) return;
        if (!shouldRun()) draw();
      });
      resizeObserver.observe(canvas);

      window.addEventListener('lx:motion', onMotion);
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pointermove', onPointer, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
      canvas.addEventListener('webglcontextlost', onLost);

      cleanup = () => {
        if (raf) cancelAnimationFrame(raf);
        observer.disconnect();
        resizeObserver.disconnect();
        window.removeEventListener('lx:motion', onMotion);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pointermove', onPointer);
        document.documentElement.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('webglcontextlost', onLost);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      };
    };

    // след първото рисуване: два rAF + празен ход
    let timer = 0;
    const first = requestAnimationFrame(() => {
      timer = window.setTimeout(start, 120);
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(first);
      window.clearTimeout(timer);
      cleanup?.();
    };
  }, []);

  return <canvas ref={canvasRef} className="lx-canvas" aria-hidden />;
}
