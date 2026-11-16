"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { sendMail } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { complaintMail, dumpMail, forwardNote, parseRecipient } from "@/lib/forward-core";

// „Изпрати сега“ — препращане от админ панела направо през пощата на сайта
// (Brevo), вместо „отвори в пощата си, копирай, отбележи ръчно“. Успех →
// статус „Препратен“ + до кого; провал → нищо не се сменя и панелът казва защо.
// Текстът на писмото се прави на сървъра от записа в базата (не от формата).

const str = (fd: FormData, k: string, max: number) =>
  (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "").slice(0, max);

function back(base: string, params: Record<string, string>): never {
  const q = new URLSearchParams(params).toString();
  redirect(`${base}${base.includes("?") ? "&" : "?"}${q}`);
}

async function guard(base: string) {
  const admin = await requireAdmin();
  if (!rateLimit(`forward:${admin.id}`, 20, 10 * 60 * 1000)) back(base, { fwd: "limit" });
  return admin;
}

/** Сигнал до общината (или друга институция) — с данните на подателя, както при подаването. */
export async function forwardComplaint(id: string, fd: FormData): Promise<void> {
  const base = "/admin/signali";
  const admin = await guard(base);
  const to = parseRecipient(str(fd, "to", 300));
  if (!to.ok) back(base, { fwd: "bad", id });
  const c = await prisma.complaint.findUnique({ where: { id } });
  if (!c) back(base, { fwd: "missing" });

  const mail = complaintMail(c, SITE.domain, str(fd, "note", 2000));
  const res = await sendMail({ to: to.email, subject: mail.subject, text: mail.text, replyTo: c.email || undefined });
  if (!res.sent) back(base, { fwd: res.reason === "SMTP не е конфигуриран" ? "off" : "err", id });

  await prisma.complaint.update({ where: { id }, data: { status: "FORWARDED", forwardedTo: to.email } });
  await logAudit(admin, {
    action: "UPDATE",
    entity: "Complaint",
    entityId: id,
    summary: `Сигнал ${c.refCode} препратен по имейл до ${to.email}`,
  });
  revalidatePath(base);
  back(base, { fwd: "ok", to: to.email });
}

/** Сигнал за сметище — БЕЗ данните на подателя (те са само вътрешни). */
export async function forwardDumpReport(id: string, fd: FormData): Promise<void> {
  const base = `/admin/smetishta/${encodeURIComponent(id)}`;
  const admin = await guard(base);
  const to = parseRecipient(str(fd, "to", 300));
  if (!to.ok) back(base, { fwd: "bad" });
  const d = await prisma.dumpReport.findUnique({ where: { id } });
  if (!d) back("/admin/smetishta", { fwd: "missing" });

  const mail = dumpMail(d, SITE.domain, SITE.contact.email, str(fd, "note", 2000));
  const res = await sendMail({ to: to.email, subject: mail.subject, text: mail.text, replyTo: SITE.contact.email });
  if (!res.sent) back(base, { fwd: res.reason === "SMTP не е конфигуриран" ? "off" : "err" });

  await prisma.dumpReport.update({
    where: { id },
    data: { status: "FORWARDED", adminNote: forwardNote(d.adminNote, to.email, new Date()) },
  });
  await logAudit(admin, {
    action: "UPDATE",
    entity: "DumpReport",
    entityId: id,
    summary: `Сигнал за сметище препратен по имейл до ${to.email}`,
  });
  revalidatePath("/admin/smetishta");
  revalidatePath(base);
  back(base, { fwd: "ok", to: to.email });
}
