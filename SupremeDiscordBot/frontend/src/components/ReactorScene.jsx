// frontend/src/components/ReactorScene.jsx — 3D токсичният реактор зад героя на началната страница.
//
// „Токсична броня“ (собственикът, 28.11.2026): илюстрациите са 3D (three.js, в бъндъла, без CDN),
// никога SVG. Този файл се зарежда САМО лениво от HeroReactor — таблото и останалите страници
// не плащат нищо. Цветовете са от палитрата (lime, gold, cream, нитовете), нищо ново.
//
// Сцената: светещо ядро (жичен икосаедър + горещо вътрешно ядро + ореол), три пръстена от
// метал и злато, два роя частици, които кръжат бавно. Движението е бавно и непрекъснато —
// пулсът на ореола е ~0.2 Hz (WCAG 2.3.1: далеч под 3 проблясвания/с), без мигане.
// Спира се, когато не се вижда (IntersectionObserver) или подразделът е скрит.
import { useEffect, useRef } from "react";
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Points, Sprite,
  IcosahedronGeometry, TorusGeometry, BufferGeometry, Float32BufferAttribute,
  MeshBasicMaterial, MeshStandardMaterial, PointsMaterial, SpriteMaterial,
  PointLight, AmbientLight, CanvasTexture, AdditiveBlending,
} from "three";

const LIME = 0x8fe600;
const GOLD = 0xf0c24c;
const CREAM = 0xf0f0eb;
const RIVET = 0x5b6f55;
const PANEL = 0x0b1a17;

/** Мека кръгла текстура за ореола и частиците (рисувана на canvas, не SVG). */
function glowTexture(stops) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, color] of stops) r.addColorStop(at, color);
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

/** Рой частици в сферичен слой между rMin и rMax (детерминистичен — еднакъв при всяко зареждане). */
function swarm(count, rMin, rMax, seed) {
  let s = seed >>> 0;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = rMin + rnd() * (rMax - rMin);
    const th = rnd() * Math.PI * 2;
    const y = (rnd() - 0.5) * 1.6; // сплеснат пояс, не топка
    pos[i * 3] = Math.cos(th) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(th) * r;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return geo;
}

export default function ReactorScene({ className = "" }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let renderer;
    try {
      renderer = new WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power" });
    } catch {
      return undefined; // без WebGL — героят си остава с картинката, нищо не се чупи
    }
    const small = host.clientWidth < 420;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.5));
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    host.appendChild(canvas);

    const scene = new Scene();
    const camera = new PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.6, 10);

    const disposables = [];
    const keep = (x) => { disposables.push(x); return x; };

    // Ореол — адитивен спрайт зад ядрото.
    const haloMat = keep(new SpriteMaterial({
      map: keep(glowTexture([[0, "rgba(240, 240, 235, 0.95)"], [0.18, "rgba(143, 230, 0, 0.55)"], [0.55, "rgba(143, 230, 0, 0.12)"], [1, "rgba(143, 230, 0, 0)"]])),
      blending: AdditiveBlending, depthWrite: false, transparent: true,
    }));
    const halo = new Sprite(haloMat);
    halo.scale.set(6.5, 6.5, 1);
    scene.add(halo);

    // Ядрото: жичен икосаедър + горещо вътрешно ядро.
    const core = new Mesh(keep(new IcosahedronGeometry(1.15, 1)), keep(new MeshBasicMaterial({ color: LIME, wireframe: true, transparent: true, opacity: 0.9 })));
    const hot = new Mesh(keep(new IcosahedronGeometry(0.62, 0)), keep(new MeshBasicMaterial({ color: CREAM })));
    scene.add(core, hot);

    // Пръстените — метал (цветът на нитовете) и злато, осветени от ядрото.
    scene.add(new PointLight(LIME, 40, 22, 1.6));
    scene.add(new AmbientLight(PANEL, 6));
    const steel = keep(new MeshStandardMaterial({ color: RIVET, metalness: 0.9, roughness: 0.32, emissive: PANEL }));
    const gold = keep(new MeshStandardMaterial({ color: GOLD, metalness: 0.95, roughness: 0.28 }));
    const rings = new Group();
    const r1 = new Mesh(keep(new TorusGeometry(2.35, 0.07, 10, 120)), steel); r1.rotation.x = 1.25;
    const r2 = new Mesh(keep(new TorusGeometry(2.85, 0.045, 10, 120)), gold); r2.rotation.set(0.35, 1.05, 0);
    const r3 = new Mesh(keep(new TorusGeometry(3.35, 0.035, 10, 140)), steel); r3.rotation.set(-0.6, 0.4, 0.2);
    rings.add(r1, r2, r3);
    scene.add(rings);

    // Два роя: лаймов (много) и златен (малко) — кръжат с различна скорост.
    const dot = keep(glowTexture([[0, "rgba(240, 240, 235, 1)"], [0.3, "rgba(143, 230, 0, 0.9)"], [1, "rgba(143, 230, 0, 0)"]]));
    const goldDot = keep(glowTexture([[0, "rgba(240, 240, 235, 1)"], [0.3, "rgba(240, 194, 76, 0.9)"], [1, "rgba(240, 194, 76, 0)"]]));
    const limeSwarm = new Points(keep(swarm(small ? 260 : 620, 2.1, 4.4, 0x9e3779b9)),
      keep(new PointsMaterial({ size: small ? 0.11 : 0.09, map: dot, transparent: true, depthWrite: false, blending: AdditiveBlending })));
    const goldSwarm = new Points(keep(swarm(small ? 40 : 90, 2.6, 3.9, 0x85ebca6b)),
      keep(new PointsMaterial({ size: small ? 0.14 : 0.12, map: goldDot, transparent: true, depthWrite: false, blending: AdditiveBlending })));
    scene.add(limeSwarm, goldSwarm);

    // Размер — по кутията; платното е 1:1 с нея.
    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(host);

    // Лек паралакс по мишката (само там, където има мишка).
    let mx = 0, my = 0;
    const onMove = (e) => {
      const r = host.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      my = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    // Рисува само докато се вижда.
    let visible = true;
    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); }, { threshold: 0 })
      : null;
    io?.observe(host);

    let raf = 0;
    let last = performance.now();
    let t = 0;
    function loop() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame((now) => {
        if (!visible || document.hidden) return; // спира; IntersectionObserver/visibilitychange го пускат пак
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt;
        core.rotation.x += dt * 0.25; core.rotation.y += dt * 0.35;
        hot.rotation.y -= dt * 0.5;
        r1.rotation.z += dt * 0.22; r2.rotation.z -= dt * 0.15; r3.rotation.z += dt * 0.1;
        limeSwarm.rotation.y += dt * 0.08; goldSwarm.rotation.y -= dt * 0.05;
        const pulse = 1 + Math.sin(t * 1.25) * 0.06; // ~0.2 Hz
        halo.scale.set(6.5 * pulse, 6.5 * pulse, 1);
        camera.position.x += (mx * 0.6 - camera.position.x) * 0.04;
        camera.position.y += (0.6 - my * 0.4 - camera.position.y) * 0.04;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
        loop();
      });
    }
    const onVis = () => { if (!document.hidden) { last = performance.now(); loop(); } };
    document.addEventListener("visibilitychange", onVis);
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      for (const d of disposables) d.dispose?.();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={hostRef} aria-hidden="true" className={className} />;
}
