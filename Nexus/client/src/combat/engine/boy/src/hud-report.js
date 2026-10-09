// 4a.3 (Nexus порт, НЕ част от оригиналния boy) — изнесено от main.js/frame(), за да остане
// под лимита от 300 реда (закон #1). Чисто извеждане на HUD/стат данните всеки кадър — никаква
// собствена логика, само форматира вече изчисленото състояние.
export function reportFrame(ctx) {
  const {
    hud, showStats, perf, now, dtMs, internal, out, qualityMode, tier, backend,
    renderer, CAPTIONS, CHAPTERS, T, realDuration, free, director, clock, ts, DURATION, realTimeOf,
  } = ctx;
  if (dtMs > 0 && dtMs < 250) {
    perf.fps = perf.fps * 0.94 + (1000 / dtMs) * 0.06;
    perf.ms = perf.ms * 0.94 + dtMs * 0.06;
  }
  if (showStats && now - perf.statsAt > 250) {
    perf.statsAt = now;
    const r = renderer.info.render;
    hud.stats({
      fps: perf.fps, ms: perf.ms, w: internal.x, h: internal.y,
      pct: Math.round((internal.x / out.x) * 100), calls: r.drawCalls, tris: r.triangles,
      tier: qualityMode === 'auto' ? `auto · ${tier}` : tier, backend,
    });
  }
  const cap = CAPTIONS.find((c) => T >= c.t && T < c.t + c.d);
  let chapter = CHAPTERS[0].k;
  for (const c of CHAPTERS) if (T >= c.t) chapter = c.k;
  hud.update({
    progress: realTimeOf(T) / realDuration,
    realTime: realTimeOf(T),
    shot: free ? 0 : director.state.shot,
    shotCount: director.shotCount,
    lens: free ? 35 : director.state.lensMM,
    fstop: free ? 4 : director.state.fstop,
    timeScale: clock.playing ? ts : 0,
    speed: clock.speed,
    fps: perf.fps,
    caption: cap ? cap.k : '',
    chapter,
    end: T > DURATION - 4.5 && T < DURATION - 0.15,
  });
}
