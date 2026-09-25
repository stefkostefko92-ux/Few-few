import { useEffect, useRef } from "react";
import { HALL_FRAG, HALL_VERT } from "./hallShader";
import { FOG_LINEAR, TONES, type RavenTone } from "./palette";
import { createGovernor, initialPixelCap } from "./governor";

interface Props {
  tone: RavenTone;
  /** Reduced motion: draw a single static frame, no animation, static grain. */
  reduced: boolean;
  /** Called once with whether the WebGL hall is live (false → CSS fallback). */
  onStatus?: (live: boolean) => void;
}

/** Frame interval for the ambient loop: slow motion (flicker, embers, dust)
 *  reads identically at 30 fps and halves the cost next to a 3D game. */
const FRAME_MS = 1000 / 30;
/** A still frame sits at a representative moment (embers mid-flight). */
const STILL_TIME = 3.7;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn("Ravenhold hall: shader compile failed", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

/**
 * The Рейвънхолд castle hall behind every game table (see hallShader.ts). Pure
 * WebGL2 — no three.js — so the 2D card games stay light. Degrades to the CSS
 * room if WebGL2 is unavailable, the shader fails or the context is lost.
 */
export function HallBackdrop({ tone, reduced, onStatus }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      statusRef.current?.(false);
      return;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, HALL_VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, HALL_FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) {
      statusRef.current?.(false);
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("Ravenhold hall: link failed", gl.getProgramInfoLog(prog));
      statusRef.current?.(false);
      return;
    }
    gl.useProgram(prog);

    // One oversized triangle covers the viewport (no diagonal seam, 3 verts).
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u("uRes"), uTime = u("uTime");
    const light = TONES[tone];
    gl.uniform3f(u("uFire"), light.fire[0], light.fire[1], light.fire[2]);
    gl.uniform1f(u("uFireAmt"), light.fireAmt);
    gl.uniform3f(u("uMoon"), light.moon[0], light.moon[1], light.moon[2]);
    gl.uniform1f(u("uMoonAmt"), light.moonAmt);
    gl.uniform3f(u("uFog"), FOG_LINEAR[0], FOG_LINEAR[1], FOG_LINEAR[2]);
    gl.uniform1f(u("uExposure"), 2.1);
    gl.uniform1f(u("uGrain"), 0.03);

    const coarse = matchMedia("(pointer: coarse)").matches;
    const cap = initialPixelCap(coarse, Math.min(screen.width, screen.height));
    gl.uniform1f(u("uEmbers"), coarse ? 6 : 10);
    const governor = createGovernor();

    let cssW = 0, cssH = 0;
    const resize = () => {
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5);
      const k = dpr * cap * governor.scale;
      const w = Math.max(1, Math.round(cssW * k));
      const h = Math.max(1, Math.round(cssH * k));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };

    const t0 = performance.now();
    const draw = (now: number) => {
      gl.uniform1f(uTime, reduced ? STILL_TIME : (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let raf = 0, last = 0, lastTick = 0, lost = false;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (lastTick && governor.sample(now - lastTick, now)) resize();
      lastTick = now;
      if (now - last < FRAME_MS) return;
      last = now;
      draw(now);
    };
    const start = () => {
      if (lost || raf || document.hidden) return;
      if (reduced) {
        draw(performance.now());
        return;
      }
      governor.reset(performance.now());
      lastTick = 0;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      cssW = r.width;
      cssH = r.height;
      resize();
      if (reduced || !raf) draw(performance.now());
    });
    ro.observe(host);
    const onVis = () => (document.hidden ? stop() : start());
    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      stop();
      statusRef.current?.(false);
    };
    document.addEventListener("visibilitychange", onVis);
    canvas.addEventListener("webglcontextlost", onLost);
    statusRef.current?.(true);
    start();

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [tone, reduced]);

  // A lost/released context cannot be re-acquired on the same element, so a
  // tone or motion change mounts a fresh canvas.
  return <canvas key={`${tone}-${reduced}`} ref={ref} className="raven-hall" aria-hidden="true" />;
}
