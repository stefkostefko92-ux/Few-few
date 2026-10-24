import Link from "next/link";
import { MapPin, Users } from "@/components/icons";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState, SectionHeader } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { ReportContent } from "@/components/ReportContent";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Доброволци в помощ на възрастните хора в Бобов дол",
  description:
    "Мрежа от доброволци, които безплатно помагат на възрастните хора в Бобов дол — с телефони, документи, пазар и компания. Запишете се или потърсете помощ.",
  path: "/dobrovolci",
  keywords: [
    "доброволци Бобов дол",
    "помощ за възрастни Бобов дол",
    "доброволчество Бобов дол",
    "грижа за възрастни хора",
    "взаимопомощ Бобов дол",
  ],
});

export default async function VolunteersPage() {
  const volunteers = await prisma.volunteer.findMany({
    where: { published: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <PageHero
        title="Доброволци в помощ"
        intro="Нямаме гише, но имаме хора с добро сърце. Доброволци помагат безплатно на възрастните в Бобов дол — с телефона и интернет, документи, пазар или просто компания."
        crumbs={[{ name: "Доброволци", path: "/dobrovolci" }]}
      />
      <div className="container-content py-10">
        <div className="mb-12 grid gap-4 sm:grid-cols-2">
          <section aria-labelledby="nuzhda" className="callout-info flex flex-col">
            <h2 id="nuzhda" className="h-card">
              Нуждаете се от помощ?
            </h2>
            <p className="mt-1 text-base text-slate-700">
              Свържете се с нас или подайте „Зов за помощ“ — ще ви насочим към доброволец.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:mt-auto sm:flex-row sm:flex-wrap sm:pt-4">
              <Link href="/zov-za-pomosht/nova" className="btn-primary">
                Подайте зов за помощ
              </Link>
              <Link href="/kontakti" className="btn-secondary">
                Пишете ни
              </Link>
            </div>
          </section>
          <section aria-labelledby="pomosht" className="callout-note flex flex-col">
            <h2 id="pomosht" className="h-card">
              Искате да помогнете?
            </h2>
            <p className="mt-1 text-base text-slate-700">
              Отделете малко време за някой възрастен съсед. Запишете се за доброволец — ние ще
              ви свържем.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:mt-auto sm:flex-row sm:pt-4">
              <Link href="/dobrovolci/stani" className="btn-primary">
                Станете доброволец
              </Link>
            </div>
          </section>
        </div>

        <SectionHeader title="Нашите доброволци" />
        {volunteers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Списъкът тепърва се изгражда."
            hint="Бъдете сред първите доброволци в Бобов дол."
            action={
              <Link href="/dobrovolci/stani" className="btn-primary">
                Станете доброволец
              </Link>
            }
          />
        ) : (
          <ul role="list" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {volunteers.map((v) => (
              <li key={v.id} className="panel">
                <h3 className="h-card">{v.name}</h3>
                {v.area && (
                  <p className="mt-1 flex items-start gap-1.5 text-base text-slate-700">
                    <MapPin className="mt-1 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    <span>{v.area}</span>
                  </p>
                )}
                {v.skills && <p className="mt-2 text-base text-slate-700">Помага с: {v.skills}</p>}
                {v.about && <p className="mt-2 text-base text-slate-600">{v.about}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-8 max-w-3xl text-base text-slate-600">
          За връзка с доброволец пишете на нас — не публикуваме лични телефони от съображения за
          сигурност.
        </p>
        {volunteers.length > 0 && <ReportContent subject="Профил на доброволец" path="/dobrovolci" />}
      </div>
    </>
  );
}
