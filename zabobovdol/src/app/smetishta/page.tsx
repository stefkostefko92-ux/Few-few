import type { Metadata } from "next";
import { MapPin } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState, SectionHeader } from "@/components/ui";
import { FormLayout, NextSteps } from "@/components/FormLayout";
import { buildMetadata } from "@/lib/seo";
import { formatDate, isoDate } from "@/lib/format-date";
import { formatPhoneBg } from "@/lib/phone";
import { SITE } from "@/lib/site";
import { SECTION } from "@/lib/section-names";
import { DumpReportForm } from "./DumpReportForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Сигнали за нерегламентирани сметища в Бобов дол",
  description:
    "Видяхте незаконно изхвърлени отпадъци в Бобов дол? Подайте сигнал за нерегламентирано сметище и вижте вече подадените, за да се почисти градът заедно.",
  path: "/smetishta",
  keywords: [
    "нерегламентирано сметище Бобов дол",
    "сигнал за сметище",
    "незаконно изхвърлени отпадъци",
    "чистота Бобов дол",
    "сигнал до общината за отпадъци",
    "Carbon Stealth",
  ],
});

// Пълни имена на класовете (не сглобени) — иначе Tailwind не ги вижда.
const STATUS: Record<string, { label: string; cls: string }> = {
  NEW: { label: "Нов", cls: "badge-warning" },
  CONFIRMED: { label: "Потвърден", cls: "badge" },
  FORWARDED: { label: "Препратен към общината", cls: "badge" },
  CLEANED: { label: "Почистен", cls: "badge-success" },
  REJECTED: { label: "Отхвърлен", cls: "badge-neutral" },
};

// Снимката е връзка навън (http/https) или качена при нас (/api/foto/…);
// нищо друго (javascript: и пр.) не става href.
const SAFE_PHOTO = /^(https?:\/\/|\/(?!\/))/i;

export default async function DumpReportsPage() {
  const reports = await prisma.dumpReport.findMany({
    where: { published: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  const photoHint = `Ако снимката е качена някъде (напр. във Facebook), поставете връзката. Нямате връзка? Изпратете снимката по Viber на ${formatPhoneBg(SITE.contact.phone)} или на ${SITE.contact.email}.`;

  return (
    <>
      <PageHero
        eyebrow={SECTION.signals}
        title="Нерегламентирани сметища"
        intro="Видяхте незаконно изхвърлени отпадъци? Подайте сигнал — ще го прегледаме, ще го покажем тук и ще го препратим към общината. Заедно пазим Бобов дол чист."
        crumbs={[{ name: "Нерегламентирани сметища", path: "/smetishta" }]}
      />

      <div className="container-content space-y-12 py-10">
        {/* Форма за подаване */}
        <section aria-labelledby="podayte-zaglavie">
          <SectionHeader id="podayte-zaglavie" title="Подайте сигнал" />
          <FormLayout
            aside={
              <NextSteps
                steps={[
                  "Получаваме сигнала.",
                  "Преглеждаме го и го показваме в списъка по-долу.",
                  "Препращаме го към общината, за да се почисти.",
                ]}
              />
            }
          >
            <DumpReportForm photoHint={photoHint} />
          </FormLayout>
        </section>

        {/* Списък с подадени (одобрени) сигнали */}
        <section id="podadeni" aria-labelledby="podadeni-zaglavie">
          <SectionHeader id="podadeni-zaglavie" title="Подадени сигнали" />
          {reports.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="Все още няма публикувани сигнали."
              hint="Бъдете първите — подайте сигнал чрез формата по-горе."
            />
          ) : (
            <ul role="list" className="grid gap-4 md:grid-cols-2">
              {reports.map((r) => {
                const s = STATUS[r.status] ?? STATUS.NEW;
                return (
                  <li key={r.id} className="panel">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                      <h3 className="h-card flex min-w-0 items-start gap-2">
                        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
                        <span className="min-w-0 [overflow-wrap:anywhere]">{r.location}</span>
                      </h3>
                      <span className={`${s.cls} shrink-0`}>{s.label}</span>
                    </div>
                    {r.description && (
                      <p className="mt-2 text-base text-slate-700">{r.description}</p>
                    )}
                    {r.photoUrl && SAFE_PHOTO.test(r.photoUrl) && (
                      <p className="mt-2 text-base">
                        <a
                          href={r.photoUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="link"
                        >
                          Вижте снимката
                          <span className="sr-only"> (отваря се в нов прозорец)</span>
                        </a>
                      </p>
                    )}
                    <p className="text-meta mt-3">
                      Подаден на <time dateTime={isoDate(r.createdAt)}>{formatDate(r.createdAt)}</time>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
