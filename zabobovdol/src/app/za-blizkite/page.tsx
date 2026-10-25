import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, StepList } from "@/components/ui";
import { QrCode } from "@/components/QrCode";
import { ShareButton } from "@/components/ShareButton";
import { TrustCard } from "@/components/TrustCard";
import { InstallButton } from "@/components/InstallBanner";
import { buildMetadata } from "@/lib/seo";
import { getFacebookUrl, getViberChannelUrl } from "@/lib/settings";
import { SITE } from "@/lib/site";
import { SECTION } from "@/lib/section-names";

// Чете адресите на Viber канала и Facebook от базата → не се генерира при билда.
export const dynamic = "force-dynamic";

const TITLE = "Сложете „За Бобов дол“ на телефона на мама";
const DESCRIPTION =
  "За децата и внуците на хората от Бобов дол: как за пет минути да сложите „За Бобов дол“ на телефона на мама, татко, баба или дядо — дежурна аптека, важни телефони, спиране на тока и измами с едно натискане.";

export const metadata: Metadata = buildMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/za-blizkite",
  keywords: [
    "Бобов дол за близките",
    "телефон на мама",
    "приложение за възрастни родители",
    "изселници от Бобов дол",
    "За Бобов дол",
    "Carbon Stealth",
  ],
});

// Маркер „family“ — за да се вижда (само като брой) колко телефона са
// отворени по този път. Без идентификатор на когото и да е.
const FAMILY_URL = `${SITE.url}/?s=family`;

const MUST_SEE = [
  { href: "/dezhurna-apteka", label: "Дежурна аптека", text: "коя аптека работи днес" },
  { href: "/uslugi", label: "Услуги и телефони", text: "лекар, община, поща, такси" },
  { href: "/izmami", label: "Пазете се от измами", text: "как да познае измамника" },
];

export default async function ForFamilyPage() {
  const [viber, facebook] = await Promise.all([getViberChannelUrl(), getFacebookUrl()]);
  const fb = /^https:\/\/(www\.|m\.)?facebook\.com\//i.test(facebook) ? facebook : "";

  return (
    <>
      <PageHero
        eyebrow={SECTION.site}
        title={TITLE}
        intro="Живеете в София, Дупница или в чужбина, а родителите ви са в Бобов дол? Следващия път, когато сте при тях — или по видеоразговор — отделете пет минути. Те ще имат една икона за дежурната аптека, важните телефони, спирането на тока и измамите."
        crumbs={[{ name: "За близките", path: "/za-blizkite" }]}
      />

      <div className="container-content space-y-10 py-10">
        <section className="space-y-4" aria-labelledby="skanirai">
          <h2 id="skanirai" className="section-title">
            Най-лесно: с камерата на нейния телефон
          </h2>
          <div className="panel flex max-w-3xl flex-col items-center gap-5 sm:flex-row sm:items-center">
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-3">
              <QrCode value={FAMILY_URL} label="QR код към „За Бобов дол“" size={176} className="h-44 w-44" />
            </div>
            <div className="space-y-2 text-lg text-slate-800">
              <p>
                Отворете тази страница на <strong>вашия</strong> телефон или компютър и насочете
                камерата на телефона на мама към квадратчето. Сайтът ще се отвори на нейния
                телефон.
              </p>
              <p className="text-slate-700">
                Или просто напишете на нейния телефон: <strong>{SITE.domain}</strong>
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4" aria-labelledby="stapki">
          <h2 id="stapki" className="section-title">
            Стъпките на телефона на мама
          </h2>
          <div className="max-w-3xl">
            <StepList
              steps={[
                <>
                  <strong>Отворете сайта</strong> на нейния телефон — с квадратчето отгоре или
                  като напишете {SITE.domain}.
                </>,
                <>
                  <strong>Сложете иконата на началния екран.</strong> На Android: трите точки ⋮
                  горе вдясно → „Инсталиране на приложението“ (или „Добавяне към началния екран“).
                  На iPhone, в Safari: „Сподели“ (квадратче със стрелка) → „Добави към начален
                  екран“ → „Добави“.{" "}
                  <Link href="/instaliraj" className="link">
                    Стъпките с картинки
                  </Link>
                  .
                  <div className="mt-3">
                    {/* Появява се, ако точно този телефон позволява инсталиране с едно натискане. */}
                    <InstallButton />
                  </div>
                </>,
                <>
                  <strong>Преместете иконата на първия екран</strong> — до „Телефон“ и Viber,
                  където мама гледа всеки ден. Задръжте иконата с пръст и я плъзнете.
                </>,
                <>
                  <strong>Ако буквите са дребни</strong> — в настройките на телефона („Дисплей“
                  или „Екран“) увеличете размера на шрифта. В сайта има и бутони за по-едър текст.
                </>,
                <>
                  <strong>Отворете заедно веднъж трите най-важни неща</strong>, за да ги запомни:
                  <ul className="mt-2 list-disc space-y-1 pl-6 marker:text-brand-600">
                    {MUST_SEE.map((m) => (
                      <li key={m.href}>
                        <Link href={m.href} className="link">
                          {m.label}
                        </Link>{" "}
                        — {m.text}
                      </li>
                    ))}
                  </ul>
                </>,
                <>
                  <strong>Кажете ѝ правилото срещу измамите:</strong> банка и полиция никога не
                  искат ПИН, кодове от SMS или да дадете пари на „куриер“. При съмнение —
                  затворете и звъннете на вас или на 112.
                </>,
              ]}
            />
            {/* Същото послание като навсякъде — истинският адрес и какво никога не искаме. */}
            <TrustCard variant="compact" className="mt-6" />
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="bez-smartfon">
          <h2 id="bez-smartfon" className="section-title">
            Мама няма смартфон?
          </h2>
          <p className="max-w-3xl text-lg text-slate-800">
            Разпечатайте ѝ{" "}
            <Link href="/pechat/sedmitsa" className="link">
              „Седмицата в Бобов дол“
            </Link>{" "}
            (дежурни аптеки, спиране на ток и вода, новини — с едър шрифт) и{" "}
            <Link href="/pechat" className="link">
              листа с важните телефони
            </Link>{" "}
            и ги оставете на хладилника.
          </p>
        </section>

        <section className="space-y-3" aria-labelledby="za-vas">
          <h2 id="za-vas" className="section-title">
            А вие — да знаете какво става при нашите
          </h2>
          <p className="max-w-3xl text-lg text-slate-800">
            Сложете „За Бобов дол“ и на своя телефон, за да виждате кога спира токът или водата
            и за какви измами предупреждават в града.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
            <Link href="/prekysvaniya" className="btn-secondary text-lg">
              Спиране на ток и вода
            </Link>
            <Link href="/izmami" className="btn-secondary text-lg">
              Измами в момента
            </Link>
            <Link href="/instaliraj" className="btn-secondary text-lg">
              Сложете го на своя телефон
            </Link>
            {viber && (
              <a href={viber} target="_blank" rel="noopener noreferrer" className="btn-primary text-lg">
                Канал във Viber
              </a>
            )}
            {fb && (
              <a href={fb} target="_blank" rel="noopener noreferrer" className="btn-primary text-lg">
                Страница във Facebook
              </a>
            )}
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="spodeli-blizki">
          <h2 id="spodeli-blizki" className="section-title">
            Изпратете на брат, сестра или братовчед
          </h2>
          <p className="max-w-3xl text-lg text-slate-700">
            И те ли имат родители, баба или дядо в Бобов дол? Изпратете им тази страница —
            следващия път, когато са при тях, ще го направят за пет минути.
          </p>
          <ShareButton
            title={TITLE}
            text="Следващия път, когато си при нашите — сложи им „За Бобов дол“ на телефона. Ето как:"
            path="/za-blizkite"
          />
        </section>
      </div>
    </>
  );
}
