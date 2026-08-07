// RED-BEFORE-GREEN артефакт (червен екип, 07.08.2026 · R2 срещу ПОПРАВКИТЕ).
// Твърди ЖЕЛАНОТО поведение: пада ПРЕДИ поправката, минава СЛЕД нея.
//
// НАХОДКА: прозорецът за експорт (`EXPORT_GRACE_DAYS = 30`, premium.js:174) е
// закотвен в `Server.accessUntil` — а `jobs/dunning.js:150-161` ЗАНУЛЯВА точно
// тази колона на първия си пробег СЛЕД изтичането на гратиса (дневно 03:30 UTC).
// Тоест котвата се изтрива в мига, в който 30-дневният прозорец трябва да
// ЗАПОЧНЕ. Реалният прозорец е ≤24ч, не 30 дни — и `services/scheduler.js:99`
// (метлата за архиви, 03:00 UTC) спира да отлага още на следващата нощ.
//
// Съществуващият `exportWindow.test.js` не го лови: той тества `inExportWindow`
// изолирано, върху ръчно подадена котва, и никога не пуска дунинг метлата
// върху нея. Единичната функция е вярна; СИСТЕМАТА не е.
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = { server: new Map(), agency: new Map() };

function serverFindMany({ where }) {
  const rows = [...store.server.values()];
  if (where?.accessUntil) {
    return rows
      .filter((s) => s.accessUntil && s.accessUntil <= where.accessUntil.lte)
      .map((s) => ({ id: s.id, accessUntil: s.accessUntil, gracePlan: s.gracePlan }));
  }
  return []; // past_due клонът не участва в този сценарий
}

const prismaMock = {
  server: {
    findMany: vi.fn(async (args) => serverFindMany(args)),
    findUnique: vi.fn(async ({ where }) => store.server.get(where.id) ?? null),
    update: vi.fn(async ({ where, data }) => Object.assign(store.server.get(where.id), data)),
  },
  agency: { findMany: vi.fn(async () => []) },
  auditLog: { create: vi.fn(async () => ({})) },
  $transaction: vi.fn(async (fn) => fn(prismaMock)),
};
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../services/botNotifier.js", () => ({
  notifyBot: vi.fn(), dmUser: vi.fn(), reconcileWhitelabel: vi.fn(),
}));

const { runDunningJob } = await import("../jobs/dunning.js");
const { inExportWindow, EXPORT_GRACE_DAYS } = await import("../lib/premium.js");

const DAY = 86400_000;

beforeEach(() => {
  vi.clearAllMocks();
  store.server.clear();
  // Клиент, платил ГОДИШЕН White-label, отменил преди година; гратисът изтече
  // преди час (accessUntil в миналото). Точно тук започва правото по чл. 16(4)
  // Дир. (ЕС) 2019/770 да си вземе данните — 30 дни, обещани и в DPA §9.1.
  store.server.set("s1", {
    id: "s1",
    isPremium: false,
    plan: "free",
    planSource: null,
    stripeSubscriptionId: null,
    stripeStatus: "canceled",
    accessUntil: new Date(Date.now() - 3600_000),
    gracePlan: "whitelabel",
    trialEndsAt: new Date(Date.now() - 400 * DAY), // купил е преди година
    archiveRetentionDays: 30,
    agencyId: null,
    agency: null,
  });
});

describe("R2 · дунинг метлата не бива да къса котвата на прозореца за експорт", () => {
  it("прозорецът е отворен ВЕДНАГА след края на гратиса (контрол)", () => {
    expect(inExportWindow(store.server.get("s1"))).toBe(true);
  });

  it("след дневния дунинг прозорецът ТРЯБВА да е още отворен 30 дни", async () => {
    await runDunningJob();
    const s = store.server.get("s1");
    expect(
      inExportWindow(s),
      `дунингът занули accessUntil → котвата изчезна; остават ${EXPORT_GRACE_DAYS} дни само на хартия`,
    ).toBe(true);
  });

  it("и на 29-ия ден след края всё още е отворен", async () => {
    await runDunningJob();                        // нощ 1
    const s = store.server.get("s1");
    const in29Days = Date.now() + 29 * DAY;
    expect(inExportWindow(s, in29Days)).toBe(true);
  });

  it("метлата за архиви ОЩЕ отлага изтриването на другата нощ", async () => {
    await runDunningJob();
    // Точно условието от services/scheduler.js:99 (archive-cleanup, 03:00 UTC).
    const s = store.server.get("s1");
    expect(
      inExportWindow(s, Date.now() + DAY),
      "архивите се трият, докато клиентът още има право да ги изтегли",
    ).toBe(true);
  });
});
