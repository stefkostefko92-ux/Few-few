// backend/src/__tests__/dunning.test.js
// Дунинг метлата е ЕДИНСТВЕНОТО нещо, което сваля достъп без събитие от Stripe
// — и досега нямаше нито един тест. Два независими механизма живеят тук:
//
//   1. заседнал `past_due` над гратисния прозорец → достъпът пада (C3);
//   2. v40 — изтекъл `accessUntil` след ОТМЯНА → гратисът се гаси.
//
// Втората е критична: Stripe НЕ праща събитие в момента, в който платеният
// период изтече. Без метла отмененият клиент пази тарифата си завинаги, което
// е точно обратното на решението „достъп до крайния срок“.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const syncServerPaidFlag = vi.fn();
vi.mock("../lib/premium.js", () => ({ syncServerPaidFlag: (...a) => syncServerPaidFlag(...a) }));

const { runDunningJob } = await import("../jobs/dunning.js");

// Диспечер по ФОРМАТА на заявката, не по реда на извикване. Job-ът прави три
// вида findMany на server и два на agency; броенето на повиквания се чупи при
// всяко разместване и заблуждава кой набор кой е.
const rows = { stuckServers: [], stuckAgencies: [], expiredServers: [], expiredAgencies: [], members: [] };

function noRows() {
  for (const k of Object.keys(rows)) rows[k] = [];
  prismaMock.server.findMany.mockImplementation(async ({ where }) => {
    if (where?.accessUntil) return rows.expiredServers;
    if (where?.stripeStatus === "past_due") return rows.stuckServers;
    return rows.members;               // членове на агенция (where.agencyId)
  });
  prismaMock.agency.findMany.mockImplementation(async ({ where }) =>
    where?.accessUntil ? rows.expiredAgencies : rows.stuckAgencies,
  );
}

const serverUpdates = () => prismaMock.server.update.mock.calls.map((c) => c[0]);
const auditActions = () =>
  prismaMock.auditLog.create.mock.calls.map((c) => c[0].data.action);

beforeEach(() => {
  vi.resetAllMocks();
  noRows();
  prismaMock.$transaction.mockImplementation(async (fn) =>
    typeof fn === "function" ? fn(prismaMock) : Promise.all(fn),
  );
});

describe("заседнал past_due", () => {
  it("сваля достъпа и пише окончателен статус „unpaid“, не „past_due“", async () => {
    // „past_due“ значи ГРАТИС и нарочно НЕ е в списъка с прекратени статуси —
    // остане ли, сървърът минава през grandfather клаузата и става платен
    // завинаги. Точно този дефект беше открит от червения екип.
    rows.stuckServers = [{ id: "s1", pastDueSince: new Date("2026-01-01") }];

    const res = await runDunningJob();

    expect(res.downgraded).toBe(1);
    expect(serverUpdates()[0].data).toMatchObject({
      isPremium: false, plan: "free", stripeStatus: "unpaid",
    });
    expect(auditActions()).toContain("PREMIUM_REVOKED_DUNNING");
  });

  it("деактивира заседнала агенция и синхронизира членовете ѝ", async () => {
    rows.stuckAgencies = [{ id: "ag1", pastDueSince: new Date("2026-01-01") }];
    rows.members = [{ id: "m1" }, { id: "m2" }];

    const res = await runDunningJob();

    expect(res.agenciesDeactivated).toBe(1);
    expect(syncServerPaidFlag).toHaveBeenCalledTimes(2);
  });
});

describe("v40 — изтекъл гратис след отмяна", () => {
  it("гаси gracePlan, но ПАЗИ accessUntil — котвата на прозореца за експорт", async () => {
    // Промяната е нарочна (одит кръг 2, 07.08.2026): `accessUntil` вече не е
    // само флаг за достъп, а котвата на 30-дневния прозорец за експорт
    // (`lib/premium.js` → `inExportWindow`), обещан в `legal/DPA.md` §9.1.
    // Зануляването тук правеше прозореца ≤24 часа — клиентът получаваше 403 на
    // експорта и метлата почваше да трие архивите му същата нощ.
    //
    // Оставането е безвредно: всеки четец сравнява с датата, значи изтекла
    // стойност не дава достъп. `gracePlan` става маркерът „вече обработен“.
    rows.expiredServers = [
      { id: "s9", accessUntil: new Date("2026-01-01"), gracePlan: "whitelabel" },
    ];

    const res = await runDunningJob();

    expect(res.graceExpired).toBe(1);
    const update = serverUpdates().at(-1);
    expect(update.where).toEqual({ id: "s9" });
    expect(update.data).toEqual({ gracePlan: null });
    expect(update.data, "accessUntil пак се занулява — прозорецът за експорт умира")
      .not.toHaveProperty("accessUntil");
    expect(auditActions()).toContain("PREMIUM_GRACE_EXPIRED");
  });

  it("не избира наново вече обработените — иначе одитът се пълни всяка нощ", async () => {
    // `accessUntil` остава, значи маркерът за „обработен“ е `gracePlan`.
    await runDunningJob();
    const graceQuery = prismaMock.server.findMany.mock.calls
      .map((c) => c[0].where)
      .find((w) => w?.accessUntil);
    expect(graceQuery.gracePlan, "липсва маркер за обработеност → безкраен одитен спам")
      .toHaveProperty("not", null);
  });

  it("търси само ИЗТЕКЛИ редове — жив гратис не се пипа", async () => {
    await runDunningJob();

    const graceQuery = prismaMock.server.findMany.mock.calls
      .map((c) => c[0].where)
      .find((w) => w?.accessUntil);
    expect(graceQuery.accessUntil).toHaveProperty("not", null);
    expect(graceQuery.accessUntil.lte).toBeInstanceOf(Date);
  });

  it("агенция с изтекъл гратис пада на active=false и членовете се синхронизират", async () => {
    rows.expiredAgencies = [{ id: "ag9", accessUntil: new Date("2026-01-01") }];
    rows.members = [{ id: "m1" }];

    const res = await runDunningJob();

    expect(res.graceExpired).toBeGreaterThanOrEqual(1);
    expect(prismaMock.agency.update.mock.calls.at(-1)[0].data).toEqual({
      active: false, accessUntil: null,
    });
    expect(auditActions()).toContain("AGENCY_GRACE_EXPIRED");
  });
});

describe("устойчивост", () => {
  it("грешка по един ред не спира останалите и НЕ хвърля нагоре", async () => {
    rows.stuckServers = [{ id: "a" }, { id: "b" }];
    prismaMock.$transaction
      .mockRejectedValueOnce(new Error("deadlock"))
      .mockImplementation(async (fn) => (typeof fn === "function" ? fn(prismaMock) : fn));

    const res = await runDunningJob();

    expect(res.downgraded).toBe(1);
    expect(res.errors).toHaveLength(1);
  });
});
