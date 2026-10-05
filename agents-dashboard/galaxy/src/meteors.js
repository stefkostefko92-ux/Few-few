// meteors.js — редки метеори през фона (декоративен слой, независим от галактическата структура).
// spawnMeteor е чист (връща обект); drawMeteors мутира ctx + масива подаден отвън.
export function spawnMeteor(W, H, rand = Math.random) {
  const sp = 7 + rand() * 6;
  const dir = (rand() < 0.5 ? 0.34 : 0.66) * Math.PI + (rand() - 0.5) * 0.28;
  return {
    x: rand() * W,
    y: -20 - rand() * H * 0.15,
    vx: Math.cos(dir) * sp,
    vy: Math.abs(Math.sin(dir)) * sp + 3,
    life: 1,
    len: 8 + rand() * 9,
  };
}

/** Стъпва и чертае метеорите на място; премахва мъртвите/извън екрана. Не тръгва под reduced-motion
 *  (auto-loop без спиране би нарушило WCAG 2.2.2 — тук просто няма движение, не пауза бутон, защото
 *  под reduced-motion кадърът е статичен изобщо, виж index.html RM пътя). */
export function stepAndDrawMeteors(ctx, meteors, W, H) {
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.x += m.vx; m.y += m.vy; m.life -= 0.014;
    if (m.life <= 0 || m.y > H + 60 || m.x < -60 || m.x > W + 60) { meteors.splice(i, 1); continue; }
    const tx = m.x - m.vx * m.len, ty = m.y - m.vy * m.len, al = Math.min(1, m.life * 1.4);
    const g = ctx.createLinearGradient(tx, ty, m.x, m.y);
    g.addColorStop(0, "rgba(220,240,255,0)");
    g.addColorStop(1, `rgba(225,242,255,${al})`);
    ctx.strokeStyle = g; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(m.x, m.y); ctx.stroke();
    const hg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 6);
    hg.addColorStop(0, `rgba(255,255,255,${al})`);
    hg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(m.x, m.y, 6, 0, 6.28); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}
