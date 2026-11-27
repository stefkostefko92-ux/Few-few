import { randomUUID } from 'node:crypto';

export interface OwnerRecord {
  id: string;
  email: string;
  passwordHash: string;
  totpSecretEnc: string;
  totpLastStep: number | null;
  sessionVersion: number;
}

export interface OwnerStore {
  findByEmail(email: string): Promise<OwnerRecord | null>;
  findById(id: string): Promise<OwnerRecord | null>;
  /** Записва приетата TOTP стъпка само ако е по-голяма от записаната (без повторно ползване). */
  advanceTotpStep(id: string, step: number): Promise<boolean>;
  /** Обезсилва всички издадени сесии. */
  bumpSessionVersion(id: string): Promise<void>;
  create(
    input: Pick<OwnerRecord, 'email' | 'passwordHash' | 'totpSecretEnc'>,
  ): Promise<OwnerRecord>;
}

export class MemoryOwnerStore implements OwnerStore {
  private owners: OwnerRecord[] = [];

  async findByEmail(email: string): Promise<OwnerRecord | null> {
    return this.owners.find((o) => o.email === email.toLowerCase()) ?? null;
  }

  async findById(id: string): Promise<OwnerRecord | null> {
    return this.owners.find((o) => o.id === id) ?? null;
  }

  async advanceTotpStep(id: string, step: number): Promise<boolean> {
    const o = this.owners.find((x) => x.id === id);
    if (!o || (o.totpLastStep !== null && step <= o.totpLastStep)) return false;
    o.totpLastStep = step;
    return true;
  }

  async bumpSessionVersion(id: string): Promise<void> {
    const o = this.owners.find((x) => x.id === id);
    if (o) o.sessionVersion += 1;
  }

  async create(
    input: Pick<OwnerRecord, 'email' | 'passwordHash' | 'totpSecretEnc'>,
  ): Promise<OwnerRecord> {
    const o = {
      id: randomUUID(),
      totpLastStep: null,
      sessionVersion: 0,
      ...input,
      email: input.email.toLowerCase(),
    };
    this.owners.push(o);
    return o;
  }
}
