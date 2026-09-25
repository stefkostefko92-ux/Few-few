import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutLabels, rectToCapsule } from "../src/labels.js";

function overlaps(a, b) {
  // AABB тест (center ± half-extent) — правоъгълниците се вписват в кръговете, които
  // layoutLabels раздалечава, значи ТУК не бива никога да намерим застъпване.
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}
function assertNoOverlap(items, solved, msg) {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = { x: solved[i].x, y: solved[i].y, w: items[i].w, h: items[i].h };
      const b = { x: solved[j].x, y: solved[j].y, w: items[j].w, h: items[j].h };
      assert.ok(!overlaps(a, b), `${msg}: етикети ${i} и ${j} се застъпват`);
    }
  }
}
function assertInBounds(items, solved, viewport, msg) {
  for (let i = 0; i < solved.length; i++) {
    const p = solved[i], hw = items[i].w / 2, hh = items[i].h / 2;
    assert.ok(p.x - hw >= -0.01 && p.x + hw <= viewport.width + 0.01, `${msg}: етикет ${i} излиза хоризонтално от кадъра`);
    assert.ok(p.y - hh >= -0.01 && p.y + hh <= viewport.height + 0.01, `${msg}: етикет ${i} излиза вертикално от кадъра`);
  }
}

// Симулира най-лошия случай на струпване на 390px телефон: 28 агента (реален брой в таблото),
// всичките "показани" (тестваме самия алгоритъм, не touch-hide бизнес логиката отгоре) накуп
// около центъра на екрана — точно сценарият от собственика: "имената на агентите се застъпват".
test("layoutLabels: 28 етикета накуп на 390px телефон — нула застъпване, всички в кадъра", () => {
  const viewport = { width: 390, height: 844 };
  const N = 28;
  const items = Array.from({ length: N }, (_, i) => {
    const ang = (i / N) * 6.28 + i * 0.7;
    const r = 30 + (i % 5) * 14; // много близки идеални позиции — нарочно струпани
    return {
      x: viewport.width / 2 + Math.cos(ang) * r,
      y: viewport.height / 2 + Math.sin(ang) * r * 0.6,
      w: 40 + (i % 6) * 8, // реалистична ширина на етикет (кратко/дълго име)
      h: 19,
      weight: i === 0 ? 8 : 1 + (i % 4),
    };
  });
  const solved = layoutLabels(items, viewport);
  assertNoOverlap(items, solved, "390px");
  assertInBounds(items, solved, viewport, "390px");
});

test("layoutLabels: 28 етикета на 360px телефон — нула застъпване, всички в кадъра", () => {
  const viewport = { width: 360, height: 740 };
  const N = 28;
  const items = Array.from({ length: N }, (_, i) => ({
    x: viewport.width / 2 + ((i * 37) % 60) - 30,
    y: viewport.height / 2 + ((i * 53) % 60) - 30,
    w: 36 + (i % 7) * 9,
    h: 19,
    weight: 1,
  }));
  const solved = layoutLabels(items, viewport);
  assertNoOverlap(items, solved, "360px");
  assertInBounds(items, solved, viewport, "360px");
});

test("layoutLabels: президентът (тегло 8) се мести по-малко от нископриоритетен съсед (тегло 1)", () => {
  const viewport = { width: 390, height: 844 };
  const items = [
    { x: 195, y: 400, w: 60, h: 19, weight: 8 },
    { x: 205, y: 400, w: 60, h: 19, weight: 1 },
  ];
  const solved = layoutLabels(items, viewport);
  const movedA = Math.hypot(solved[0].x - items[0].x, solved[0].y - items[0].y);
  const movedB = Math.hypot(solved[1].x - items[1].x, solved[1].y - items[1].y);
  assert.ok(movedA < movedB, `по-тежкото трябва да се мести по-малко (${movedA} vs ${movedB})`);
});

test("layoutLabels: етикет не остава зад непреместваема пречка (obstacleRects) — реалистичен размер/позиция", () => {
  const viewport = { width: 390, height: 844 };
  const obstacleRect = { x: 20, y: 30, w: 90, h: 40 }; // реалистична пречка (напр. заглавната кутия на телефон)
  const items = [{ x: 60, y: 45, w: 70, h: 19, weight: 1 }]; // идеалната позиция навлиза в пречката
  const solved = layoutLabels(items, viewport, undefined, undefined, [obstacleRect]);
  assertClearOfCapsule(items[0], solved[0], obstacleRect, "obstacle-single");
});

// Реални DOM размери, измерени с headless Chromium върху живото табло (390×844 и 360×740, след
// компактната мобилна CSS — собственика, 2026-09-25, кръг 2: „HUD-ът не е реална пречка за тях").
// .brand (заглавие, вече еднолинейно), .tools (търсачка+превключвател — пренася се на 2 реда на
// телефон, затова е високо) и #live (статистиката „Флотилия", вече един ред от 4 чипа). Подадени
// като ПРАВОЪГЪЛНИЦИ (x,y = горен-ляв ъгъл, точно getBoundingClientRect()) — layoutLabels ги покрива
// с плътна капсула от кръгове (rectToCapsule), не с една грубо преразмерена обиколена окръжност.
const REAL_HUD = {
  390: { brand: { x: 12, y: 12, w: 210.6, h: 37.7 }, tools: { x: 238.6, y: 12, w: 303.4, h: 80.4 }, live: { x: 10, y: 781.4, w: 260.6, h: 52.6 } },
  360: { brand: { x: 12, y: 12, w: 194.4, h: 37.7 }, tools: { x: 222.4, y: 12, w: 303.4, h: 80.4 }, live: { x: 10, y: 677.4, w: 260.6, h: 52.6 } },
};
// „чисто спрямо капсулата" = центърът на етикета е извън ВСЕКИ кръг от капсулата с толеранс
// колкото полу-диагонала на етикета (същата консервативна логика като в production/index.html).
function assertClearOfCapsule(item, solvedPoint, rect, msg) {
  const hw = item.w / 2, hh = item.h / 2, labelR = Math.hypot(hw, hh);
  for (const c of rectToCapsule(rect, 6)) {
    const dist = Math.hypot(solvedPoint.x - c.x, solvedPoint.y - c.y);
    assert.ok(dist >= c.r + labelR - 1, `${msg}: етикет остава зад HUD капсула (dist=${dist.toFixed(1)}, c.r=${c.r.toFixed(1)}, needed=${(c.r + labelR - 1).toFixed(1)})`);
  }
}

for (const width of [390, 360]) {
  test(`layoutLabels: реалните HUD правоъгълници (.brand/.tools/#live) на ${width}px са задължителни пречки`, () => {
    const viewport = { width, height: width === 390 ? 844 : 740 };
    const hud = REAL_HUD[width];
    const obstacleRects = [hud.brand, hud.tools, hud.live];
    // реалистични идеални позиции: етикет чийто "звезда отдолу" анкер се подава леко под всяка
    // HUD зона (точно както изглежда в реалния рендер — звезда близо до горния/долния ръб на
    // канваса, не дълбоко вътре в кутията) + един напълно открит в центъра.
    const items = [
      { x: hud.brand.x + hud.brand.w / 2, y: hud.brand.y + hud.brand.h + 4, w: 90, h: 19, weight: 8 }, // "президент" точно под заглавието
      { x: hud.tools.x + 60, y: hud.tools.y + hud.tools.h + 4, w: 70, h: 19, weight: 1 }, // точно под търсачка/превключвател
      { x: hud.live.x + 60, y: hud.live.y - 4, w: 70, h: 19, weight: 1 }, // точно над статистиката
      { x: width / 2, y: viewport.height / 2, w: 70, h: 19, weight: 3 }, // открито в центъра
    ];
    const solved = layoutLabels(items, viewport, undefined, undefined, obstacleRects);
    for (let i = 0; i < 3; i++) {
      for (const rect of obstacleRects) assertClearOfCapsule(items[i], solved[i], rect, `${width}px#${i}`);
    }
    assertNoOverlap(items, solved, `${width}px`);
    assertInBounds(items, solved, viewport, `${width}px`);
  });
}

test("layoutLabels: празен вход → празен изход", () => {
  assert.deepEqual(layoutLabels([], { width: 390, height: 844 }), []);
});

test("layoutLabels: единичен етикет извън viewport-а по идея → притегля се обратно в кадъра", () => {
  const viewport = { width: 390, height: 844 };
  const solved = layoutLabels([{ x: -50, y: 900, w: 80, h: 20, weight: 1 }], viewport);
  assert.ok(solved[0].x - 40 >= -0.01 && solved[0].x + 40 <= viewport.width + 0.01);
  assert.ok(solved[0].y - 10 >= -0.01 && solved[0].y + 10 <= viewport.height + 0.01);
});

// РЕГРЕСИЯ (собственика, 2026-09-25, кръг 3): index.html вече разтяга звездите елиптично по вертикала
// на портрет телефон (nodeRy, "галактиката е малка в средата с много празно място"), за да запълни
// повече от височината. Собственика провери на живо и хвана "спагети" водещи линии, върнали се на
// "Летописецът"/"Касаджията"/"Мобилджията" — MOBILE_HIDE_DIST=48 трябваше да ги скрие, но disp се
// смяташе спрямо ИДЕАЛНАТА (пред-layout) позиция, не спрямо реалната котва на звездата (index.html
// поправка: `disp = Math.hypot(p.x - q.ax, p.y - q.ay)`). Този тест симулира точно същата геометрия —
// котви (anchor=идеална позиция, реалистично за index.html, ax===x) разпръснати по ЦЯЛАТА височина
// (елиптичен spread, някои на <20px от горния/долния ръб — точно както прави новия nodeRy) — и
// възпроизвежда hide-правилото на index.html: провери, че НИТО ЕДИН показан (недокоснат) етикет не
// остава на >MOBILE_HIDE_DIST от котвата си. Важи еднакво за RM (layoutLabels самò няма RM клон —
// геометрията на анкорите е идентична, само canvas анимацията спира).
const MOBILE_HIDE_DIST = 48;
function simulateMobileHide(items, solved) {
  // огледало на index.html drawLabels(): реалната котва е (ax,ay); prez/focused винаги се показват.
  return items.map((it, i) => {
    const p = solved[i];
    const disp = Math.hypot(p.x - it.ax, p.y - it.ay);
    return { shown: !(disp > MOBILE_HIDE_DIST && !it.prez && !it.focused), disp };
  });
}
for (const [width, height] of [[390, 844], [360, 740]]) {
  test(`layoutLabels + mobile hide: елиптичен spread (nodeRy) на ${width}px — показаните етикети остават ≤${MOBILE_HIDE_DIST}px от котвата си`, () => {
    const viewport = { width, height };
    const N = 28;
    const cx = width / 2, cy = height * 0.5;
    const Rx = Math.min(width, height) * 0.46;
    const Ry = Math.min(Rx * 1.8, height * 0.5 - 96); // точната формула от index.html (nodeRy)
    const items = Array.from({ length: N }, (_, i) => {
      const ang = (i / N) * 6.28 + i * 0.91;
      const f = 0.34 + Math.sqrt((i + 0.6) / N) * 0.6; // същата "f" крива като buildNodes() в index.html
      const ax = cx + Math.cos(ang) * f * Rx, ay = cy + Math.sin(ang) * f * Ry;
      const w = 40 + (i % 6) * 8, h = 19;
      return { ax, ay, x: ax, y: ay + 15, w, h, weight: i === 0 ? 8 : 1 + (i % 4), prez: i === 0, focused: false };
    });
    const solved = layoutLabels(items, viewport, undefined, undefined, []);
    const results = simulateMobileHide(items, solved);
    for (let i = 0; i < N; i++) {
      if (items[i].prez) continue; // президентът винаги видим по правило, дори >48px
      if (results[i].shown) {
        assert.ok(results[i].disp <= MOBILE_HIDE_DIST + 0.01, `етикет ${i} се показва, но е на ${results[i].disp.toFixed(1)}px от звездата си (>${MOBILE_HIDE_DIST}) — "спагети" линия`);
      }
    }
  });
}
