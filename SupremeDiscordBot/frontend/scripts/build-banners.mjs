// frontend/scripts/build-banners.mjs — банерите за Discord в стил „Токсична броня“ (28.11.2026).
//
// Готови картинки за панелите за тикети и за верификация: таблото ги предлага с един клик
// (поле „Банер“), ботът ги слага като image на embed-а. Без текст и без лого — пасват и на
// white-label сървъри. Рисувани с CSS и canvas (без SVG), записани като JPG 1200×400
// (Discord показва JPG навсякъде и така и така прекомпресира).
//
// Употреба: node scripts/build-banners.mjs   → public/banners/<id>.jpg
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "banners");
export const BANNERS = ["reactor", "armor", "shield", "gold"];

const W = 1200, H = 400;
const grain = `data:image/png;base64,${readFileSync(join(ROOT, "public", "tex", "grain.png")).toString("base64")}`;

// Общото: плоча с четкан метал, черен шев, нит във всеки ъгъл, зърно отгоре.
const BASE = `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${W}px;height:${H}px;background:#010504;overflow:hidden}
  .b{position:relative;width:${W}px;height:${H}px;overflow:hidden;
     background:repeating-linear-gradient(90deg,rgba(255,255,255,.016) 0 1px,transparent 1px 3px),linear-gradient(180deg,#0f221e,#030a09)}
  .frame{position:absolute;inset:14px;border:2px solid #24382f;border-radius:10px;
     box-shadow:inset 0 1px 0 rgba(255,255,255,.08),inset 0 -2px 0 rgba(0,0,0,.6),0 0 0 2px #000}
  .rivet{position:absolute;width:14px;height:14px;border-radius:50%;
     background:radial-gradient(circle at 35% 30%,#a8b8a0,#5b6f55 45%,#1b2e25 75%);box-shadow:0 1px 2px #000}
  .grain{position:absolute;inset:0;background:url(${grain});opacity:.9;mix-blend-mode:overlay}
  canvas{position:absolute;inset:0}
  .scene{position:absolute;inset:14px;border-radius:10px;overflow:hidden}
`;
const rivets = [[30, 30], [W - 44, 30], [30, H - 44], [W - 44, H - 44]]
  .map(([x, y]) => `<i class="rivet" style="left:${x}px;top:${y}px"></i>`).join("");

const SCENES = {
  // Ядро в центъра: концентрични пръстени и рояк частици.
  reactor: `<style>
      .core{position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:50%;
        background:radial-gradient(circle,#f0f0eb 0 14%,#8fe600 32%,rgba(143,230,0,.25) 60%,transparent 72%);
        box-shadow:0 0 90px 30px rgba(143,230,0,.35)}
      .ring{position:absolute;left:50%;top:50%;border-radius:50%;border:2px solid rgba(143,230,0,.6);box-shadow:0 0 18px rgba(143,230,0,.5),inset 0 0 18px rgba(143,230,0,.25)}
      .ring.g{border-color:rgba(240,194,76,.7);box-shadow:0 0 18px rgba(240,194,76,.45)}
    </style>
    <div class="ring" style="width:300px;height:110px;margin:-55px 0 0 -150px;transform:rotate(-12deg)"></div>
    <div class="ring g" style="width:420px;height:150px;margin:-75px 0 0 -210px;transform:rotate(8deg)"></div>
    <div class="ring" style="width:560px;height:190px;margin:-95px 0 0 -280px;transform:rotate(-4deg);opacity:.55"></div>
    <div class="core"></div>
    <canvas id="p" width="${W}" height="${H}"></canvas>`,
  // Броня: хоризонтални канали, лента „опасност“ долу, светеща нишка.
  armor: `<style>
      .groove{position:absolute;left:60px;right:60px;height:3px;background:#000;box-shadow:0 1px 0 rgba(255,255,255,.07)}
      .hazard{position:absolute;left:0;right:0;bottom:0;height:54px;
        background:repeating-linear-gradient(-45deg,#8fe600 0 26px,#030807 26px 52px);opacity:.92;box-shadow:inset 0 2px 6px rgba(0,0,0,.7)}
      .strip{position:absolute;left:60px;right:60px;top:150px;height:6px;border-radius:3px;background:#8fe600;box-shadow:0 0 24px 6px rgba(143,230,0,.55)}
      .plate{position:absolute;left:420px;top:190px;width:360px;height:110px;border-radius:8px;border:2px solid #36503f;
        background:linear-gradient(180deg,#1a2c27,#0b1a17);box-shadow:inset 0 1px 0 rgba(255,255,255,.1),inset 0 -3px 0 rgba(0,0,0,.6),0 0 0 2px #000}
      .plate::after{content:"";position:absolute;inset:34px 40px;border-radius:4px;background:#020605;box-shadow:inset 0 2px 8px #000,0 0 0 1px rgba(143,230,0,.35)}
    </style>
    <div class="groove" style="top:80px"></div><div class="groove" style="top:110px"></div>
    <div class="strip"></div><div class="plate"></div><div class="hazard"></div>`,
  // Щит (за верификация): шестоъгълник с лаймово сияние и сканиращи линии.
  shield: `<style>
      .hex{position:absolute;left:50%;top:50%;width:230px;height:260px;margin:-130px 0 0 -115px;
        clip-path:polygon(50% 0,100% 22%,100% 70%,50% 100%,0 70%,0 22%);
        background:linear-gradient(180deg,#a8f033,#6cb000)}
      .hex.in{width:200px;height:226px;margin:-113px 0 0 -100px;background:radial-gradient(circle at 50% 35%,#1a2c27,#030a09 70%)}
      .glow{position:absolute;left:50%;top:50%;width:360px;height:360px;margin:-180px 0 0 -180px;border-radius:50%;
        background:radial-gradient(circle,rgba(143,230,0,.35),transparent 65%)}
      .tick{position:absolute;left:50%;top:50%;width:84px;height:44px;margin:-36px 0 0 -42px;border-left:16px solid #8fe600;border-bottom:16px solid #8fe600;
        transform:rotate(-45deg);box-shadow:-6px 6px 22px rgba(143,230,0,.6)}
      .scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.25) 0 1px,transparent 1px 4px)}
      .beam{position:absolute;top:50%;height:2px;width:330px;background:linear-gradient(90deg,transparent,#8fe600);box-shadow:0 0 12px #8fe600}
    </style>
    <div class="glow"></div><div class="beam" style="left:60px"></div><div class="beam" style="right:60px;transform:scaleX(-1)"></div>
    <div class="hex"></div><div class="hex in"></div><div class="tick"></div><div class="scan"></div>`,
  // Злато: диагонален разлом — злато срещу лайм, за Premium сървъри.
  gold: `<style>
      .rift{position:absolute;inset:0;background:linear-gradient(115deg,transparent 46%,rgba(240,194,76,.9) 49%,#f0f0eb 50%,rgba(143,230,0,.9) 51%,transparent 54%);
        filter:blur(1.5px);opacity:.9}
      .gl{position:absolute;inset:0;background:radial-gradient(60% 90% at 30% 50%,rgba(240,194,76,.28),transparent 70%),radial-gradient(60% 90% at 72% 50%,rgba(143,230,0,.26),transparent 70%)}
      .bar{position:absolute;height:8px;border-radius:4px}
    </style>
    <div class="gl"></div><div class="rift"></div>
    <div class="bar" style="left:80px;top:96px;width:320px;background:#f0c24c;box-shadow:0 0 22px rgba(240,194,76,.7)"></div>
    <div class="bar" style="left:80px;top:122px;width:200px;background:#c8992f"></div>
    <div class="bar" style="right:80px;bottom:110px;width:320px;background:#8fe600;box-shadow:0 0 22px rgba(143,230,0,.7)"></div>
    <div class="bar" style="right:80px;bottom:84px;width:200px;background:#6cb000"></div>
    <canvas id="p" width="${W}" height="${H}"></canvas>`,
};

// Частиците — детерминистични (seed), за да е еднаква картинката при всяко генериране.
const PARTICLES = `(() => {
  const c = document.getElementById("p"); if (!c) return; const x = c.getContext("2d");
  let s = 0x9e3779b9; const r = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2, d = 120 + r() * 420, px = 600 + Math.cos(a) * d, py = 200 + Math.sin(a) * d * 0.33;
    const g = r() < 0.15; const rad = 0.8 + r() * 2.2;
    x.fillStyle = g ? "rgba(240,194,76," + (0.4 + r() * 0.6) + ")" : "rgba(143,230,0," + (0.35 + r() * 0.65) + ")";
    x.shadowColor = g ? "#f0c24c" : "#8fe600"; x.shadowBlur = 8;
    x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fill();
  }
})();`;

async function main() {
  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright");
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  for (const id of BANNERS) {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${BASE}</style></head><body>
      <div class="b"><div class="scene">${SCENES[id]}</div><div class="frame"></div>${rivets}<div class="grain"></div></div>
      <script>${PARTICLES}</script></body></html>`);
    await page.waitForTimeout(80);
    const buf = await page.screenshot({ type: "jpeg", quality: 86, clip: { x: 0, y: 0, width: W, height: H } });
    writeFileSync(join(OUT, `${id}.jpg`), buf);
    console.log(`✓ public/banners/${id}.jpg (${(buf.length / 1024).toFixed(0)} KB)`);
  }
  await browser.close();
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
