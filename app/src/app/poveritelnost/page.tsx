import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";

export const metadata: Metadata = buildMetadata({
  title: "Поверителност",
  description:
    "Как „За Дупница“ обработва личните данни: минимум данни, без проследяване по подразбиране.",
  path: "/poveritelnost",
});

export default function PrivacyPage() {
  return (
    <>
      <JsonLd data={webPageLd({ name: "Поверителност", path: "/poveritelnost" })} />
      <PageHero
        eyebrow="Правила"
        title="Поверителност"
        intro="Уважаваме личните ви данни и събираме възможно най-малко."
        crumbs={[{ name: "Поверителност", path: "/poveritelnost" }]}
      />
      <div className="container-content py-10">
        <div className="prose-content max-w-3xl text-slate-700">
          <h2>Какви данни събираме</h2>
          <p>
            По подразбиране не ви проследяваме и не показваме реклами, които ви
            следят. Не е нужно да си правите профил, за да четете сайта.
          </p>
          <p>
            Когато доброволно попълните форма (сигнал, контакт или обява), пазим
            само това, което сте въвели, за да обработим заявката ви. Не го
            продаваме и не го споделяме за реклама.
          </p>

          <h2>Настройки за достъпност</h2>
          <p>
            Изборът ви за размер на текста и контраст се пази локално във вашия
            браузър (local storage), не на наш сървър.
          </p>

          <h2>Статистика</h2>
          <p>
            Ако е включена анонимна статистика за посещенията, тя е без бисквитки
            и не идентифицира отделни хора.
          </p>

          <h2>Вашите права</h2>
          <p>
            Можете да поискате да видите или изтрием данните, които сте ни
            изпратили — пишете ни през „Контакти“.
          </p>

          <h2>Важно</h2>
          <p>
            Това е независим граждански проект и не е официалният сайт на община
            Дупница.
          </p>
        </div>
      </div>
    </>
  );
}
