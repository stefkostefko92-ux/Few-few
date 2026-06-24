import Link from "next/link";
import type { Metadata } from "next";
import {
  Type,
  Contrast,
  MessageSquare,
  BookOpen,
  Phone,
  HeartPulse,
  Hand,
} from "@/components/icons";
import { PageHero } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Как да ползвам този сайт",
  description:
    "Кратко въведение за сайта „За Дупница“ — как да търсите, да уголемите буквите, да питате помощника и да намерите важните телефони. Просто и спокойно.",
  path: "/kak-da-polzvam-sayta",
});

const STEPS: { icon: typeof Type; title: string; body: React.ReactNode }[] = [
  {
    icon: Type,
    title: "Търсете каквото ви трябва",
    body: (
      <>
        Горе на всяка страница има поле <strong>„Търсете услуга, телефон, обява…“</strong>.
        Напишете дума (например „аптека“ или „пенсия“) и натиснете <strong>Търси</strong>. Ако
        ви е по-лесно да говорите, натиснете <strong>микрофона</strong> в полето и кажете какво
        търсите.
      </>
    ),
  },
  {
    icon: Contrast,
    title: "По-едри букви и по-ясен екран",
    body: (
      <>
        В горната лента има бутони <strong>Текст A A A</strong> за по-едри букви,{" "}
        <strong>Контраст</strong> и <strong>Тъмен режим</strong> за по-ясен екран, и{" "}
        <strong>По-лесно докосване</strong> за по-големи бутони. Изберете каквото е удобно за очите
        ви — сайтът ще го запомни.
      </>
    ),
  },
  {
    icon: MessageSquare,
    title: "Питайте помощника",
    body: (
      <>
        Долу вдясно има кръгче за <strong>помощник</strong>. Натиснете го и попитайте с прости думи
        — например „Как да платя ток?“ или „Кой е дежурният лекар?“. Той отговаря и ви насочва към
        правилната страница.
      </>
    ),
  },
  {
    icon: BookOpen,
    title: "Следвайте „Как да…“ стъпка по стъпка",
    body: (
      <>
        В раздела{" "}
        <Link href="/kak-da" className="font-semibold text-brand-700 hover:underline">
          „Как да…“
        </Link>{" "}
        има над 500 кратки ръководства с <strong>примерни екрани</strong> — показват ви точно къде
        да натиснете на телефона за обаждания, съобщения, е-услуги и още.
      </>
    ),
  },
  {
    icon: Phone,
    title: "Намерете важните телефони",
    body: (
      <>
        В{" "}
        <Link href="/uslugi" className="font-semibold text-brand-700 hover:underline">
          „Услуги и телефони“
        </Link>{" "}
        са събрани местните институции, аптеки и лекари — с адрес, работно време и телефон, на който
        се звъни с едно докосване.
      </>
    ),
  },
];

export default function HowToUsePage() {
  return (
    <>
      <PageHero
        eyebrow="Добре дошли"
        title="Как да ползвам този сайт"
        intro="Сайтът е направен да е лесен — особено за по-възрастните. Ето най-важното в няколко прости стъпки. Не бързайте; нищо не може да се развали."
        crumbs={[{ name: "Как да ползвам сайта", path: "/kak-da-polzvam-sayta" }]}
      />

      <div className="container-content space-y-10 py-10">
        <ol className="space-y-5">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex shrink-0 flex-col items-center">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-100 text-brand-700">
                  <s.icon className="h-6 w-6" aria-hidden />
                </span>
                <span className="mt-2 text-sm font-bold text-slate-600">{i + 1}</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">{s.title}</h2>
                <p className="mt-1.5 text-lg leading-relaxed text-slate-700">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Спешно */}
        <section className="rounded-2xl border-2 border-crimson-200 bg-crimson-50 p-6">
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <HeartPulse className="h-6 w-6 text-crimson-600" aria-hidden />
            При спешност
          </h2>
          <p className="mt-2 text-lg text-slate-700">
            При спешен здравословен проблем, пожар или опасност се обадете на{" "}
            <a href="tel:112" className="font-bold text-crimson-700 hover:underline">
              112
            </a>{" "}
            — безплатно, по всяко време. За хора с увреден слух има и достъп до 112 без обаждане
            (вижте{" "}
            <Link href="/dostapnost" className="font-semibold text-brand-700 hover:underline">
              Достъпност
            </Link>
            ).
          </p>
        </section>

        {/* Спокойствие */}
        <section className="rounded-2xl bg-brand-50 p-6">
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Hand className="h-6 w-6 text-brand-700" aria-hidden />
            Спокойно — нищо не може да се обърка
          </h2>
          <p className="mt-2 text-lg text-slate-700">
            Разглеждането е безплатно и не изисква регистрация. Можете да четете всичко без да се
            притеснявате. Ако искате да подадете{" "}
            <Link href="/obyavi" className="font-semibold text-brand-700 hover:underline">
              обява
            </Link>{" "}
            или{" "}
            <Link href="/signali" className="font-semibold text-brand-700 hover:underline">
              сигнал
            </Link>
            , сайтът ви води стъпка по стъпка.
          </p>
        </section>
      </div>
    </>
  );
}
