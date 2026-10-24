import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode, SVGProps } from "react";
import {
  BookOpen,
  Hand,
  HeartPulse,
  MessageSquare,
  Phone,
  Type,
  type LucideIcon,
} from "@/components/icons";
import { PageHero } from "@/components/ui";
import { PhoneButton } from "@/components/PhoneButton";
import { buildMetadata } from "@/lib/seo";
import { SECTION } from "@/lib/section-names";

export const metadata: Metadata = buildMetadata({
  title: "Как да ползвам този сайт",
  description:
    "Кратко въведение за сайта „За Бобов дол“ — как да търсите, да уголемите буквите, да питате помощника и да намерите важните телефони. Просто и спокойно.",
  path: "/kak-da-polzvam-sayta",
  keywords: [
    "как да ползвам сайта",
    "За Бобов дол помощ",
    "по-едри букви",
    "търсене в сайта",
    "дигитален помощник",
    "Carbon Stealth",
  ],
});

// Лупа — същата като в полето за търсене (SearchBar), за да я познаят.
function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

const STEPS: {
  icon: LucideIcon;
  title: string;
  body: ReactNode;
}[] = [
  {
    icon: SearchIcon,
    title: "Търсете каквото ви трябва",
    body: (
      <>
        Горе на всяка страница има поле <strong>„Какво търсите?“</strong>. Напишете дума (например
        „аптека“ или „пенсия“) и натиснете <strong>Търси</strong>. Ако ви е по-лесно да говорите,
        натиснете <strong>микрофона</strong> в полето и кажете какво търсите.
      </>
    ),
  },
  {
    icon: Type,
    title: "По-едри букви и по-ясен екран",
    body: (
      <>
        Най-горе на страницата натиснете <strong>„Аа Настройки за четене“</strong> — ще се появят
        бутони за <strong>по-едри букви (A A A)</strong>, <strong>Контраст</strong>,{" "}
        <strong>Тъмен режим</strong> и <strong>По-лесно докосване</strong> (по-големи бутони).
        Изберете каквото е удобно за очите ви — сайтът ще го запомни.
      </>
    ),
  },
  {
    icon: MessageSquare,
    title: "Питайте помощника",
    body: (
      <>
        Долу вдясно има бутон <strong>„Попитайте помощника“</strong> (на телефон — синьо кръгче).
        Натиснете го и попитайте с прости думи — например „Как да платя ток?“ или „Кой е дежурният
        лекар?“. Той отговаря и ви насочва към правилната страница.
      </>
    ),
  },
  {
    icon: BookOpen,
    title: "Следвайте „Как да…“ стъпка по стъпка",
    body: (
      <>
        В раздела{" "}
        <Link href="/kak-da" className="link">
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
        <Link href="/uslugi" className="link">
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
        eyebrow={SECTION.site}
        title="Как да ползвам този сайт"
        intro="Сайтът е направен да е лесен — особено за по-възрастните. Ето най-важното в няколко прости стъпки. Не бързайте; нищо не може да се развали."
        crumbs={[{ name: "Как да ползвам сайта", path: "/kak-da-polzvam-sayta" }]}
      />

      <div className="container-content py-10">
        <div className="max-w-3xl space-y-10">
          {/* Номерът на стъпката е кръгът; иконата е до заглавието. */}
          <ol role="list" className="space-y-4">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="panel flex gap-4">
                  <span className="step-num">
                    <span className="sr-only">Стъпка </span>
                    {i + 1}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <h2 className="flex items-center gap-2 font-sans text-xl font-semibold text-slate-900">
                      <span className="icon-chip-sm">
                        <Icon aria-hidden />
                      </span>
                      {s.title}
                    </h2>
                    <p className="mt-2 text-lg leading-relaxed text-slate-700">{s.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Спешно */}
          <section aria-labelledby="speshnost" className="callout-danger sm:p-6">
            <h2
              id="speshnost"
              className="flex items-center gap-2 font-sans text-xl font-semibold text-slate-900"
            >
              <HeartPulse className="h-6 w-6 shrink-0 text-crimson-700" aria-hidden />
              При спешност
            </h2>
            <p className="mt-2 text-lg text-slate-800">
              При спешен здравословен проблем, пожар или опасност се обадете на 112 — безплатно, по
              всяко време. За хора с увреден слух има и достъп до 112 без обаждане (вижте{" "}
              <Link href="/dostapnost" className="link">
                „Достъпност“
              </Link>
              ).
            </p>
            <PhoneButton phone="112" label="Спешност" variant="danger" className="mt-4" />
          </section>

          {/* Спокойствие */}
          <section aria-labelledby="spokoyno" className="callout-info sm:p-6">
            <h2
              id="spokoyno"
              className="flex items-center gap-2 font-sans text-xl font-semibold text-slate-900"
            >
              <Hand className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
              Спокойно — нищо не може да се обърка
            </h2>
            <p className="mt-2 text-lg text-slate-800">
              Разглеждането е безплатно и не изисква регистрация. Можете да четете всичко, без да се
              притеснявате. Ако искате да подадете{" "}
              <Link href="/obyavi" className="link">
                обява
              </Link>{" "}
              или{" "}
              <Link href="/signali" className="link">
                сигнал
              </Link>
              , сайтът ви води стъпка по стъпка.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
