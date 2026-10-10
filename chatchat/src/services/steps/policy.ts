import type { ApprovalLevel, Prisma, PrismaClient, Role } from '@prisma/client';
import type { ActionClass } from '../../domain/response.js';

/**
 * Политиката за човешко потвърждение (§11.2 Human-in-the-loop) по клиент: кой разрешава стъпка
 * от даден клас. Разумният default: SAFETY_RELEVANT — поддръжката (ДРУГ човек, не заявителят),
 * CONFIGURATIVE — без отделно разрешение (Gate вече иска точен контекст и предупреждава).
 * DIRECT_COMMAND не се изпълнява никога, каквото и да казва политиката.
 */

export type SafetyLevel = Exclude<ApprovalLevel, 'NONE'>;

export interface StepPolicy {
  safetyRelevant: SafetyLevel;
  configurative: ApprovalLevel;
  ttlMinutes: number;
}

export const DEFAULT_STEP_POLICY: StepPolicy = {
  safetyRelevant: 'SUPPORT',
  configurative: 'NONE',
  ttlMinutes: 480,
};

export const APPROVAL_LEVELS = ['NONE', 'SELF', 'SUPPORT', 'ENGINEERING'] as const;
export const SAFETY_LEVELS = ['SELF', 'SUPPORT', 'ENGINEERING'] as const;

type Db = PrismaClient | Prisma.TransactionClient;

export async function loadStepPolicy(db: Db, tenantId: string): Promise<StepPolicy> {
  const row = await db.stepApprovalPolicy.findUnique({ where: { tenantId } });
  if (!row) return DEFAULT_STEP_POLICY;
  return {
    // И при ръчно сменен ред: SAFETY_RELEVANT без разрешение не съществува (fail-closed).
    safetyRelevant: row.safetyRelevant === 'NONE' ? 'SUPPORT' : row.safetyRelevant,
    configurative: row.configurative,
    ttlMinutes: row.ttlMinutes,
  };
}

export type StepRequirement = { executable: false } | { executable: true; level: ApprovalLevel };

/** Какво иска стъпката: изпълнима ли е изобщо и кой я разрешава преди изпълнение. */
export function stepRequirement(
  check: { actionClass: ActionClass; requiresConfirmation: boolean },
  policy: StepPolicy,
): StepRequirement {
  if (check.actionClass === 'DIRECT_COMMAND') return { executable: false };
  if (check.actionClass === 'SAFETY_RELEVANT' || check.requiresConfirmation) {
    return { executable: true, level: policy.safetyRelevant };
  }
  if (check.actionClass === 'CONFIGURATIVE') {
    return { executable: true, level: policy.configurative };
  }
  return { executable: true, level: 'NONE' };
}

/**
 * Ролите, които разрешават на дадено ниво — винаги ДРУГ човек от персонала. Инженерингът е
 * по-високото ниво: разрешава и там, където стига поддръжката. SELF/NONE — никой отвън.
 */
export function approverRoles(level: ApprovalLevel): readonly Role[] {
  if (level === 'SUPPORT') return ['SUPPORT', 'ENGINEERING'];
  if (level === 'ENGINEERING') return ['ENGINEERING'];
  return [];
}

/** Нивата, на които ролята може да разрешава (за списъка „чакащи разрешение“). */
export function levelsApprovableBy(role: Role): ApprovalLevel[] {
  return (['SUPPORT', 'ENGINEERING'] as const).filter((l) => approverRoles(l).includes(role));
}
