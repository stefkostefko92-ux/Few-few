// Целта на QR стикера: техникът сканира и вижда ТОЗИ импиант.
//
// Отделен, къс адрес (`/i/<matricola>`) вместо `/impianti/<uuid>`: кодът е
// по-рядък и се сканира по-лесно от протрит стикер, а при отлепена лепенка
// човек въвежда матриколата на ръка от табелката.
//
// Сървърна страница: техникът е на мобилен интернет в машинно помещение —
// излишен кръг „зареди празна страница → дръпни JSON" е точно там, където
// връзката пада.

import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sessioneCorrente } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";

export default async function Pagina({
  params,
}: {
  params: Promise<{ matricola: string }>;
}) {
  const { matricola } = await params;
  const s = await sessioneCorrente();
  // Неавтентикиран → вход, с връщане обратно тук след това. Стикерът е публичен
  // предмет: всеки може да го снима, значи страницата НЕ бива да издава нищо
  // без сесия.
  if (!s) redirect(`/login?da=${encodeURIComponent(`/i/${matricola}`)}`);

  const impianto = await prisma.impianto.findFirst({
    where: { matricola: decodeURIComponent(matricola), ...filtroTenant(s) },
    select: { id: true },
  });
  if (!impianto) notFound();

  redirect(`/impianti/${impianto.id}`);
}
