import { ReportStatus } from '@prisma/client';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';

import { env } from '../env.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import { getTransport } from './transport.js';

type MediaForEmail = {
  path: string;
  bytes: number;
};

export type ReportForEmail = {
  publicCode: string;
  categoryName: string;
  settlementName: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
  reporterName: string | null;
  reporterPhone: string | null;
  createdAt: Date;
  media: MediaForEmail[];
};

type Attachment = { filename: string; path: string };

type BuiltEmail = {
  subject: string;
  text: string;
  html: string;
  attachments: Attachment[];
  skippedMedia: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const dateFormatter = new Intl.DateTimeFormat('bg-BG', {
  timeZone: 'Europe/Sofia',
  dateStyle: 'long',
  timeStyle: 'short',
});

/** Подбира прикачени файлове до тавана за общ размер; връща и броя пропуснати. */
function selectAttachments(media: MediaForEmail[]): {
  attachments: Attachment[];
  skipped: number;
} {
  const attachments: Attachment[] = [];
  let budget = env.emailAttachMaxBytes;
  let skipped = 0;
  for (const [index, m] of media.entries()) {
    if (m.bytes <= budget) {
      attachments.push({ filename: `снимка-${index + 1}${extOf(m.path)}`, path: m.path });
      budget -= m.bytes;
    } else {
      skipped += 1;
    }
  }
  return { attachments, skipped };
}

function extOf(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  return dot >= 0 ? filePath.slice(dot) : '';
}

/**
 * Сглобява имейла към общината. Чиста функция — лесна за тест без SMTP.
 * Текстът от гражданина е ненадежден: в HTML варианта се ескейпва.
 */
export function buildMunicipalityEmail(report: ReportForEmail): BuiltEmail {
  const { attachments, skipped } = selectAttachments(report.media);
  const mapsLink =
    report.lat != null && report.lng != null
      ? `https://www.google.com/maps?q=${report.lat},${report.lng}`
      : null;

  const lines: string[] = [
    `Нов сигнал от приложението „Помагам Бобов дол".`,
    ``,
    `Код за проследяване: ${report.publicCode}`,
    `Категория: ${report.categoryName}`,
    `Населено място: ${report.settlementName}`,
    `Подаден на: ${dateFormatter.format(report.createdAt)}`,
  ];
  if (mapsLink) {
    lines.push(`Локация: ${mapsLink}`);
  }
  if (report.description) {
    lines.push('', 'Описание:', report.description);
  }
  if (report.reporterName || report.reporterPhone) {
    lines.push('', 'Подател (по желание):');
    if (report.reporterName) lines.push(`  Име: ${report.reporterName}`);
    if (report.reporterPhone) lines.push(`  Телефон: ${report.reporterPhone}`);
  }
  if (attachments.length > 0) {
    lines.push('', `Прикачени файла: ${attachments.length}`);
  }
  if (skipped > 0) {
    lines.push(
      `Забележка: ${skipped} файл(а) са твърде големи за имейл и не са приложени.`,
    );
  }
  lines.push(
    '',
    'Сигналът е прегледан и одобрен от модератор преди препращане.',
    'Това е автоматично съобщение — моля, не отговаряйте на него.',
  );
  const text = lines.join('\n');

  const htmlRows: string[] = [
    `<p>Нов сигнал от приложението „Помагам Бобов дол".</p>`,
    `<table cellpadding="6" style="border-collapse:collapse">`,
    row('Код за проследяване', report.publicCode),
    row('Категория', report.categoryName),
    row('Населено място', report.settlementName),
    row('Подаден на', dateFormatter.format(report.createdAt)),
  ];
  if (mapsLink) {
    htmlRows.push(
      `<tr><td><b>Локация</b></td><td><a href="${mapsLink}">Виж на картата</a></td></tr>`,
    );
  }
  if (report.reporterName) htmlRows.push(row('Подател', report.reporterName));
  if (report.reporterPhone) htmlRows.push(row('Телефон', report.reporterPhone));
  htmlRows.push('</table>');
  if (report.description) {
    htmlRows.push(
      `<p><b>Описание:</b></p><p>${escapeHtml(report.description).replace(/\n/g, '<br>')}</p>`,
    );
  }
  if (skipped > 0) {
    htmlRows.push(
      `<p><i>${skipped} файл(а) са твърде големи за имейл и не са приложени.</i></p>`,
    );
  }
  htmlRows.push(
    `<hr><p style="color:#666">Сигналът е прегледан и одобрен от модератор преди препращане. Това е автоматично съобщение — моля, не отговаряйте на него.</p>`,
  );

  return {
    subject: `Помагам Бобов дол — нов сигнал ${report.publicCode}: ${report.categoryName}, ${report.settlementName}`,
    text,
    html: htmlRows.join('\n'),
    attachments,
    skippedMedia: skipped,
  };
}

function row(label: string, value: string): string {
  return `<tr><td><b>${escapeHtml(label)}</b></td><td>${escapeHtml(value)}</td></tr>`;
}

/**
 * Зарежда одобрен сигнал, изпраща имейла към общината и отбелязва статус SENT.
 * Идемпотентна: ако сигналът вече не е APPROVED (напр. вече изпратен), пропуска
 * тихо. Грешка при изпращане се хвърля нагоре, за да поеме retry на BullMQ.
 */
export async function sendMunicipalityEmail(reportId: string): Promise<void> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { category: true, settlement: true, media: true },
  });
  if (!report) {
    logger.warn({ reportId }, 'email job: report missing, skipping');
    return;
  }
  if (report.status !== ReportStatus.APPROVED) {
    logger.info({ reportId, status: report.status }, 'email job: not APPROVED, skipping');
    return;
  }

  const email = buildMunicipalityEmail({
    publicCode: report.publicCode,
    categoryName: report.category.nameBg,
    settlementName: report.settlement.nameBg,
    description: report.description,
    lat: report.lat,
    lng: report.lng,
    reporterName: report.reporterName,
    reporterPhone: report.reporterPhone,
    createdAt: report.createdAt,
    media: report.media.map((m) => ({ path: m.path, bytes: m.bytes })),
  });

  const info = (await getTransport().sendMail({
    from: env.EMAIL_FROM,
    to: env.EMAIL_TO_MUNICIPALITY,
    subject: email.subject,
    text: email.text,
    html: email.html,
    attachments: email.attachments,
  })) as SMTPTransport.SentMessageInfo;

  // Маркираме SENT само ако все още е APPROVED — пази от двоен преход.
  const moved = await prisma.report.updateMany({
    where: { id: reportId, status: ReportStatus.APPROVED },
    data: { status: ReportStatus.SENT },
  });
  if (moved.count > 0) {
    await prisma.reportEvent.create({
      data: { reportId, type: 'SENT', note: `messageId: ${info.messageId}` },
    });
  }
  logger.info({ reportId, messageId: info.messageId }, 'municipality email sent');
}
