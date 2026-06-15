import Link from "next/link";
import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = buildMetadata({
  title: "Помощ на гише — лична помощ с е-услуги",
  description:
    "Безплатна помощ на живо за хора от всички възрасти: електронни услуги, документи, плащания и онлайн задачи в Бобов дол.",
  path: "/pomosht",
});

export default function PomoshtPage() {
  return (
    <>
      <PageHero
        title="Помощ на гише"
        intro="Не всичко може да стане само онлайн. Затова помагаме на живо — спокойно, безплатно и на разбираем език."
        crumbs={[{ name: "Помощ на гише", path: "/pomosht" }]}
      />
      <div className="container-content grid gap-8 py-10 lg:grid-cols-[1fr,18rem]">
        <div className="prose-content max-w-none text-slate-700">
          <h2>С какво помагаме</h2>
          <ul>
            <li>Електронни услуги на държавата и общината</li>
            <li>Запазване на час при лекар и направления</li>
            <li>Подаване на заявления и документи онлайн</li>
            <li>Онлайн плащания на сметки и данъци</li>
            <li>Имейл, видео разговори с близки, безопасност онлайн</li>
            <li>Как да разпознаваме измами и фалшиви съобщения</li>
          </ul>

          <h2>За кого е</h2>
          <p>
            За всеки жител на {SITE.geo.city} и съседните села — особено за
            по-възрастните хора, които се чувстват несигурни с компютъра и
            телефона. Няма глупави въпроси.
          </p>

          <h2>Колко струва</h2>
          <p>
            Помощта е безплатна. Това е гражданска инициатива в полза на
            общността, независима от община {SITE.geo.city}.
          </p>

          <h2>Как да заявите помощ</h2>
          <p>
            Засега ни пишете чрез страницата за контакти. Когато гишето заработи
            на постоянно място, тук ще видите адрес и приемно време.
          </p>
        </div>
        <aside className="space-y-4">
          <div className="card bg-brand-50">
            <h2 className="text-base font-semibold">Свържете се с нас</h2>
            <p className="mt-1 text-sm text-slate-700">
              Ще ви насочим към най-близкото време за помощ.
            </p>
            <Link href="/kontakti" className="btn-primary mt-3 w-full">
              Към контакти
            </Link>
          </div>
          <div className="card">
            <h2 className="text-base font-semibold">Полезно е и онлайн</h2>
            <p className="mt-1 text-sm text-slate-700">
              Вижте готовите обяснения „Как да…“ — стъпка по стъпка.
            </p>
            <Link href="/kak-da" className="btn-secondary mt-3 w-full">
              Виж „Как да…“
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
