import { setting } from '../admin/settings.js';

/** Настройките на издаването от мастър панела (срок, банкова сметка, профил, подпис). */
export interface IssueSettings {
  deadlineDays: number;
  requireBankAccount: boolean;
  profile: 'en16931' | 'peppol';
  signature: string;
}

/** Настройките на издаването от мастър панела — четат се преди транзакцията. */
export async function issueSettings(): Promise<IssueSettings> {
  const [deadlineDays, requireBankAccount, profile, signature] = await Promise.all([
    setting('issue.deadlineDays'),
    setting('issue.requireBankAccount'),
    setting('issue.profile'),
    setting('documents.signature'),
  ]);
  return { deadlineDays, requireBankAccount, profile, signature };
}
