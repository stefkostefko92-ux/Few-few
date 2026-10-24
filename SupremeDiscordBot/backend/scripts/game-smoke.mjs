#!/usr/bin/env node
// backend/scripts/game-smoke.mjs — READ-ONLY проверка, че играта (v50) е
// сглобена на живия сървър: backend-ът отговаря на бот-endpoint-ите, сезонът
// е записан в базата, каталогът носи 60 спътника с картинки на публичен URL,
// настройките на даден сървър се четат, куестовете се листват.
//
// Пуска се ВЪТРЕ в контейнера на backend-а (там са API_SECRET и FRONTEND_URL;
// нищо не се печата от тях):
//   docker compose -f /opt/few-few/current/SupremeDiscordBot/docker-compose.yml \
//     exec -T backend node scripts/game-smoke.mjs [<serverId>]
// Изход 0 = всичко е на място; 1 = нещо липсва (виж редовете с ✗).
// Не създава нищо (никакви появи, кръгове, куестове) — безопасен в продукция.
const BASE = process.env.GAME_SMOKE_BASE || `http://127.0.0.1:${process.env.PORT || 3000}`;
const SECRET = process.env.API_SECRET;
const SERVER_ID = process.argv[2] || "";
const FRONTEND_URL = process.env.FRONTEND_URL || "";

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ✓ ${m}`); };
const bad = (m) => { fail++; console.log(`  ✗ ${m}`); };
const note = (m) => console.log(`  · ${m}`);

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { "x-bot-secret": SECRET || "" }, signal: AbortSignal.timeout(10_000) });
  let body = null;
  try { body = await res.json(); } catch { /* не е JSON */ }
  return { status: res.status, body };
}

console.log(`── Game smoke: ${BASE} ──`);
if (!SECRET) { bad("API_SECRET липсва в средата — пусни скрипта вътре в контейнера на backend-а"); }
if (!FRONTEND_URL || /YOUR_DOMAIN/i.test(FRONTEND_URL)) bad("FRONTEND_URL не е зададен (или е placeholder) — картинките в embed-ите ще сочат в нищото");
else ok(`FRONTEND_URL е зададен (${new URL(FRONTEND_URL).host})`);

try {
  // 1. Каталог + сезон (сезонът се seed-ва при първо четене, ако таблицата е празна)
  const cat = await get("/api/bot/game/companions/catalog");
  if (cat.status !== 200 || !cat.body?.companions) bad(`каталогът: HTTP ${cat.status} — маршрутът bot_companions не е монтиран или тайната е грешна`);
  else {
    const n = cat.body.companions.length;
    n === 60 ? ok("каталогът носи 60 спътника") : bad(`каталогът носи ${n} спътника вместо 60`);
    const s = cat.body.season;
    if (!s?.code) bad("няма текущ сезон — таблицата game_seasons не е мигрирана или seed-ът е паднал");
    else ok(`текущ сезон ${s.code} „${s.name}“ · ${s.active ? "активен" : s.ended ? "ПРИКЛЮЧИЛ — създай следващия от Admin → Season" : "предстоящ"} · сезонни спътници: ${s.companionIds?.length ?? 0}`);
    const img = cat.body.companions[0]?.imageUrl || "";
    if (FRONTEND_URL && img.startsWith(FRONTEND_URL.replace(/\/$/, ""))) ok("картинките сочат към FRONTEND_URL");
    else bad(`картинката на първия спътник сочи към ${img || "(празно)"}`);
    // Публичният файл реално се отдава (през същия път, по който минава Discord).
    if (img) {
      try {
        const r = await fetch(img, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
        r.ok && /image\/jpeg/.test(r.headers.get("content-type") || "") ? ok("първата картинка се отдава като image/jpeg") : bad(`картинката ${img} → HTTP ${r.status} ${r.headers.get("content-type") || ""}`);
      } catch (e) { bad(`картинката ${img} не се достига от контейнера: ${e.message} (нормално, ако DNS-ът на домейна не се вижда отвътре — провери от браузър)`); }
    }
  }

  // 2. Настройки + куестове на конкретен сървър (ако е подаден)
  if (SERVER_ID) {
    const st = await get(`/api/bot/game/settings/${SERVER_ID}`);
    if (st.status !== 200) bad(`настройките на ${SERVER_ID}: HTTP ${st.status}`);
    else {
      const b = st.body;
      ok(`настройки: enabled=${b.enabled} · premium=${b.isPremium} · spawn=${b.spawnEnabled} · counting=${b.countingChannelId ? "да" : "не"} · trivia=${b.triviaSchedule || "off"} · quests=${b.questEnabled}`);
      if (!b.enabled) note("играта е ИЗКЛЮЧЕНА за този сървър — включи я от таблото → Game → Overview");
      if (!b.announceChannelId) note("няма канал за обяви — нивата нагоре и краят на сезона няма да се обявяват");
      if (b.questEnabled && !b.questChannelId) note("куестовете са включени без канал — ще вървят без лента за напредък");
    }
    const q = await get(`/api/bot/game/quests/${SERVER_ID}`);
    if (q.status !== 200 || !Array.isArray(q.body)) bad(`куестовете на ${SERVER_ID}: HTTP ${q.status}`);
    else ok(`активни куестове: ${q.body.length}${q.body[0] ? ` (${q.body[0].type} ${q.body[0].progress}/${q.body[0].target})` : " — първият тръгва от game-quests в :07 на следващия час"}`);
  } else {
    note("подай serverId като аргумент, за да провериш настройките и куестовете на конкретен сървър");
  }
} catch (e) {
  bad(`грешка при заявка към backend-а: ${e.message}`);
}

console.log();
if (fail === 0) { console.log(`✓ Game smoke мина: ${pass} проверки`); process.exit(0); }
console.log(`✗ Game smoke падна: ${fail} от ${pass + fail}`);
process.exit(1);
