import type { AttachmentMeta, InboundMail } from '../inbound/brevo.js';
import type { TicketClass } from './classify.js';

export type TicketStatus =
  'new' | 'drafting' | 'drafted' | 'draft_failed' | 'needs_human' | 'sent' | 'closed';

export interface TicketView {
  id: string;
  receivedAt: Date;
  cls: TicketClass;
  status: TicketStatus;
  attempts: number;
  from: { address: string; name: string | null };
  subject: string;
  text: string;
  attachments: AttachmentMeta[];
  /** Черновата (или пратеният текст след „пратено“). */
  draft: string | null;
  draftAt: Date | null;
  sentAt: Date | null;
}

/**
 * Хранилището на билетите. Две реализации: MemoryTicketStore (тестове) и PrismaTicketStore (продукция —
 * подател, тема, текст и чернова са шифровани с DATA_KEY). Ключът за идемпотентност е SHA-256 на Message-ID.
 */
export interface TicketStore {
  saveInbound(
    mail: InboundMail,
    cls: TicketClass,
    now: Date,
  ): Promise<{ id: string; created: boolean }>;
  /** Взима най-стария билет за чернова и го заключва (status → drafting). */
  claimNext(now: Date): Promise<TicketView | null>;
  setDraft(id: string, text: string, now: Date): Promise<void>;
  /** Неуспешен опит: под тавана — пак „new“, на тавана — „draft_failed“. */
  failDraft(id: string, maxAttempts: number): Promise<void>;
  setStatus(id: string, status: TicketStatus): Promise<void>;
  list(limit: number): Promise<TicketView[]>;
  get(id: string): Promise<TicketView | null>;
  updateDraft(id: string, text: string): Promise<boolean>;
  /** Само веднъж: от drafted/draft_failed/needs_human/new → sent. */
  markSent(id: string, text: string, hash: string, now: Date): Promise<boolean>;
  purgeBefore(cutoff: Date): Promise<number>;
  samples(limit: number): Promise<{ id: string; text: string }[]>;
  addSample(text: string): Promise<string>;
  removeSample(id: string): Promise<boolean>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}

/** Заключен билет без отговор над толкова минути се връща в опашката (процесът е спрял по средата). */
export const LOCK_MINUTES = 10;
export const SENDABLE: ReadonlySet<TicketStatus> = new Set([
  'new',
  'drafted',
  'draft_failed',
  'needs_human',
]);
