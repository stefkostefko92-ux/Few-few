import 'server-only';
// The order of the survey sheet's sections in the company (`Company.ordineSezioni`, src/lib/rilievi/ordine.ts): whoever
// has 'company:edit' sets it on the company page; it holds for the form, the sheet's page, the print and the PDF.
// rilievi's company setting (src/aziende/sezioni.ts, commit ae6329cb6; there the company's ADMIN, `aziende:settings`).
import { prisma } from '@/lib/db';
import { auditTx } from '@/lib/audit';
import type { SectionKey } from '@/lib/rilievi/fields';
import { FISSE, ordineEffettivo, ordinePredefinito } from '@/lib/rilievi/ordine';

/** What the company page shows: the fixed sections (always first) and the others in the company's order. */
export interface SezioniSetting {
  fisse: readonly SectionKey[];
  ordine: SectionKey[];
}

export async function sezioniSetting(companyId: string): Promise<SezioniSetting> {
  const row = await prisma.company.findUnique({ where: { id: companyId }, select: { ordineSezioni: true } });
  return { fisse: FISSE, ordine: ordineEffettivo(row?.ordineSezioni ?? []) };
}

/**
 * Writes the order with its audit row (meta: whether it is the default); the default order is kept empty (a future section
 * takes its own place). `null` — back to the default order. false — the company is not there.
 */
export async function setOrdineSezioni(companyId: string, actorId: string, ordine: readonly SectionKey[] | null): Promise<boolean> {
  const predefinito = ordinePredefinito(ordine);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.company.updateMany({ where: { id: companyId }, data: { ordineSezioni: predefinito || !ordine ? [] : [...ordine] } });
    if (updated.count === 0) return false;
    await auditTx(tx, { companyId, userId: actorId, action: 'COMPANY_SECTIONS_UPDATED', entity: 'Company', entityId: companyId, meta: { predefinito } });
    return true;
  });
}
