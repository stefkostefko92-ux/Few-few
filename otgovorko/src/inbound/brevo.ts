import { z } from 'zod';

/**
 * Парсерът на Brevo inbound (developers.brevo.com/docs/inbound-parse-webhooks, сверено 27.11.2026):
 * `{items: [...]}`, по един запис на писмо. Документацията сама казва, че парсването не е 100%, а примерът
 * и таблицата се разминават (Spam.Score срещу SpamScore) — затова схемата е снизходителна, а лош запис се
 * брои и се пропуска, без да чупи останалите. Писмото е ДАННИ — тук само се чете, нищо не се изпълнява.
 */
export interface AttachmentMeta {
  name: string;
  contentType: string;
  size: number;
}

export interface InboundMail {
  messageId: string;
  inReplyTo: string | null;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  text: string;
  spamScore: number | null;
  /** Само имената — DownloadToken не се пази, файловете не се свалят. */
  attachments: AttachmentMeta[];
}

const MAX_TEXT = 20_000;
const str = z.string().nullish();
const Mailbox = z.object({ Address: z.string().min(3).max(320), Name: str }).passthrough();
const Item = z
  .object({
    MessageId: z.string().min(3).max(998),
    InReplyTo: str,
    From: Mailbox,
    Subject: str,
    RawHtmlBody: str,
    RawTextBody: str,
    ExtractedMarkdownMessage: str,
    SpamScore: z.number().nullish(),
    Spam: z.object({ Score: z.number().nullish() }).passthrough().nullish(),
    Attachments: z
      .array(
        z
          .object({ Name: str, ContentType: str, ContentLength: z.number().nullish() })
          .passthrough(),
      )
      .nullish(),
  })
  .passthrough();

/** HTML → обикновен текст за краен случай (без Markdown и без текстова част). Не е за показване като HTML. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

const clean = (s: string): string =>
  s
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim();

export function parseBrevoPayload(body: unknown): { mails: InboundMail[]; invalid: number } {
  const items =
    body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)
      ? ((body as { items: unknown[] }).items as unknown[])
      : [];
  const mails: InboundMail[] = [];
  let invalid = 0;
  for (const raw of items) {
    const p = Item.safeParse(raw);
    if (!p.success) {
      invalid++;
      continue;
    }
    const it = p.data;
    const address = it.From.Address.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      invalid++;
      continue;
    }
    const body =
      it.ExtractedMarkdownMessage?.trim() ||
      it.RawTextBody?.trim() ||
      (it.RawHtmlBody ? htmlToText(it.RawHtmlBody) : '');
    mails.push({
      messageId: it.MessageId.trim(),
      inReplyTo: it.InReplyTo?.trim() || null,
      fromAddress: address,
      fromName: it.From.Name?.trim() || null,
      subject: clean(it.Subject ?? '').slice(0, 500),
      text: clean(body).slice(0, MAX_TEXT),
      spamScore: it.Spam?.Score ?? it.SpamScore ?? null,
      attachments: (it.Attachments ?? []).slice(0, 50).map((a) => ({
        name: clean(a.Name ?? '').slice(0, 200) || '(без име)',
        contentType: clean(a.ContentType ?? '').slice(0, 100),
        size: Math.max(0, Math.round(a.ContentLength ?? 0)),
      })),
    });
  }
  return { mails, invalid };
}
