import type { PrismaClient } from '@prisma/client';
import type { OwnerRecord, OwnerStore } from './owner-store.js';

export class PrismaOwnerStore implements OwnerStore {
  constructor(private readonly db: PrismaClient) {}

  findByEmail(email: string): Promise<OwnerRecord | null> {
    return this.db.owner.findUnique({ where: { email: email.toLowerCase() } });
  }

  findById(id: string): Promise<OwnerRecord | null> {
    return this.db.owner.findUnique({ where: { id } });
  }

  /** Атомарно: стъпката се записва само ако е по-нова (без двойно ползване на един код). */
  async advanceTotpStep(id: string, step: number): Promise<boolean> {
    const r = await this.db.owner.updateMany({
      where: { id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return r.count === 1;
  }

  async bumpSessionVersion(id: string): Promise<void> {
    await this.db.owner.update({ where: { id }, data: { sessionVersion: { increment: 1 } } });
  }

  create(
    input: Pick<OwnerRecord, 'email' | 'passwordHash' | 'totpSecretEnc'>,
  ): Promise<OwnerRecord> {
    return this.db.owner.create({ data: { ...input, email: input.email.toLowerCase() } });
  }
}
