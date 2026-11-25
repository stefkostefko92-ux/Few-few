import { prisma } from '../db.js';
import { sealHmac } from '../auth/keys.js';
import {
  CHAIN_START,
  inputHash,
  sha256,
  verifyChainFrom,
  type ChainProblem,
  type ChainState,
} from './chain.js';

/**
 * Проверката на веригата на една фирма от базата: на страници по 500 (голяма фирма не зарежда всичките си
 * XML-и наведнъж). Отпечатъците на XML-ите и (за звената v2) на входа се смятат наново от записаното —
 * променен документ, вход или звено се хваща като първия проблем.
 */
export async function verifyOrganizationChain(
  organizationId: string,
): Promise<{ count: number; problem: ChainProblem | null }> {
  let state: ChainState = CHAIN_START;
  let count = 0;
  for (;;) {
    const docs = await prisma.document.findMany({
      where: { organizationId, chainIndex: { gte: state.nextIndex } },
      orderBy: { chainIndex: 'asc' },
      take: 500,
      select: {
        organizationId: true,
        chainIndex: true,
        number: true,
        typeCode: true,
        issueDate: true,
        payableCents: true,
        vatCents: true,
        ublXml: true,
        ciiXml: true,
        input: true,
        inputSha256: true,
        prevHash: true,
        sha256: true,
        seal: true,
      },
    });
    if (docs.length === 0) break;
    const result = verifyChainFrom(
      docs.map((d) => ({
        organizationId: d.organizationId,
        chainIndex: d.chainIndex!,
        number: d.number ?? '',
        typeCode: d.typeCode,
        status: 'ISSUED' as const,
        issueDate: d.issueDate.toISOString().slice(0, 10),
        payableCents: d.payableCents,
        vatCents: d.vatCents,
        ublSha256: sha256(d.ublXml ?? ''),
        ciiSha256: sha256(d.ciiXml ?? ''),
        // Звено v2: отпечатъкът се смята наново от записания вход — променен вход чупи звеното.
        inputSha256: d.inputSha256 ? inputHash(d.input) : null,
        prevHash: d.prevHash ?? '',
        sha256: d.sha256 ?? '',
        seal: d.seal ?? '',
      })),
      sealHmac,
      state,
    );
    count += docs.length;
    if (result.problem) return { count, problem: result.problem };
    state = result.state;
    if (docs.length < 500) break;
  }
  return { count, problem: null };
}
