import type { PrismaClient, Ticket } from '@prisma/client';
import { decryptSecret, encryptSecret } from '../auth/crypto.js';
import type { AttachmentMeta, InboundMail } from '../inbound/brevo.js';
import { initialStatus, type TicketClass } from './classify.js';
import { messageKey } from './memory.js';
import {
  LOCK_MINUTES,
  SENDABLE,
  type TicketStatus,
  type TicketStore,
  type TicketView,
} from './types.js';

/**
 * Продукционното хранилище: подател, тема, текст, чернова и образците са шифровани (AES-256-GCM с DATA_KEY)
 * — в базата и в бекъпите няма открито писмо. Идемпотентност — уникален SHA-256 на Message-ID.
 */
export class PrismaTicketStore implements TicketStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly key: string,
  ) {}

  private enc = (s: string): string => encryptSecret(s, this.key);
  private dec = (s: string): string => decryptSecret(s, this.key);

  private view(t: Ticket): TicketView {
    const from = JSON.parse(this.dec(t.fromEnc)) as { address: string; name: string | null };
    return {
      id: t.id,
      receivedAt: t.receivedAt,
      cls: t.cls as TicketClass,
      status: t.status as TicketStatus,
      attempts: t.attempts,
      from,
      subject: this.dec(t.subjectEnc),
      text: this.dec(t.textEnc),
      attachments: JSON.parse(t.attachments) as AttachmentMeta[],
      draft: t.draftEnc ? this.dec(t.draftEnc) : null,
      draftAt: t.draftAt,
      sentAt: t.sentAt,
    };
  }

  async saveInbound(mail: InboundMail, cls: TicketClass, now: Date) {
    const key = messageKey(mail.messageId);
    const found = await this.db.ticket.findUnique({
      where: { messageKey: key },
      select: { id: true },
    });
    if (found) return { id: found.id, created: false };
    try {
      const t = await this.db.ticket.create({
        data: {
          messageKey: key,
          receivedAt: now,
          cls,
          status: initialStatus(cls),
          fromEnc: this.enc(JSON.stringify({ address: mail.fromAddress, name: mail.fromName })),
          subjectEnc: this.enc(mail.subject),
          textEnc: this.enc(mail.text),
          attachments: JSON.stringify(mail.attachments),
        },
        select: { id: true },
      });
      return { id: t.id, created: true };
    } catch (e) {
      // Две доставки на същото писмо едновременно: уникалният ключ печели, втората е дубликат.
      if ((e as { code?: string }).code === 'P2002') {
        const t = await this.db.ticket.findUnique({
          where: { messageKey: key },
          select: { id: true },
        });
        if (t) return { id: t.id, created: false };
      }
      throw e;
    }
  }

  async claimNext(now: Date) {
    const stale = new Date(now.getTime() - LOCK_MINUTES * 60_000);
    for (let i = 0; i < 3; i++) {
      const c = await this.db.ticket.findFirst({
        where: { OR: [{ status: 'new' }, { status: 'drafting', lockedAt: { lt: stale } }] },
        orderBy: { receivedAt: 'asc' },
        select: { id: true, status: true, lockedAt: true },
      });
      if (!c) return null;
      // Оптимистично заключване: само ако никой друг не го е взел междувременно.
      const won = await this.db.ticket.updateMany({
        where: { id: c.id, status: c.status, lockedAt: c.lockedAt },
        data: { status: 'drafting', lockedAt: now },
      });
      if (won.count === 1) return this.get(c.id);
    }
    return null;
  }

  async setDraft(id: string, text: string, now: Date) {
    await this.db.ticket.updateMany({
      where: { id, status: 'drafting' },
      data: { draftEnc: this.enc(text), draftAt: now, status: 'drafted', lockedAt: null },
    });
  }

  async failDraft(id: string, maxAttempts: number) {
    const t = await this.db.ticket.update({
      where: { id },
      data: { attempts: { increment: 1 }, lockedAt: null },
      select: { attempts: true },
    });
    await this.db.ticket.update({
      where: { id },
      data: { status: t.attempts >= maxAttempts ? 'draft_failed' : 'new' },
    });
  }

  async setStatus(id: string, status: TicketStatus) {
    await this.db.ticket.updateMany({ where: { id }, data: { status, lockedAt: null } });
  }

  async list(limit: number) {
    const rows = await this.db.ticket.findMany({ orderBy: { receivedAt: 'desc' }, take: limit });
    return rows.map((t) => this.view(t));
  }

  async get(id: string) {
    const t = await this.db.ticket.findUnique({ where: { id } });
    return t ? this.view(t) : null;
  }

  async updateDraft(id: string, text: string) {
    const r = await this.db.ticket.updateMany({
      where: { id, status: { in: [...SENDABLE] } },
      data: { draftEnc: this.enc(text) },
    });
    return r.count === 1;
  }

  async markSent(id: string, text: string, hash: string, now: Date) {
    const r = await this.db.ticket.updateMany({
      where: { id, status: { in: [...SENDABLE] } },
      data: {
        status: 'sent',
        draftEnc: this.enc(text),
        sentHash: hash,
        sentAt: now,
        lockedAt: null,
      },
    });
    return r.count === 1;
  }

  async purgeBefore(cutoff: Date) {
    const r = await this.db.ticket.deleteMany({ where: { receivedAt: { lt: cutoff } } });
    return r.count;
  }

  async samples(limit: number) {
    const rows = await this.db.sample.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map((s) => ({ id: s.id, text: this.dec(s.textEnc) }));
  }

  async addSample(text: string) {
    return (
      await this.db.sample.create({ data: { textEnc: this.enc(text) }, select: { id: true } })
    ).id;
  }

  async removeSample(id: string) {
    return (await this.db.sample.deleteMany({ where: { id } })).count === 1;
  }

  async getSetting(key: string) {
    return (await this.db.setting.findUnique({ where: { key } }))?.value ?? null;
  }

  async setSetting(key: string, value: string) {
    await this.db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
}
