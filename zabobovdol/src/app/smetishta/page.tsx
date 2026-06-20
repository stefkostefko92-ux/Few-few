import type { Metadata } from "next";
import { Trash2, MapPin } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { DumpReportForm } from "./DumpReportForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Сигнали за нерегламентирани сметища в Бобов дол",
  description:
    "Видяхте незаконно изхвърлени отпадъци в Бобов дол? Подайте сигнал за нерегламентирано сметище и вижте вече подадените, за да се почисти градът заедно.",
  path: "/smetishta",
});

const STATUS: Record<string, { label: string; cls: string }> = {
  NEW: { label: "Нов", cls: "bg-amber-100 text-amber-800" },
  CONFIRMED: { label: "Потвърден", cls: "bg-brand-100 text-brand-800" },
  FORWARDED: { label: "Препратен към общината", cls: "bg-brand-100 text-brand-800" },
  CLEANED: { label: "Почистен", cls: "bg-green-100 text-green-800" },
  REJECTED: { label: "Отхвърлен", cls: "bg-slate-200 text-slate-600" },
};

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("bg-BG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export default async function DumpReportsPage() {
  const reports = await prisma.dumpReport.findMany({
    where: { published: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <>
      <PageHero
        eyebrow="Чист град"
        title="Нерегламентирани сметища"
        intro="Видяхте незаконно изхвърлени отпадъци? Подайте сигнал — ще го прегледаме, ще го покажем тук и ще го препратим към общината. Заедно пазим Бобов дол чист."
        crumbs={[{ name: "Нерегламентирани сметища", path: "/smetishta" }]}
      />

      <div className="container-content space-y-12 py-10">
        {/* Форма за подаване */}
        <section>
          <h2 className="section-title mb-5 flex items-center gap-2">
            <Trash2 className="h-6 w-6 text-brand-700" aria-hidden />
            Подай сигнал
          </h2>
          <DumpReportForm />
        </section>

        {/* Списък с подадени (одобрени) сигнали */}
        <section>
          <h2 className="section-title mb-5">Подадени сигнали</h2>
          {reports.length === 0 ? (
            <EmptyState
              title="Все още няма публикувани сигнали."
              hint="Бъдете първите — подайте сигнал чрез формата по-горе."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {reports.map((r) => {
                const s = STATUS[r.status] ?? STATUS.NEW;
                return (
                  <article
                    key={r.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="flex items-start gap-2 font-display text-lg font-bold text-slate-900">
                        <MapPin className="mt-1 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                        {r.location}
                      </h3>
                      <span
                        className={
                          "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                          s.cls
                        }
                      >
                        {s.label}
                      </span>
                    </div>
                    {r.description && (
                      <p className="mt-2 text-slate-700">{r.description}</p>
                    )}
                    {r.photoUrl && (
                      <a
                        href={r.photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-sm font-medium text-brand-700 underline"
                      >
                        Виж снимка
                      </a>
                    )}
                    <p className="mt-3 text-xs text-slate-400">
                      Подаден на {formatDate(r.createdAt)}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
