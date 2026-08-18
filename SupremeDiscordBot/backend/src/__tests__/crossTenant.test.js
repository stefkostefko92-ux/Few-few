// backend/src/__tests__/crossTenant.test.js
// „Може ли действие по ЕДИН сървър да счупи ДРУГ?“ — въпросът на собственика.
//
// Структурни гейтове върху точките, където един tier преход докосва повече от
// един наемател. Всеки е добавен след реална находка (одит 07.08.2026).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(SRC, p), "utf-8");
/** Реалният код без коментари — иначе гейтът чете обяснение вместо код. */
const code = (p) =>
  read(p).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

describe("ЕДИН източник на истина за правото на бранд бот", () => {
  // Метлата на бота сваля клиенти по списъка от `/servers/with-custom-tokens`.
  // Ако този списък има СВОЯ дефиниция за white-label, тя дрейфва спрямо
  // `getServerTier` — и разминаване по ЕДИН сървър сваля бранд бота на ДРУГИ
  // наематели (или ги вдига и сваля в безкраен цикъл).
  const botRoutes = code("routes/bot.js");
  const handler = botRoutes.slice(botRoutes.indexOf('"/servers/with-custom-tokens"'));
  const body = handler.slice(0, handler.indexOf("res.json(servers)"));

  it("списъкът минава през getServerTier, не през собствен where", () => {
    expect(body).toContain("getServerTier");
    expect(body).toMatch(/hasWhiteLabel/);
  });

  it("НЕ изброява планове на ръка (паралелна дефиниция)", () => {
    // Точният дефект: `plan: { in: ["whitelabel", "agency5", "agency10"] }`.
    expect(body).not.toMatch(/agency5/);
    expect(body).not.toMatch(/gracePlan/);
  });

  it("кандидатите се избират само по наличен токен", () => {
    expect(body).toMatch(/customBotToken:\s*\{\s*not:\s*null\s*\}/);
  });
});

describe("реконсилиацията на бранд ботовете е fail-closed", () => {
  const cm = code("../../bot/src/services/clientManager.js");
  const fn = cm.slice(cm.indexOf("export async function reconcileCustomClients"));

  it("при недостъпен backend НЕ сваля живи клиенти", () => {
    // Празен списък от ГРЕШКА не бива да значи „никой няма право“ — иначе
    // мрежов трепет сваля бранд ботовете на ВСИЧКИ наематели наведнъж.
    const guard = fn.slice(0, fn.indexOf("let shutDown"));
    expect(guard).toMatch(/catch/);
    expect(guard).toMatch(/return\s*\{[^}]*skipped:\s*true/);
  });
});

describe("agency-широкият синхрон е устойчив на един лош ред", () => {
  const premium = code("lib/premium.js");
  const fn = premium.slice(premium.indexOf("export async function syncAgencyServersPaidFlag"));
  const body = fn.slice(0, fn.indexOf("\n}"));

  it("всеки сървър се синхронизира в собствен try/catch", () => {
    // Гол `for … await` прекъсваше при първата грешка и оставяше ОСТАНАЛИТЕ
    // сървъри на агенцията със стар isPremium — тихо, защото всички повиквания
    // са `.catch(() => {})`.
    expect(body).toMatch(/for\s*\(/);
    expect(body).toMatch(/try\s*\{/);
    expect(body).toMatch(/catch/);
  });

  it("частичният провал се КАЗВА, не се премълчава", () => {
    expect(body).toMatch(/console\.(error|warn)/);
  });
});

describe("сваляне на seat пипа САМО своя сървър", () => {
  const agency = code("routes/agency.js");
  const del = agency.slice(agency.indexOf('router.delete("/:agencyId/servers/:serverId"'));
  const body = del.slice(0, del.indexOf("res.json({ ok: true })"));

  it("update-ът е по конкретния serverId, не по agencyId", () => {
    expect(body).toMatch(/server\.update\(\s*\{\s*where:\s*\{\s*id:\s*serverId\s*\}/);
    // Никакво updateMany/deleteMany по агенцията — това би засегнало съседите.
    expect(body).not.toMatch(/updateMany/);
    expect(body).not.toMatch(/deleteMany/);
  });

  it("синхронизира само своя сървър (не цялата агенция)", () => {
    expect(body).toMatch(/syncServerPaidFlag\(serverId/);
    expect(body).not.toMatch(/syncAgencyServersPaidFlag/);
  });
});
