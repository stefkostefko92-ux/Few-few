import { prisma } from '../db.js';

/**
 * Един TOTP код = едно ползване (OWASP ASVS 5.0 v6.5.1; находка на Прониквача, 2026-11-15).
 * Без това кодът важи до ~90 s (прозорецът ±1 стъпка) и прихванат код влиза повторно.
 * Пазим последната използвана стъпка и я приемаме само ако новата е строго по-голяма — с условен
 * `updateMany`, затова от два паралелни опита с един и същ код минава точно един.
 */
export type StepCondition = { totpLastStep: null } | { totpLastStep: { lt: number } };

export interface TotpStepStore {
  updateMany(args: {
    where: { id: string; OR: StepCondition[] };
    data: { totpLastStep: number };
  }): Promise<{ count: number }>;
}

const prismaStore: TotpStepStore = {
  updateMany: (args) => prisma.user.updateMany(args),
};

/** true, ако стъпката е нова за потребителя и е записана; false при повторение или по-стара стъпка. */
export async function consumeTotpStep(
  userId: string,
  step: number,
  store: TotpStepStore = prismaStore,
): Promise<boolean> {
  const { count } = await store.updateMany({
    where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  return count === 1;
}
