import { z } from 'zod';

/**
 * Логиката на `audit-verify.ts` без базата — отделно, за да се тества без да пуска CLI-то.
 *
 * Счупено звено → втора проверка след кратка пауза: ретенцията (pruneAudit) трие най-старото парче и
 * пише нова контролна точка в една транзакция, а двете четения на verifyAuditChain са отделни заявки —
 * проверка точно по време на ретенцията може да види редовете отпреди и точката отслед. Счупено и
 * при втората → наистина счупено.
 */

export type ChainVerdict =
  { status: 'intact'; transient: boolean } | { status: 'broken'; eventId: number };

/** Изходът на процеса: 0 — цяла; 2 — счупена (страница); 1 — проверката не завърши. */
export const EXIT_INTACT = 0;
export const EXIT_FAILED = 1;
export const EXIT_BROKEN = 2;

export async function verifyWithConfirmation(
  verify: () => Promise<number | null>,
  wait: (ms: number) => Promise<unknown>,
  confirmDelayMs: number,
): Promise<ChainVerdict> {
  const first = await verify();
  if (first === null) return { status: 'intact', transient: false };
  await wait(confirmDelayMs);
  const second = await verify();
  if (second === null) return { status: 'intact', transient: true };
  return { status: 'broken', eventId: second };
}

const Args = z.object({
  confirmDelayMs: z.coerce.number().int().min(0).max(600_000).default(30_000),
});

/** `--confirm-delay-ms <0…600000>` (по подразбиране 30 s); друго — грешка (изход 1). */
export function parseArgs(argv: readonly string[]): z.infer<typeof Args> {
  const at = argv.indexOf('--confirm-delay-ms');
  return Args.parse({ confirmDelayMs: at >= 0 ? argv[at + 1] : undefined });
}
