import type { LoginOutcome } from '@prisma/client';

/**
 * Изходите, при които човекът е влязъл — с код от приложението или с резервен код. Едно място за
 * правилото: историята на входовете (зелено/червено) и обобщението по IP в панела го четат оттук.
 */
export const SUCCESSFUL_LOGINS = [
  'SUCCESS',
  'MFA_RECOVERY',
] as const satisfies readonly LoginOutcome[];

export function isSuccessfulLogin(outcome: string): boolean {
  return (SUCCESSFUL_LOGINS as readonly string[]).includes(outcome);
}
