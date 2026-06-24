import Link from "next/link";
import type { Metadata } from "next";
import { Coins, Flame, HeartPulse, FileText, Phone, Soup, ArrowRight } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui";
import { buildMetadata, faqPageLd } from "@/lib/seo";
import { plainText } from "@/lib/markdown";
import { JsonLd } from "@/components/JsonLd";
import { PrintButton } from "@/components/PrintButton";
import { EuroConverter } from "@/components/EuroConverter";

export const dynamic = "force-dynamic";

const GUIDE_CATEGORY = "Пенсии и социални помощи";

export const metadata: Metadata = buildMetadata({
  title: "Пенсии и социални помощи — пенсии, помощ за отопление, ТЕЛК",
  description:
    "Ясно обяснено: как се получава пенсия, целева помощ за отопление, ТЕЛК, социален патронаж и важните телефони на НОИ и Социално подпомагане за хората в Дупница.",
  path: "/pomoshti",
});

const TOPICS: {
  icon: typeof Coins;
  title: string;
  points: string[];
}[] = [
  {
    icon: Coins,
    title: "Пенсии",
    points: [
      "Пенсиите се изплащат от НОИ — по банкова сметка или в брой чрез Български пощи.",
      "Изплащането през пощата е обикновено между 7-о и 20-о число на месеца, по график.",
      "Ако се бавите да получите пенсия — питайте в пощенската станция или на телефона на НОИ по-долу.",
    ],
  },
  {
    icon: Flame,
    title: "Целева помощ за отопление",
    points: [
      "Държавата подпомага отоплението на хора с по-ниски доходи през зимния сезон.",
      "Кандидатства се обикновено от 1 юли до 31 октомври всяка година — проверявайте актуалния срок.",
      "Подава се молба-декларация в Дирекция „Социално подпомагане“; носете лична карта и документ за доходи.",
    ],
  },
  {
    icon: HeartPulse,
    title: "ТЕЛК (степен на увреждане)",
    points: [
      "ТЕЛК освидетелства здравословното състояние и определя степен на увреждане.",
      "Решението дава право на добавки, облекчения и социална подкрепа.",
      "Започва се с направление от личния лекар. Пазете копие от решението на сигурно място.",
    ],
  },
  {
    icon: Soup,
    title: "Социален патронаж и домашна грижа",
    points: [
      "Много общини предлагат топъл обяд по домовете и домашен помощник за възрастни и трудноподвижни хора.",
      "За да разберете условията и да се запишете, обадете се в общината или в Социално подпомагане.",
      "Вижте и раздела „Зов за помощ“ и „Доброволци“ за подкрепа от съседи.",
    ],
  },
];

export default async function AidPage() {
  const guides = await prisma.faq.findMany({
    where: { published: true, category: GUIDE_CATEGORY },
    orderBy: { order: "asc" },
  });

  return (
    <>
      {guides.length > 0 && (
        <JsonLd
          data={faqPageLd(
            guides.slice(0, 12).map((g) => ({
              question: g.question,
              answerText: plainText(g.answer, 280),
            })),
          )}
        />
      )}

      <PageHero
        eyebrow="Социална подкрепа"
        title="Пенсии и социални помощи"
        intro="Накратко и на разбираем език: пенсии, помощ за отопление, ТЕЛК и към кого да се обърнете. Тук обясняваме къде да питате — без сложни думи."
        crumbs={[{ name: "Пенсии и помощи", path: "/pomoshti" }]}
      />

      <div className="container-content space-y-10 py-10">
        {/* Конвертор евро ↔ левове — пенсията се превалутира по този курс */}
        <div>
          <EuroConverter />
          <p className="mt-2 text-sm text-slate-500">
            Пенсиите и помощите се превалутират по този фиксиран курс — стойността
            се запазва. Повече за еврото:{" "}
            <Link href="/evroto" className="font-medium text-brand-700 hover:underline">
              страница „Еврото“
            </Link>
            .
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {TOPICS.map((t) => {
            const Icon = t.icon;
            return (
              <section
                key={t.title}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <h2 className="font-display text-xl font-bold text-slate-900">{t.title}</h2>
                </div>
                <ul className="mt-4 space-y-2">
                  {t.points.map((p, i) => (
                    <li key={i} className="flex gap-2 text-slate-700">
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gold-500" aria-hidden />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {/* Важни телефони */}
        <section className="rounded-2xl border border-brand-200 bg-brand-50 p-6">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Phone className="h-6 w-6 text-brand-700" aria-hidden />
            Към кого да се обърна
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-white p-4">
              <div className="font-semibold text-slate-900">НОИ — пенсии и осигуряване</div>
              <a href="tel:070014802" className="mt-1 inline-block font-bold text-brand-700 hover:underline">
                0700 14 802
              </a>
              <p className="mt-1 text-sm text-slate-600">Въпроси за пенсии и обезщетения.</p>
            </div>
            <div className="rounded-lg bg-white p-4">
              <div className="font-semibold text-slate-900">Социално подпомагане</div>
              <p className="mt-1 text-sm text-slate-600">
                За помощ за отопление и социални помощи — Дирекция „Социално
                подпомагане“. Вижте точния телефон в{" "}
                <Link href="/uslugi?cat=SOCIAL" className="font-medium text-brand-700 hover:underline">
                  социални услуги
                </Link>
                .
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Сроковете и условията се променят. Преди да тръгнете, обадете се да
            проверите какви документи са нужни — спестява второ ходене.
          </p>
        </section>

        {/* Свързани ръководства */}
        {guides.length > 0 && (
          <section>
            <h2 className="section-title mb-5">Стъпка по стъпка</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {guides.map((g) => (
                <Link key={g.id} href={`/kak-da/${g.slug}`} className="card">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{g.question}</h3>
                      <p className="mt-1 text-sm text-slate-600">{plainText(g.answer, 120)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="no-print">
          <PrintButton variant="secondary" label="Принтирай тази страница" />
        </div>
      </div>
    </>
  );
}
