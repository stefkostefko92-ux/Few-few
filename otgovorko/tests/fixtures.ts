// Общият пример за писмо от Brevo inbound (форматът от developers.brevo.com/docs/inbound-parse-webhooks).
export const item = (over: Record<string, unknown> = {}) => ({
  Uuid: ['u-1'],
  MessageId: '<abc-1@mail.example>',
  InReplyTo: null,
  From: { Address: 'Ivan@Firma.bg', Name: 'Иван Петров' },
  To: [{ Address: 'pomosht@carbonstealth.eu', Name: null }],
  Cc: [],
  ReplyTo: null,
  SentAtDate: 'Fri, 27 Nov 2026 11:59:00 +0200',
  Subject: 'Не мога да вляза в профила',
  RawHtmlBody: '<p>Здравейте, не мога да вляза.</p>',
  RawTextBody: 'Здравейте, не мога да вляза.\n\n--\nИван',
  ExtractedMarkdownMessage: 'Здравейте, не мога да вляза.',
  ExtractedMarkdownSignature: 'Иван',
  SpamScore: 0.4,
  Attachments: [
    {
      Name: 'snimka.png',
      ContentType: 'image/png',
      ContentLength: 2048,
      ContentID: '',
      DownloadToken: 'SECRET-DL-TOKEN',
    },
  ],
  Headers: { 'Message-Id': '<abc-1@mail.example>' },
  ...over,
});
