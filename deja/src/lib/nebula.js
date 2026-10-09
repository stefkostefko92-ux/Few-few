// „Мрежата на спомените“ — жив фон зад стъкления UI: всяка светеща точка е спомен,
// линиите са смисловите връзки помежду им. Докато търсиш, мрежата се свива към
// центъра (паметта „рови“); при резултати няколко спомена изплуват с бавно сияние.
//
// Canvas 2D, нула зависимости. Достъпност и производителност:
// - prefers-reduced-motion → ЕДИН статичен кадър, без цикъл (гейт преди старта);
// - настройка „Жив фон“ (WCAG 2.2.2) → същото: статика;
// - скрит таб/затворен popup → цикълът спира; DPR ≤ 2; спрайтове вместо градиенти;
// - сиянията са плавни (sin обвивка 1.6 сек, разредени ≥ 350 мс) — нула строб (WCAG 2.3.1).

const TAU = Math.PI * 2;
const LINK_BUCKETS = 6;
// движението е бавно — 30 кадъра/сек не се различават от 60, а цената е наполовина
const FRAME_MS = 1000 / 30;
// без мишка/клавиатура толкова време → мрежата замръзва (панелът стои отворен с
// часове докато четеш — постоянната анимация би харчила батерия за никого)
const IDLE_MS = 15000;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const lightScheme = matchMedia('(prefers-color-scheme: light)');

const PALETTES = {
  dark: {
    nodes: ['167,150,255', '94,234,212', '244,140,200'],
    aurora: ['124,92,255', '20,184,166', '219,70,180'],
    auroraAlpha: 0.3,
    link: '170,160,255',
    blend: 'lighter',
  },
  light: {
    nodes: ['98,78,230', '13,148,136', '214,60,150'],
    aurora: ['150,130,255', '45,212,191', '244,114,182'],
    auroraAlpha: 0.22,
    link: '88,70,210',
    blend: 'source-over',
  },
};

// предварително изрисувани светещи точки — drawImage е много по-евтино от градиент на кадър
function makeSprite(rgb) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${rgb},1)`);
  grad.addColorStop(0.18, `rgba(${rgb},0.85)`);
  grad.addColorStop(0.45, `rgba(${rgb},0.18)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

const rand = (a, b) => a + Math.random() * (b - a);

export function startNebula(canvas, { animate = true } = {}) {
  const ctx = canvas.getContext('2d');
  const noop = { focus() {}, surface() {}, setMemories() {}, setAnimate() {} };
  if (!ctx) return noop;

  let w = 0;
  let h = 0;
  let dpr = 1;
  let palette = PALETTES[lightScheme.matches ? 'light' : 'dark'];
  let sprites = palette.nodes.map(makeSprite);
  let nodes = [];
  let targetCount = 0;
  let flares = [];
  let focus = 0;
  let focusTarget = 0;
  let pointer = null;
  let raf = 0;
  let last = 0;
  let t = 0;
  let animateWanted = animate;
  let lastActivity = performance.now();
  const linkPaths = Array.from({ length: LINK_BUCKETS }, () => []);
  const blobs = [0, 1, 2].map((i) => ({
    color: i,
    ax: rand(0.15, 0.35),
    ay: rand(0.12, 0.3),
    fx: rand(0.03, 0.06),
    fy: rand(0.025, 0.05),
    p: rand(0, TAU),
  }));

  const moving = () => animateWanted && !reduceMotion.matches;

  function makeNode(fadeIn) {
    return {
      x: rand(0, w),
      y: rand(0, h),
      vx: rand(-9, 9),
      vy: rand(-7, 7),
      r: rand(0.9, 2.4),
      c: Math.random() < 0.62 ? 0 : Math.random() < 0.75 ? 1 : 2,
      f: rand(0.6, 1.5),
      p: rand(0, TAU),
      life: fadeIn ? 0 : 1, // 0→1 плавно появяване при нов спомен
      boost: 0,
    };
  }

  function areaMax() {
    return Math.max(18, Math.min(120, Math.round((w * h) / 9000)));
  }

  function resize() {
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    // фонът е мек — на големи страници се рисува в по-ниска вътрешна резолюция и
    // CSS го разтяга (растеризацията пада ~2.5×); малкият popup остава остър
    const big = w * h > 400_000;
    dpr = Math.min(window.devicePixelRatio || 1, 2) * (big ? 0.62 : 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!targetCount) targetCount = Math.round(areaMax() * 0.7);
    targetCount = Math.min(targetCount, areaMax());
    while (nodes.length < targetCount) nodes.push(makeNode(false));
    if (nodes.length > targetCount) nodes.length = targetCount;
    for (const n of nodes) {
      n.x = Math.min(n.x, w);
      n.y = Math.min(n.y, h);
    }
    if (!moving()) draw(0);
  }

  // Аврората е мека и бавна → рисува се в 1/6 резолюция и се разтяга с
  // изглаждане: пълноекранните градиенти бяха най-скъпата част от кадъра.
  const aurora = document.createElement('canvas');
  const actx = aurora.getContext('2d');
  const AURORA_SCALE = 6;

  function drawAurora() {
    const aw = Math.max(1, Math.ceil(w / AURORA_SCALE));
    const ah = Math.max(1, Math.ceil(h / AURORA_SCALE));
    if (aurora.width !== aw || aurora.height !== ah) {
      aurora.width = aw;
      aurora.height = ah;
    }
    actx.globalCompositeOperation = 'source-over';
    actx.clearRect(0, 0, aw, ah);
    actx.globalCompositeOperation = palette.blend;
    const R = Math.max(aw, ah) * 0.75;
    for (const b of blobs) {
      const x = aw * (0.5 + b.ax * Math.sin(t * b.fx * TAU + b.p));
      const y = ah * (0.4 + b.ay * Math.cos(t * b.fy * TAU + b.p * 1.3));
      const grad = actx.createRadialGradient(x, y, 0, x, y, R);
      const rgb = palette.aurora[b.color];
      const a = palette.auroraAlpha * (0.75 + 0.25 * focus);
      grad.addColorStop(0, `rgba(${rgb},${a})`);
      grad.addColorStop(0.55, `rgba(${rgb},${a * 0.25})`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      actx.fillStyle = grad;
      actx.fillRect(0, 0, aw, ah);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(aurora, 0, 0, w, h);
  }

  function draw(dt) {
    t += dt;
    focus += (focusTarget - focus) * Math.min(1, dt * 2.5);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    drawAurora();

    const cx = w / 2;
    const cy = h * 0.42;
    for (const n of nodes) {
      if (dt) {
        // търсене: паметта се свива към центъра; курсорът леко привлича спомените
        n.vx += (cx - n.x) * 0.06 * focus * dt;
        n.vy += (cy - n.y) * 0.06 * focus * dt;
        if (pointer) {
          const dx = pointer.x - n.x;
          const dy = pointer.y - n.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 160 * 160) {
            n.vx += dx * 0.35 * dt;
            n.vy += dy * 0.35 * dt;
          }
        }
        const speed = Math.hypot(n.vx, n.vy);
        const max = 14 + 40 * focus;
        if (speed > max) {
          n.vx *= max / speed;
          n.vy *= max / speed;
        }
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < -20) n.x = w + 20;
        else if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20;
        else if (n.y > h + 20) n.y = -20;
        n.life = Math.min(1, n.life + dt * 0.8);
      }
    }

    // връзки: смисловата мрежа — по-гъста и по-ярка, докато паметта търси.
    // Прозрачността се квантува в LINK_BUCKETS пакета → по един stroke() на пакет
    // вместо стотици отделни щрихи на кадър.
    const L = Math.min(150, Math.max(90, Math.min(w, h) * 0.32)) * (1 + 0.5 * focus);
    const L2 = L * L;
    const peak = 0.16 + 0.34 * focus;
    for (const path of linkPaths) path.length = 0;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > L2) continue;
        const k = 1 - Math.sqrt(d2) / L;
        const strength = k * k * Math.min(a.life, b.life);
        const bucket = Math.min(LINK_BUCKETS - 1, Math.floor(strength * LINK_BUCKETS));
        if (strength > 0.04) linkPaths[bucket].push(a.x, a.y, b.x, b.y);
      }
      if (pointer) {
        const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
        if (d < 140) {
          const strength = (1 - d / 140) * 1.4 * a.life;
          const bucket = Math.min(LINK_BUCKETS - 1, Math.floor(strength * LINK_BUCKETS));
          linkPaths[bucket].push(a.x, a.y, pointer.x, pointer.y);
        }
      }
    }
    ctx.globalCompositeOperation = palette.blend;
    ctx.lineWidth = 0.7;
    for (let bkt = 0; bkt < LINK_BUCKETS; bkt++) {
      const segs = linkPaths[bkt];
      if (!segs.length) continue;
      ctx.strokeStyle = `rgba(${palette.link},${((bkt + 0.5) / LINK_BUCKETS) * peak})`;
      ctx.beginPath();
      for (let s = 0; s < segs.length; s += 4) {
        ctx.moveTo(segs[s], segs[s + 1]);
        ctx.lineTo(segs[s + 2], segs[s + 3]);
      }
      ctx.stroke();
    }

    // сияния на изплуващите спомени: плавна sin обвивка, никога рязко
    const now = performance.now();
    flares = flares.filter((f) => now - f.t0 < 1600);
    for (const n of nodes) n.boost = 0;
    for (const f of flares) {
      const p = Math.max(0, (now - f.t0) / 1600);
      const env = Math.sin(Math.PI * p);
      f.node.boost = Math.max(f.node.boost, env);
      ctx.strokeStyle = `rgba(${palette.nodes[f.node.c]},${0.4 * (1 - p)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(f.node.x, f.node.y, 4 + 34 * p, 0, TAU);
      ctx.stroke();
    }

    for (const n of nodes) {
      const tw = 0.55 + 0.45 * Math.sin(t * n.f + n.p);
      const glow = (0.45 + 0.55 * tw) * n.life * (1 + n.boost * 1.6);
      const size = (n.r * 9 + n.boost * 26) * (0.85 + 0.15 * tw);
      ctx.globalAlpha = Math.min(1, glow);
      ctx.drawImage(sprites[n.c], n.x - size / 2, n.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(ts) {
    if (ts - lastActivity > IDLE_MS && focusTarget === 0 && !flares.length) {
      raf = 0; // заспива с последния кадър на екрана; събужда се от wake()
      return;
    }
    raf = requestAnimationFrame(frame);
    if (last && ts - last < FRAME_MS - 2) return;
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    draw(dt);
  }

  function start() {
    if (raf || !moving() || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function refreshMode() {
    if (moving()) start();
    else {
      stop();
      draw(0); // статичен кадър — reduced-motion/изключен „Жив фон“
    }
  }

  function wake() {
    lastActivity = performance.now();
    start();
  }

  window.addEventListener('resize', resize, { passive: true });
  for (const type of ['pointerdown', 'keydown', 'wheel', 'focus']) {
    window.addEventListener(type, wake, { passive: true });
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reduceMotion.addEventListener('change', refreshMode);
  lightScheme.addEventListener('change', () => {
    palette = PALETTES[lightScheme.matches ? 'light' : 'dark'];
    sprites = palette.nodes.map(makeSprite);
    if (!moving()) draw(0);
  });
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer = { x: e.clientX, y: e.clientY };
      wake();
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => (pointer = null));

  resize();
  refreshMode();

  return {
    // паметта „рови“ — мрежата се свива и връзките светват
    focus(on) {
      focusTarget = on ? 1 : 0;
      wake();
      if (!moving()) draw(0);
    },
    // n спомена изплуват — разредени ≥ 350 мс (под 3 събития/сек)
    surface(n) {
      if (!moving() || !nodes.length) return;
      wake();
      const picks = [...nodes].sort(() => Math.random() - 0.5).slice(0, Math.min(n, 6));
      picks.forEach((node, i) => {
        setTimeout(() => flares.push({ node, t0: performance.now() }), i * 350);
      });
    },
    // броят точки следва реалния брой спомени върху „прах“ (~40% от тавана за
    // площта) — иначе с 5 спомена мрежата е по-рядка от празната welcome страница
    setMemories(count) {
      const dust = Math.max(14, Math.round(areaMax() * 0.4));
      targetCount = Math.min(areaMax(), dust + count);
      while (nodes.length < targetCount) nodes.push(makeNode(moving()));
      if (nodes.length > targetCount) nodes.length = targetCount;
      if (!moving()) draw(0);
    },
    setAnimate(on) {
      animateWanted = on;
      refreshMode();
    },
  };
}
