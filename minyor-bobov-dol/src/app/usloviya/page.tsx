import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { PageHero, Prose } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { markdownToHtml } from "@/lib/markdown";

export const metadata: Metadata = buildMetadata({
  title: "Условия за ползване",
  description: "Общи условия за ползване на сайта на ФК „Миньор“ Бобов дол.",
  path: "/usloviya",
});

const CONTENT = `
Добре дошли в официалния сайт на ФК „Миньор“ Бобов дол. С използването на сайта
приемате условията по-долу.

## Съдържание

Информацията (новини, програма, резултати, класиране и състав) се поддържа
актуална с грижа, но може да съдържа неточности или да се променя. Официалните
резултати и класиране се определят от съответната футболна организация.

## Интелектуална собственост

Гербът, наименованието и съдържанието на сайта са собственост на клуба,
съответно на техните носители на права. Кодът на сайта е изработен и дарен от
**Carbon Stealth VCC**. Възпроизвеждане с търговска цел без разрешение не се
допуска.

## Външни връзки

Сайтът може да съдържа връзки към външни страници (напр. социални мрежи). Не
носим отговорност за тяхното съдържание или политики.

## Контакт

За въпроси относно тези условия: **${SITE.contact.email}**.
`;

export default function TermsPage() {
  return (
    <>
      <PageHero
        title="Условия за ползване"
        eyebrow="Правила"
        crumbs={[{ name: "Условия за ползване", path: "/usloviya" }]}
      />
      <JsonLd
        data={webPageLd({
          name: "Условия за ползване",
          path: "/usloviya",
          lastReviewed: "2026-06-01",
        })}
      />
      <div className="container-content max-w-3xl py-10">
        <Prose html={markdownToHtml(CONTENT)} />
      </div>
    </>
  );
}
