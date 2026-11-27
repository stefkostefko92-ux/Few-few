import { createHash, randomUUID } from 'node:crypto';
import type { InboundMail } from '../inbound/brevo.js';
import { initialStatus, type TicketClass } from './classify.js';
import {
  LOCK_MINUTES,
  SENDABLE,
  type TicketStatus,
  type TicketStore,
  type TicketView,
} from './types.js';

export const messageKey = (messageId: string): string =>
  createHash('sha256').update(messageId.trim()).digest('hex');

interface Row extends TicketView {
  key: string;
  lockedAt: Date | null;
  sentHash: string | null;
}

/** За тестовете — същото поведение като PrismaTicketStore, без шифроване. */
export class MemoryTicketStore implements TicketStore {
  private rows: Row[] = [];
  private sampleRows: { id: string; text: string; at: number }[] = [];
  private settings = new Map<string, string>();

  private view(r: Row): TicketView {
    const { key: _k, lockedAt: _l, sentHash: _s, ...v } = r;
    return structuredClone(v);
  }

  async saveInbound(mail: InboundMail, cls: TicketClass, now: Date) {
    const key = messageKey(mail.messageId);
    const found = this.rows.find((r) => r.key === key);
    if (found) return { id: found.id, created: false };
    const row: Row = {
      id: randomUUID(),
      key,
      receivedAt: now,
      cls,
      status: initialStatus(cls),
      attempts: 0,
      from: { address: mail.fromAddress, name: mail.fromName },
      subject: mail.subject,
      text: mail.text,
      attachments: mail.attachments,
      draft: null,
      draftAt: null,
      sentAt: null,
      lockedAt: null,
      sentHash: null,
    };
    this.rows.push(row);
    return { id: row.id, created: true };
  }

  async claimNext(now: Date) {
    const stale = now.getTime() - LOCK_MINUTES * 60_000;
    const r = this.rows
      .filter(
        (x) =>
          x.status === 'new' || (x.status === 'drafting' && (x.lockedAt?.getTime() ?? 0) < stale),
      )
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())[0];
    if (!r) return null;
    r.status = 'drafting';
    r.lockedAt = now;
    return this.view(r);
  }

  async setDraft(id: string, text: string, now: Date) {
    const r = this.rows.find((x) => x.id === id);
    if (!r || r.status !== 'drafting') return;
    Object.assign(r, { draft: text, draftAt: now, status: 'drafted', lockedAt: null });
  }

  async failDraft(id: string, maxAttempts: number) {
    const r = this.rows.find((x) => x.id === id);
    if (!r) return;
    r.attempts++;
    r.lockedAt = null;
    r.status = r.attempts >= maxAttempts ? 'draft_failed' : 'new';
  }

  async setStatus(id: string, status: TicketStatus) {
    const r = this.rows.find((x) => x.id === id);
    if (r) Object.assign(r, { status, lockedAt: null });
  }

  async list(limit: number) {
    return [...this.rows]
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
      .slice(0, limit)
      .map((r) => this.view(r));
  }

  async get(id: string) {
    const r = this.rows.find((x) => x.id === id);
    return r ? this.view(r) : null;
  }

  async updateDraft(id: string, text: string) {
    const r = this.rows.find((x) => x.id === id);
    if (!r || !SENDABLE.has(r.status)) return false;
    r.draft = text;
    return true;
  }

  async markSent(id: string, text: string, hash: string, now: Date) {
    const r = this.rows.find((x) => x.id === id);
    if (!r || !SENDABLE.has(r.status)) return false;
    Object.assign(r, { status: 'sent', draft: text, sentHash: hash, sentAt: now, lockedAt: null });
    return true;
  }

  async purgeBefore(cutoff: Date) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.receivedAt.getTime() >= cutoff.getTime());
    return before - this.rows.length;
  }

  async samples(limit: number) {
    return [...this.sampleRows]
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map(({ id, text }) => ({ id, text }));
  }

  async addSample(text: string) {
    const id = randomUUID();
    this.sampleRows.push({ id, text, at: Date.now() + this.sampleRows.length });
    return id;
  }

  async removeSample(id: string) {
    const n = this.sampleRows.length;
    this.sampleRows = this.sampleRows.filter((s) => s.id !== id);
    return this.sampleRows.length < n;
  }

  async getSetting(key: string) {
    return this.settings.get(key) ?? null;
  }

  async setSetting(key: string, value: string) {
    this.settings.set(key, value);
  }
}
