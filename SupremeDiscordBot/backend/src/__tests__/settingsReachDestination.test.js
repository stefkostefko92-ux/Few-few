// backend/src/__tests__/settingsReachDestination.test.js
// КЛАСЪТ, който ни удари три пъти за един ден: настройка, която се приема,
// валидира и записва — но никога не стига дотам, където има значение.
//
//   • white-label име/аватар → записваха се, брандираха транскрипта, но НИКОГА
//     не се пращаха към Discord (`client.user.setUsername` изобщо липсваше);
//   • лимитите на формите → реализирани в уеб маршрута, а ботът викаше ДРУГ,
//     напълно незащитен;
//   • `namingTemplate` → в таблото, на 8 езика, валидиран — ботът не го четеше.
//
// Общото: нищо не гърми, тестовете са зелени, базата е вярна. Липсва само
// последното звено. Затова тук всяка потребителска настройка е ЗАКОВАНА за
// мястото, което я КОНСУМИРА. Махне ли се консуматорът, тестът пада.
//
// Регистърът е нарочно РЪЧЕН: автоматичното откриване дава 31 „подозрителни“
// колони, от които повечето са легитимно само за backend (stripeCustomerId,
// ticketCounter). Списък, който крещи при всяко трето поле, спира да се чете.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf-8") : "");

// настройка → { файл, който я КОНСУМИРА, и низът, доказващ консумацията }
const MUST_REACH = [
  // ── White-label брандиране ──────────────────────────────────────────────
  // Име и аватар пътуват в ЕДИН `client.user.edit()` — `setUsername`/`setAvatar`
  // правят същата PATCH заявка вътрешно и харчеха двойно от лимита ~2/час.
  { setting: "customBotName",   in: "bot/src/services/clientManager.js", proof: "patch.username" },
  { setting: "customBotAvatar", in: "bot/src/services/clientManager.js", proof: "patch.avatar" },
  { setting: "customBotToken",  in: "bot/src/services/clientManager.js", proof: "client.login" },
  // Самото писане към Discord — без него горните две са само локални променливи.
  { setting: "брандиране→Discord", in: "bot/src/services/clientManager.js", proof: "client.user.edit(" },

  // ── Правила на формите (Premium) ────────────────────────────────────────
  { setting: "cooldownSeconds", in: "backend/src/services/applicationSubmit.js", proof: "COOLDOWN" },
  { setting: "maxSubmissions",  in: "backend/src/services/applicationSubmit.js", proof: "MAX_SUBMISSIONS" },
  { setting: "closedAt",        in: "backend/src/services/applicationSubmit.js", proof: "FORM_CLOSED" },

  // ── Панел ────────────────────────────────────────────────────────────────
  { setting: "namingTemplate",       in: "bot/src/events/interactionCreate.js", proof: "namingTemplate" },
  { setting: "channelNamePrefix",    in: "bot/src/events/interactionCreate.js", proof: "channelNamePrefix" },
  { setting: "inactivityCloseHours", in: "backend/src/services/scheduler.js",   proof: "inactivityCloseHours" },
  { setting: "autoCloseOnLeave",     in: "backend/src/routes/bot.js",           proof: "autoCloseOnLeave" },

  // ── Верификация ──────────────────────────────────────────────────────────
  { setting: "dmOnSuccess",       in: "backend/src/routes/verification.js", proof: "dmSuccess" },
  { setting: "minAccountAgeDays", in: "backend/src/routes/verification.js", proof: "minAccountAgeDays" },

  // ── Сървър ───────────────────────────────────────────────────────────────
  { setting: "archiveChannelId",  in: "backend/src/routes/bot.js",             proof: "archiveChannelId" },
  { setting: "aiRepliesEnabled",  in: "backend/src/routes/bot.js",             proof: "aiRepliesEnabled" },
  { setting: "roundRobinEnabled", in: "backend/src/services/roundRobin.js",    proof: "roundRobinEnabled" },
  { setting: "eventLogChannels",  in: "backend/src/routes/bot_v18.js",         proof: "eventLogChannels" },
];

describe("всяка настройка стига до мястото, което я изпълнява", () => {
  it.each(MUST_REACH)("$setting → $in", ({ setting, in: file, proof }) => {
    const src = read(file);
    expect(src, `${file} не се чете`).not.toBe("");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code, `„${setting}“ вече не се консумира в ${file} — настройка без ефект`).toContain(proof);
  });
});

// Обратната посока: полета, за които ЗНАЕМ, че нищо не ги чете, не бива да се
// приемат от API-то. Приета настройка, която не прави нищо, лъже интегратора.
describe("API-то не приема настройки, които игнорира", () => {
  const PHANTOM = [
    { field: "stickyMessagesEnabled", route: "backend/src/routes/servers.js" },
    { field: "requireVerification",   route: "backend/src/routes/forms.js" },
  ];

  it.each(PHANTOM)("$field не е сред приеманите в $route", ({ field, route }) => {
    const code = read(route).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code, `${field} пак се приема, а нищо не го чете`).not.toContain(field);
  });
});
