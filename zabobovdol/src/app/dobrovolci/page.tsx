import Link from "next/link";
import { MapPin } from "@/components/icons";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Доброволци в помощ на възрастните хора в Бобов дол",
  description:
    "Мрежа от доброволци, които безплатно помагат на възрастните хора в Бобов дол — с телефони, документи, пазар и компания. Запишете се или потърсете помощ.",
  path: "/dobrovolci",
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
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <div className="card bg-brand-50">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Нуждаете се от помощ?
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Свържете се с нас или подайте „Зов за помощ“ — ще ви насочим към
              доброволец.
            </p>
            <div className="mt-3 flex gap-2">
              <Link href="/zov-za-pomosht/nova" className="btn-primary">Зов за помощ</Link>
              <Link href="/kontakti" className="btn-secondary">Контакти</Link>
            </div>
          </div>
          <div className="card bg-gold-50">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Искате да помогнете?
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Отделете малко време за някой възрастен съсед. Запишете се за
              доброволец — ние ще ви свържем.
            </p>
            <Link href="/dobrovolci/stani" className="btn-gold mt-3">
              Станете доброволец
            </Link>
          </div>
        </div>

        <h2 className="section-title mb-5">Нашите доброволци</h2>
        {volunteers.length === 0 ? (
          <EmptyState
            title="Списъкът тепърва се изгражда."
            hint="Бъдете сред първите доброволци в Бобов дол."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {volunteers.map((v) => (
              <div key={v.id} className="card">
                <div className="font-display text-lg font-bold text-slate-900">{v.name}</div>
                {v.area && <div className="flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-4 w-4 shrink-0" aria-hidden /> {v.area}</div>}
                {v.skills && <p className="mt-2 text-sm text-slate-700">Помага с: {v.skills}</p>}
                {v.about && <p className="mt-2 text-sm text-slate-600">{v.about}</p>}
              </div>
            ))}
          </div>
        )}
        <p className="mt-6 text-sm text-slate-500">
          За връзка с доброволец пишете на нас — не публикуваме лични телефони от
          съображения за сигурност.
        </p>
      </div>
    </>
  );
}
