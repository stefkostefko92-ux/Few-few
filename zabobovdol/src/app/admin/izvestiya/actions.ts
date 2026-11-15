"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notifyTopic, PUSH_TOPICS } from "@/lib/push";
import { safeInternalPath } from "@/lib/push-core";

const schema = z.object({
  topic: z.enum(Object.keys(PUSH_TOPICS) as [string, ...string[]]),
  title: z.string().trim().min(3, "Напишете заглавие.").max(90, "Заглавието е твърде дълго (до 90 знака)."),
  body: z.string().trim().min(3, "Напишете текст.").max(180, "Текстът е твърде дълъг (до 180 знака)."),
  url: z.string().trim().max(200).default("/"),
  confirm: z.literal("on", { errorMap: () => ({ message: "Отметнете потвърждението." }) }),
});

// Ръчно известие по тема. Само ADMIN; изисква потвърждение; вътрешна връзка.
export async function sendManualPush(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = schema.safeParse({
    topic: formData.get("topic"),
    title: formData.get("title"),
    body: formData.get("body"),
    url: formData.get("url") || "/",
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    redirect("/admin/izvestiya?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Невалидни данни."));
  }
  const d = parsed.data;
  const url = safeInternalPath(d.url);
  if (url === "/" && d.url !== "/") {
    redirect("/admin/izvestiya?error=" + encodeURIComponent("Връзката трябва да е вътрешна, напр. /izmami."));
  }
  const r = await notifyTopic(d.topic as keyof typeof PUSH_TOPICS, { title: d.title, body: d.body, url });
  await logAudit(admin, {
    action: "UPDATE",
    entity: "PushSubscription",
    summary: r.configured
      ? `Ръчно известие по тема „${d.topic}“: изпратено ${r.sent}, неуспешни ${r.failed}`
      : `Опит за ръчно известие по тема „${d.topic}“ — известията не са настроени`,
  });
  if (!r.configured) {
    redirect("/admin/izvestiya?error=" + encodeURIComponent("Известията не са настроени на сървъра (липсват VAPID ключове)."));
  }
  redirect(`/admin/izvestiya?sent=${r.sent}&failed=${r.failed}`);
}
