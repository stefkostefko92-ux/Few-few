import type { CurrencyKind, LedgerReason, Prisma } from "@prisma/client";

/**
 * Движения на валутата (chips/gems) + регистърът `CurrencyLedger`.
 *
 * Отделен вход (`@aso/db/ledger`), без runtime импорт от Prisma: работи върху
 * подадената транзакция, затова тестовете, които заменят `@aso/db`, не го чупят.
 * Всяка функция се вика ВЪТРЕ в транзакцията на промяната — балансът и редът в
 * регистъра се записват атомарно или изобщо.
 */

/** Само делегатите, които ни трябват — реалният `Prisma.TransactionClient` пасва структурно. */
export type LedgerTx = Pick<Prisma.TransactionClient, "user" | "currencyLedger">;

export interface LedgerEntry {
  userId: string;
  currency: CurrencyKind;
  /** Реално приложената промяна със знак (кредит > 0, дебит < 0). */
  delta: bigint | number;
  reason: LedgerReason;
  refId?: string | null;
  /** Колко от поискания дебит НЕ е взето (балансът е спрял на 0). */
  shortfall?: bigint | number;
}

/** Записва движение; празно движение (0 и без недостиг) не оставя ред. */
export async function recordLedger(tx: LedgerTx, e: LedgerEntry): Promise<void> {
  const delta = BigInt(e.delta);
  const shortfall = BigInt(e.shortfall ?? 0);
  if (delta === 0n && shortfall === 0n) return;
  await tx.currencyLedger.create({
    data: { userId: e.userId, currency: e.currency, delta, reason: e.reason, refId: e.refId ?? null, shortfall },
  });
}

/** Атомарен кредит (+ ред в регистъра). `amount <= 0` не прави нищо. */
export async function credit(
  tx: LedgerTx,
  userId: string,
  currency: CurrencyKind,
  amount: bigint | number,
  reason: LedgerReason,
  refId?: string | null,
): Promise<void> {
  const n = BigInt(amount);
  if (n <= 0n) return;
  await tx.user.update({
    where: { id: userId },
    data: currency === "CHIPS" ? { chips: { increment: n } } : { gems: { increment: Number(n) } },
  });
  await recordLedger(tx, { userId, currency, delta: n, reason, refId });
}

export interface DebitResult {
  taken: bigint;
  shortfall: bigint;
}

/** Опити за CAS при надпревара (кредит/дебит между четенето и записа). */
const CAS_ATTEMPTS = 5;

/**
 * Дебит, който НИКОГА не сваля баланса под 0: първо условен `updateMany` с
 * `gte` (целият дебит); ако няма достатъчно — взема наличното с CAS по точната
 * прочетена стойност (до 0) и връща недостига. Без абсолютен SET от прочетена
 * стойност — конкурентен кредит не се губи. Записва ред в регистъра.
 */
export async function debitClamped(
  tx: LedgerTx,
  userId: string,
  currency: CurrencyKind,
  amount: bigint | number,
  reason: LedgerReason,
  refId?: string | null,
): Promise<DebitResult> {
  const want = BigInt(amount);
  if (want <= 0n) return { taken: 0n, shortfall: 0n };
  const isChips = currency === "CHIPS";

  for (let i = 0; i < CAS_ATTEMPTS; i++) {
    const full = await tx.user.updateMany({
      where: isChips ? { id: userId, chips: { gte: want } } : { id: userId, gems: { gte: Number(want) } },
      data: isChips ? { chips: { decrement: want } } : { gems: { decrement: Number(want) } },
    });
    if (full.count === 1) {
      await recordLedger(tx, { userId, currency, delta: -want, reason, refId });
      return { taken: want, shortfall: 0n };
    }

    const row = await tx.user.findUnique({ where: { id: userId }, select: { chips: true, gems: true } });
    if (!row) return { taken: 0n, shortfall: want }; // няма акаунт — нищо за вземане
    const have = isChips ? row.chips : BigInt(row.gems);
    if (have >= want) continue; // междувременно е дошъл кредит — пак целия дебит
    if (have <= 0n) {
      await recordLedger(tx, { userId, currency, delta: 0n, reason, refId, shortfall: want });
      return { taken: 0n, shortfall: want };
    }
    // CAS: взема точно наличното само ако балансът още е същият.
    const part = await tx.user.updateMany({
      where: isChips ? { id: userId, chips: have } : { id: userId, gems: Number(have) },
      data: isChips ? { chips: { decrement: have } } : { gems: { decrement: Number(have) } },
    });
    if (part.count === 1) {
      const shortfall = want - have;
      await recordLedger(tx, { userId, currency, delta: -have, reason, refId, shortfall });
      return { taken: have, shortfall };
    }
  }
  // Постоянна надпревара — хвърляме: транзакцията се отменя изцяло (нищо наполовина).
  throw new Error(`debitClamped: balance kept changing for ${userId}`);
}
