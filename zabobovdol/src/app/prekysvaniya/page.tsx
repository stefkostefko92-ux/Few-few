import type { Metadata } from "next";
import Link from "next/link";
import { Zap, Droplets, CalendarClock, CheckCircle2 } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { PageHero, Prose, EmptyState } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { renderMarkdown } from "@/lib/markdown";
import { PrintButton } from "@/components/PrintButton";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Прекъсвания на ток и вода — Бобов дол",
  description:
    "Планови и аварийни прекъсвания на електрозахранването и водоснабдяването в Бобов дол: кои улици и квартали са засегнати и за кога е обявено.",
  path: "/prekysvaniya",
});

function fmt(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("bg-BG", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const UTILS: Record<
  string,
  { icon: typeof Zap; label: string; box: string; chip: string }
> = {
  ELECTRICITY: {
    icon: Zap,
    label: "Ток",
    box: "border-amber-300 bg-amber-50",
    chip: "bg-amber-500 text-white",
  },
  WATER: {
    icon: Droplets,
    label: "Вода",
    box: "border-brand-200 bg-brand-50",
    chip: "bg-brand-700 text-white",
  },
};

export default async function OutagesPage() {
  const now = new Date();
  // Показваме предстоящи и текущи (които още не са приключили), плюс тези без край.
  const outages = await prisma.outage.findMany({
    where: {
      published: true,
      OR: [{ endAt: null }, { endAt: { gte: now } }],
    },
    orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
  });

  return (
    <>
      <PageHero
        eyebrow="Комунални услуги"
        title="Прекъсвания на ток и вода"
        intro="Обявени планови и аварийни прекъсвания на електрозахранването и водата в Бобов дол. Проверявайте тук, преди да останете без ток или вода."
        crumbs={[{ name: "Прекъсвания на ток и вода", path: "/prekysvaniya" }]}
      />

      <div className="container-content space-y-8 py-10">
        {outages.length === 0 ? (
          <EmptyState
            title="В момента няма обявени прекъсвания"
            hint="Когато има планово или аварийно спиране на тока или водата, то ще се появи тук. При спешна авария звъннете на съответната служба."
          />
        ) : (
          <div className="space-y-4">
            {outages.map((o) => {
              const u = UTILS[o.utility] ?? UTILS.ELECTRICITY;
              const Icon = u.icon;
              return (
                <article key={o.id} className={"rounded-xl border p-5 " + u.box}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/70 text-slate-700">
                      <Icon className="h-6 w-6" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold " +
                            u.chip
                          }
                        >
                          {u.label}
                        </span>
                        <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                          {o.planned ? "Планово" : "Авария"}
                        </span>
                      </div>
                      <h2 className="mt-1.5 text-lg font-bold text-slate-900">
                        {o.area || "Засегнат район — вижте подробностите"}
                      </h2>
                      {(o.startAt || o.endAt) && (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
                          <CalendarClock className="h-4 w-4" aria-hidden />
                          {o.startAt && o.endAt
                            ? `${fmt(o.startAt)} – ${fmt(o.endAt)}`
                            : o.startAt
                              ? `От ${fmt(o.startAt)}`
                              : `До ${fmt(o.endAt)}`}
                        </p>
                      )}
                      {o.note && (
                        <div className="mt-2">
                          <Prose html={renderMarkdown(o.note)} />
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-brand-700" aria-hidden />
            <h2 className="text-lg font-bold text-slate-900">При авария — на кого да звънна</h2>
          </div>
          <p className="mt-2 text-slate-700">
            Ако токът или водата спре неочаквано (без да е обявено тук), подайте
            сигнал на аварийната служба. Телефоните са в раздел{" "}
            <Link href="/uslugi?cat=UTILITY" className="font-medium text-brand-700 hover:underline">
              Комунални услуги
            </Link>
            . При опасност за живота — спешен телефон{" "}
            <a href="tel:112" className="font-bold text-crimson-700">
              112
            </a>
            .
          </p>
        </section>

        <div className="no-print">
          <PrintButton variant="secondary" label="Принтирай" />
        </div>

        <p className="text-sm text-slate-500">
          Знаете за обявено прекъсване, което липсва тук? Кажете ни на{" "}
          <a href={`tel:${SITE.contact.phone}`} className="font-medium text-brand-700 hover:underline">
            {SITE.contact.phone}
          </a>
          .
        </p>
      </div>
    </>
  );
}
