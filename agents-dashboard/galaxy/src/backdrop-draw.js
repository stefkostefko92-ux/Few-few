// backdrop-draw.js — canvas 2D рисуване на фоновия слой (`#sky`): снимката на галактиката,
// амбиентните мъглявини, финият звезден прах и метеорите. Извиква се ПРЕДИ звездите-агенти/
// нишките (index.html ги рисува отгоре, непроменени). Малки, чисти функции — не носят собствено
// състояние освен подаденото.
//
// РЕШАВАЩ КРЪГ (собственика, 2026-09-25): тъмните прашни ленти/наклонът(TILT)/звездният ореол/
// далечните фонови галактики от предишния опит излязоха по-бедни от изпитания вид (виж shaders.js)
// и отпаднаха заедно с него — само снимка + амбиентна мъглявина + фин прах, точно както преди.

export function hex(c, a) {
  const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function drawGalaxyPhoto(ctx, W, H, cx, cy, R, img, cleanImg, ready, { zoom, gal, reducedMotion, gx = 0, gy = 0 }) {
  ctx.fillStyle = "#00020a";
  ctx.fillRect(0, 0, W, H);
  if (ready) {
    const src = cleanImg || img;
    const iw = img.naturalWidth, ih = img.naturalHeight, diag = Math.hypot(W, H);
    const scale = Math.max(diag / iw, diag / ih) * 1.02 * zoom, dw = iw * scale, dh = ih * scale;
    ctx.save();
    ctx.translate(cx - (reducedMotion ? 0 : gx) * R * 0.045, cy - (reducedMotion ? 0 : gy) * R * 0.045);
    if (!reducedMotion) ctx.rotate(gal * 0.9);
    // Обсидиан грейд на снимката (собственика, 2026-11-14): десатурация + притъмняване + контраст,
    // за да напусне NGC 4414 своето виолетово-топло и да чете като студен обсидиан. ctx.filter е
    // част от запазеното състояние — нулира се на restore(); ако средата не го поддържа, се пренебрегва.
    ctx.filter = "saturate(0.5) brightness(0.84) contrast(1.08)";
    ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
  // Пренасочване на тона към студен обсидиан: blend „color" взема ХРОМАТА на запълването, но пази
  // ЛУМИНАНЦИЯТА на снимката — така виолетово-топлото на NGC 4414 става студено синьо-тюркоазено,
  // без да зависи от поддръжката на ctx.filter (по-надеждно от десатурацията по-горе). После воал
  // и притъмняване за дълбочина.
  ctx.globalCompositeOperation = "color";
  ctx.globalAlpha = 0.62;
  ctx.fillStyle = "#0b2a3e";
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(7,16,28,.26)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,2,10,.42)";
  ctx.fillRect(0, 0, W, H);
  // Кинематографична виньетка (3 спирки) — по-дълбока и по-студена за обсидиановата рамка.
  const v = ctx.createRadialGradient(cx, cy, R * 0.10, cx, cy, Math.max(W, H) * 0.74);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(0.62, "rgba(1,3,10,.34)");
  v.addColorStop(1, "rgba(0,1,7,.88)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

export function drawAmbientNebulae(ctx, nebulae, cx, cy, R, t, reducedMotion, gx = 0, gy = 0) {
  ctx.globalCompositeOperation = "lighter";
  for (const n of nebulae) {
    const x = cx + n.nx * R * 1.3 + (reducedMotion ? 0 : Math.sin(t * 0.12 + n.ph) * R * 0.05 + gx * R * 0.02);
    const y = cy + n.ny * R * 1.3 + (reducedMotion ? 0 : Math.cos(t * 0.1 + n.ph) * R * 0.04 + gy * R * 0.02);
    const rr = n.r * R * (1 + (reducedMotion ? 0 : Math.sin(t * 0.18 + n.ph) * 0.06));
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, hex(n.c, 0.2));
    g.addColorStop(0.5, hex(n.c, 0.08));
    g.addColorStop(1, hex(n.c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, 6.28);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

export function drawFineDust(ctx, dust, cx, cy, R, t, gx, gy, reducedMotion) {
  ctx.globalCompositeOperation = "lighter";
  for (const s of dust) {
    const px = cx + s.nx * R * 1.5 + gx * s.d * 28 + (reducedMotion ? 0 : Math.sin(t * 0.05 * s.d + s.ph) * 3);
    const py = cy + s.ny * R * 1.5 + gy * s.d * 28;
    const tw = reducedMotion ? 0.8 : 0.5 + 0.5 * Math.sin(t * s.tw + s.ph);
    const a = (0.22 + 0.62 * tw) * (0.4 + s.d * 0.6);
    ctx.fillStyle = s.warm ? `rgba(255,226,180,${a})` : `rgba(202,226,255,${a})`;
    ctx.beginPath();
    ctx.arc(px, py, s.r * (0.7 + tw * 0.5), 0, 6.28);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}
