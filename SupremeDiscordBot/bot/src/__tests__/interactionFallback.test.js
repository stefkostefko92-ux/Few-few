// bot/src/__tests__/interactionFallback.test.js
// Регресии за ТИХИТЕ пътища в диспечера на взаимодействия (одит 07.08.2026).
//
// interactionCreate.js е верига от startsWith проверки по customId. Modal submit
// имаше резервен клон; бутоните и select менютата — НЕ. Непознат customId просто
// излизаше от try-а без никакъв отговор: Discord показва „This interaction
// failed“ след 3 секунди, а в логовете няма нищо. Случва се в реалния живот —
// панел, публикуван преди месеци и после изтрит или преконфигуриран, оставя живи
// бутони, чийто customId вече не се разпознава.
//
// Тестът гледа ИЗХОДНИЯ КОД, не поведението: файлът е 1800 реда с десетки
// зависимости, а инвариантът, който пазим, е структурен („веригата завършва с
// клон за компоненти, преди да падне в catch-а“).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../events/interactionCreate.js"),
  "utf-8",
);

describe("диспечерът на взаимодействия не мълчи", () => {
  it("има резервен клон за непознат бутон/select (isMessageComponent)", () => {
    expect(SRC).toContain("interaction.isMessageComponent()");
  });

  it("резервният клон отговаря с преведен низ, не с мълчание", () => {
    const idx = SRC.indexOf("interaction.isMessageComponent()");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 700);
    expect(block).toContain("error.componentExpired");
    expect(block).toContain("MessageFlags.Ephemeral");
  });

  it("резервният клон оставя следа в лога (иначе дефектът е невидим)", () => {
    const idx = SRC.indexOf("interaction.isMessageComponent()");
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/console\.(warn|error)/);
  });

  it("резервният клон стои СЛЕД modal клона и ПРЕДИ catch-а", () => {
    const modal = SRC.indexOf("interaction.isModalSubmit()");
    const component = SRC.indexOf("interaction.isMessageComponent()");
    const katch = SRC.indexOf("} catch (err) {");
    expect(modal).toBeGreaterThan(-1);
    expect(component).toBeGreaterThan(modal);
    expect(component).toBeLessThan(katch);
  });
});

describe("създаването на тикет не оставя осиротели канали", () => {
  it("createTicket е обвит в try/catch", () => {
    const idx = SRC.indexOf("ticketResult = await createTicket(");
    expect(idx, "createTicket не се присвоява в try блок").toBeGreaterThan(-1);
    // Търсим `try {` в непосредствено предхождащия текст.
    expect(SRC.slice(Math.max(0, idx - 200), idx)).toContain("try {");
  });

  it("при провал каналът се трие — иначе виси празен завинаги", () => {
    const idx = SRC.indexOf("ticketResult = await createTicket(");
    const block = SRC.slice(idx, idx + 900);
    expect(block).toContain("channel.delete()");
  });

  it("и провалилото се ЧИСТЕНЕ оставя следа, не мълчи", () => {
    const idx = SRC.indexOf("ticketResult = await createTicket(");
    const block = SRC.slice(idx, idx + 900);
    // `.catch(() => {})` тук би значело осиротял канал без никакъв сигнал.
    expect(block).toMatch(/осиротял|console\.error/);
  });
});

describe("обратната връзка за тикет ack-ва винаги", () => {
  it("невалидна оценка не излиза с гол return (нула ack = „interaction failed“)", () => {
    const idx = SRC.indexOf("async function handleFeedback(");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 800);
    expect(block).not.toMatch(/rating\s*<\s*1\s*\|\|\s*rating\s*>\s*5\)\s*return;/);
    expect(block).toContain("deferUpdate");
  });
});

// ─── Cross-tenant гард по вътрешните маршрути (Кодаджията, 07.08.2026) ───────
// `client.channels.fetch(id)` търси през ВСИЧКИ guild-ове, в които е ботът —
// това е споделен бот, значи чужди сървъри. Маршрутите приемаха `serverId`
// именно за да го сверят, но го подминаваха: админ на сървър A можеше да зададе
// channelId от сървър B и съобщенията ни отиваха там.
describe("вътрешните маршрути резолвват канали В РАМКИТЕ на guild-а", () => {
  const RAW = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../index.js"),
    "utf-8",
  );
  // Коментарите се махат: обяснението на самия гард СПОМЕНАВА забранения
  // шаблон, а тест, който брои споменавания в проза, е тест за правописа.
  const INDEX = RAW.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

  it("има помощник guildChannel, който минава през guild.channels", () => {
    expect(INDEX).toContain("async function guildChannel(");
    const i = INDEX.indexOf("async function guildChannel(");
    const body = INDEX.slice(i, i + 600);
    expect(body).toContain("guild.channels");
    expect(body).not.toContain("client.channels.fetch");
  });

  it("НИТО един маршрут със serverId не резолвва глобално", () => {
    const routes = [...INDEX.matchAll(/app\.(post|get)\("(\/[^"]+)"/g)]
      .map((m) => ({ at: m.index, name: m[2] }));
    routes.push({ at: INDEX.length, name: "<край>" });
    const offenders = [];
    for (let i = 0; i < routes.length - 1; i++) {
      const block = INDEX.slice(routes[i].at, routes[i + 1].at);
      if (/\bserverId\b/.test(block) && block.includes("client.channels.fetch")) {
        offenders.push(routes[i].name);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("всеки, който вика guildChannel(serverId, …), реално приема serverId", () => {
    const routes = [...INDEX.matchAll(/app\.post\("(\/internal\/[^"]+)"/g)]
      .map((m) => ({ at: m.index, name: m[1] }));
    routes.push({ at: INDEX.length, name: "<край>" });
    const broken = [];
    for (let i = 0; i < routes.length - 1; i++) {
      const block = INDEX.slice(routes[i].at, routes[i + 1].at);
      if (block.includes("guildChannel(serverId") &&
          !/const \{[^}]*\bserverId\b[^}]*\} = req\.body/.test(block)) {
        broken.push(routes[i].name);
      }
    }
    // ReferenceError по време на работа — синтактичната проверка не го хваща.
    expect(broken).toEqual([]);
  });
});

describe("резултатът от кандидатурата казва истината", () => {
  const INDEX = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../index.js"),
    "utf-8",
  );
  const BLOCK = INDEX.slice(INDEX.indexOf('app.post("/internal/application-apply-outcome"'), INDEX.indexOf('// ── Poll closed'));

  it("не връща твърдо ok:true — отчита дали ролите реално са раздадени", () => {
    expect(BLOCK).not.toContain("ok: true, ...result");
    expect(BLOCK).toContain("result.ok =");
  });

  it("съобщава дали guild-ът и членът са намерени", () => {
    expect(BLOCK).toContain("guildFound");
    expect(BLOCK).toContain("memberFound");
  });

  it("напусналият кандидат оставя следа в лога", () => {
    expect(BLOCK).toMatch(/console\.warn/);
  });

  it("провалено МАХАНЕ на роля вече не изчезва", () => {
    expect(BLOCK).toContain("rolesRemoveFailed");
  });
});
