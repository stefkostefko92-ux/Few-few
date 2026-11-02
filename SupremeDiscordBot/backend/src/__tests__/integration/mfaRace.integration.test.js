// backend/src/__tests__/integration/mfaRace.integration.test.js
// Вторият фактор срещу ИСТИНСКИ Postgres: един код = един вход.
//
// Unit тестът (`mfa.test.js`) доказва, че кодът пише УСЛОВНО (сравни-и-смени с
// `updateMany`), но мокнатата Prisma не заключва редове — оттам не следва, че
// Postgres ще откаже втората едновременна заявка. Тук две заявки с ЕДИН И СЪЩ
// код тръгват наистина едновременно, всяка със СВОЕ копие на потребителя (както
// две HTTP заявки, всяка заредила реда сама), и се брои кой е минал.
//
// Червен екип, 10.10.2026: преди поправката и двете минаваха — видян TOTP код
// ставаше два входа, един резервен код — два.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb, makeUser } from "./db.js";

// Тестов ключ (не тайна) — crypto.js го чете мързеливо, при първото ползване.
process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const { encrypt } = await import("../../lib/crypto.js");
const { generateSecret, totp, totpStep, generateBackupCodes, hashBackupCode } = await import("../../lib/totp.js");
const { verifyFactor } = await import("../../routes/mfa.js");

const UID = "mfa_user";
let secret;
let codes;

beforeEach(async () => {
  await resetDb();
  await makeUser(UID);
  secret = generateSecret();
  codes = generateBackupCodes(3);
  await prisma.user.update({
    where: { id: UID },
    data: {
      mfaSecret: encrypt(secret),
      mfaEnabledAt: new Date(),
      mfaBackupCodes: JSON.stringify(codes.map(hashBackupCode)),
      mfaLastUsedStep: null,
    },
  });
});

afterAll(async () => { await prisma.$disconnect(); });

/** Две „заявки“ — всяка зарежда реда сама, точно като loadUser. */
const twoSnapshots = () => Promise.all([
  prisma.user.findUnique({ where: { id: UID } }),
  prisma.user.findUnique({ where: { id: UID } }),
]);

describe("един код = един вход (жив Postgres)", () => {
  it("TOTP: две едновременни заявки с един и същ код → точно ЕДНА минава", async () => {
    const code = totp(secret);
    const [a, b] = await twoSnapshots();
    const results = await Promise.all([verifyFactor(a, code), verifyFactor(b, code)]);

    expect(results.filter((r) => r.ok).length, "видян код стана два входа").toBe(1);
    const row = await prisma.user.findUnique({ where: { id: UID } });
    // Записаната стъпка е тази на кода (±1 стъпка толеранс за часовника).
    expect(Math.abs(row.mfaLastUsedStep - totpStep())).toBeLessThanOrEqual(1);
  });

  it("TOTP: вече приет код не минава втори път (повторно ползване)", async () => {
    const code = totp(secret);
    const [first] = await twoSnapshots();
    expect((await verifyFactor(first, code)).ok).toBe(true);
    const fresh = await prisma.user.findUnique({ where: { id: UID } });
    expect((await verifyFactor(fresh, code)).ok).toBe(false);
  });

  it("резервен код: две едновременни заявки с един и същ код → точно ЕДНА минава", async () => {
    const [a, b] = await twoSnapshots();
    const results = await Promise.all([verifyFactor(a, codes[0]), verifyFactor(b, codes[0])]);

    expect(results.filter((r) => r.ok).length, "един резервен код стана два входа").toBe(1);
    const left = JSON.parse((await prisma.user.findUnique({ where: { id: UID } })).mfaBackupCodes);
    expect(left).toHaveLength(2);
    expect(left).not.toContain(hashBackupCode(codes[0]));
  });

  it("два РАЗЛИЧНИ резервни кода едновременно: нито един не се губи", async () => {
    // Сравни-и-смени е върху целия списък, затова при сблъсък губещата заявка
    // се отказва (затваря безопасно) — но кодът ѝ НЕ се изразходва и минава при
    // повторен опит. Изгубен неизползван код би заключил човека навън.
    const [a, b] = await twoSnapshots();
    const results = await Promise.all([verifyFactor(a, codes[0]), verifyFactor(b, codes[1])]);
    const won = results.filter((r) => r.ok).length;
    expect(won).toBeGreaterThanOrEqual(1);

    const row = await prisma.user.findUnique({ where: { id: UID } });
    const left = JSON.parse(row.mfaBackupCodes);
    expect(left).toHaveLength(3 - won);
    if (won === 1) {
      const loser = results[0].ok ? codes[1] : codes[0];
      expect(left, "отказаният код изчезна, без да е ползван").toContain(hashBackupCode(loser));
      expect((await verifyFactor(row, loser)).ok, "отказаният код не минава при повторен опит").toBe(true);
    }
  });
});
