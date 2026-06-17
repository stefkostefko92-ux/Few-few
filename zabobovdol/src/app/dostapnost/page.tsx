import type { Metadata } from "next";
import Link from "next/link";
import {
  Type,
  Contrast,
  Hand,
  Volume2,
  Ear,
  MessageSquare,
  Mail,
  MapPin,
  Phone,
  Keyboard,
} from "lucide-react";
import { PageHero } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd, faqPageLd } from "@/lib/seo";
import { PrintButton } from "@/components/PrintButton";
import { SITE } from "@/lib/site";

export const metadata: Metadata = buildMetadata({
  title: "Достъпност — помощ за хора с увреждания на зрението, слуха и моториката",
  description:
    "Как да ползвате сайта „За Бобов дол“ по-лесно: уголемяване на текста, висок контраст, четене на глас и по-големи бутони. Връзка с институции без обаждане за хора с увреден слух и достъп до 112 за глухи и хора с говорни затруднения.",
  path: "/dostapnost",
});

// Въпроси и отговори — за AEO (Answer Engine Optimization) и гласови търсачки.
const FAQ: { question: string; answerText: string }[] = [
  {
    question: "Как да уголемя текста на сайта?",
    answerText:
      "В лентата „Достъпност“ най-горе натиснете едно от трите „А“ — нормален, голям или много голям. Изборът се запомня за следващите посещения.",
  },
  {
    question: "Не чувам добре по телефона. Как да се свържа с институция?",
    answerText:
      "Може да пишете по имейл, да използвате онлайн заявка през egov.bg или да отидете на място (адрес и работно време са посочени при всяка услуга). Може да ни пишете и през чата или формата за контакт — текстово, без обаждане.",
  },
  {
    question: "Как глух човек или човек с говорни затруднения да повика 112?",
    answerText:
      "Национална система 112 предлага достъп за хора с увреден слух и говор чрез мобилно приложение и уеб приложение на 112.mvr.bg. Нужна е предварителна регистрация и одобрение на профила. Сигналът се подава текстово (чат или готови съобщения).",
  },
  {
    question: "Бутоните са ми малки за натискане. Какво да направя?",
    answerText:
      "В лентата „Достъпност“ натиснете „По-лесно докосване“ — бутоните, връзките и полетата стават по-големи и по-лесни за натискане, удобно при треперене на ръцете.",
  },
];

function Tool({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Type;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <div>
        <h3 className="font-display text-lg font-bold text-slate-900">{title}</h3>
        <p className="mt-1 text-slate-600">{children}</p>
      </div>
    </div>
  );
}

export default function AccessibilityPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Начало", path: "/" },
            { name: "Достъпност", path: "/dostapnost" },
          ]),
          faqPageLd(FAQ),
        ]}
      />

      <PageHero
        eyebrow="За всички хора"
        title="Достъпност"
        intro="Този сайт е направен да е лесен за всички — включително за хора с по-слабо зрение, увреден слух или затруднена моторика. Ето как да го нагласите за себе си и как да се свържете с институциите по удобен за вас начин."
        crumbs={[{ name: "Достъпност", path: "/dostapnost" }]}
      />

      <div className="container-content space-y-12 py-10">
        {/* Инструменти за нагласяне */}
        <section>
          <h2 className="section-title mb-2">Нагласете сайта за себе си</h2>
          <p className="mb-5 max-w-2xl text-slate-600">
            Всички тези бутони са в синьо-сивата <strong>лента „Достъпност“</strong>{" "}
            най-горе на всяка страница. Изборът ви се запомня за следващите
            посещения.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Tool icon={Type} title="По-голям текст">
              Натиснете едно от трите „А“, за да уголемите целия текст — нормален,
              голям или много голям.
            </Tool>
            <Tool icon={Contrast} title="Висок контраст">
              По-черен текст и по-силни граници за по-лесно четене при слабо зрение
              или на ярка светлина.
            </Tool>
            <Tool icon={Hand} title="По-лесно докосване">
              По-големи бутони, връзки и полета — удобно при треперене на ръцете
              или затруднена моторика.
            </Tool>
            <Tool icon={Volume2} title="Четене на глас">
              Натиснете „Чети на глас“ и сайтът ще ви прочете съдържанието на
              страницата — полезно при слабо зрение.
            </Tool>
          </div>
        </section>

        {/* За хора с увреден слух */}
        <section className="rounded-2xl border border-brand-200 bg-brand-50 p-6">
          <div className="flex items-center gap-2">
            <Ear className="h-6 w-6 text-brand-700" aria-hidden />
            <h2 className="text-2xl font-bold text-slate-900">
              Не чувате добре по телефона? Свържете се без обаждане
            </h2>
          </div>
          <p className="mt-2 max-w-3xl text-slate-700">
            Голяма част от услугите тук показват телефон, но почти винаги има и
            начин да се свържете <strong>без да се обаждате</strong>:
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Tool icon={MessageSquare} title="Пишете ни текстово">
              Използвайте{" "}
              <Link href="/kontakti" className="font-medium text-brand-700 underline">
                формата за контакт
              </Link>{" "}
              или дигиталния помощник (чата долу вдясно) — пишете въпроса си, без
              да звъните.
            </Tool>
            <Tool icon={Mail} title="Имейл">
              При повечето институции е посочен имейл. Пишете и ще ви отговорят
              писмено.
            </Tool>
            <Tool icon={MapPin} title="На място">
              При всяка услуга има адрес и работно време — може да отидете лично,
              ако ви е по-удобно.
            </Tool>
            <Tool icon={Keyboard} title="Онлайн заявки (egov.bg)">
              Много документи се заявяват изцяло онлайн, без обаждане и без
              ходене. Вижте обясненията в{" "}
              <Link href="/kak-da" className="font-medium text-brand-700 underline">
                „Как да…“
              </Link>
              .
            </Tool>
          </div>
        </section>

        {/* 112 за хора с увреден слух/говор */}
        <section className="rounded-2xl border border-crimson-200 bg-crimson-50 p-6">
          <div className="flex items-center gap-2">
            <Phone className="h-6 w-6 text-crimson-700" aria-hidden />
            <h2 className="text-2xl font-bold text-slate-900">
              Спешен телефон 112 за хора с увреден слух или говор
            </h2>
          </div>
          <p className="mt-2 max-w-3xl text-slate-700">
            Национална система 112 има специален начин за връзка за хора с увреден
            слух и говор — чрез <strong>мобилно приложение</strong> (за телефон и
            таблет) и <strong>уеб приложение</strong> на компютър. Сигналът се
            подава <strong>текстово</strong> — чрез чат или готови съобщения, без
            да е нужно да говорите.
          </p>
          <ol className="mt-4 space-y-2.5">
            {[
              "Регистрирайте се предварително на официалния сайт 112.mvr.bg и активирайте профила си след одобрение от 112. Направете го отрано — преди да ви потрябва спешно.",
              "При нужда отваряте приложението и подавате сигнал текстово (чат или готов текст).",
              "Съюзът на глухите в България провежда обучения за ползване на приложението.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-crimson-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <span className="pt-0.5 text-slate-800">{step}</span>
              </li>
            ))}
          </ol>
          <a
            href="https://112.mvr.bg"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-5"
          >
            Към 112.mvr.bg
          </a>
        </section>

        <div className="no-print">
          <PrintButton variant="secondary" label="Принтирай тази страница" />
        </div>

        <p className="text-sm text-slate-500">
          Имате затруднение със сайта или идея как да го направим по-достъпен?
          Пишете ни на{" "}
          <Link href="/kontakti" className="font-medium text-brand-700 underline">
            Контакти
          </Link>{" "}
          или на{" "}
          <a href={`tel:${SITE.contact.phone}`} className="font-medium text-brand-700 hover:underline">
            {SITE.contact.phone}
          </a>
          .
        </p>
      </div>
    </>
  );
}
