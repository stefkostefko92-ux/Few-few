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
