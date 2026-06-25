import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { PageHero, Prose } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { markdownToHtml } from "@/lib/markdown";

export const metadata: Metadata = buildMetadata({
  title: "Политика за бисквитки",
  description:
    "Сайтът на ФК „Миньор“ Бобов дол използва само технически необходими бисквитки.",
  path: "/biskvitki",
});

const CONTENT = `
„Бисквитките“ са малки файлове, които сайтът запазва в браузъра ви. Този сайт
**не използва рекламни или проследяващи бисквитки** и не споделя данни с
рекламни мрежи.

## Какво използваме

- **Сесийна бисквитка за администрация** (\`mbd_session\`) — създава се само при
  вход в административния панел и пази сигурна сесия. Тя е \`HttpOnly\`, \`Secure\`
  и \`SameSite=Strict\`. Обикновените посетители не я получават.
- **Локални настройки за достъпност** — изборите ви за размер на текста, контраст
  и тъмен режим се пазят локално в браузъра (localStorage), а не като бисквитки,
  и не се изпращат към сървъра.

## Управление

Можете да изтриете бисквитките и локалните настройки по всяко време от
настройките на браузъра си. Това няма да попречи на разглеждането на сайта.
`;

export default function CookiesPage() {
  return (
    <>
      <PageHero
        title="Политика за бисквитки"
        eyebrow="Прозрачност"
        crumbs={[{ name: "Бисквитки", path: "/biskvitki" }]}
      />
      <JsonLd
        data={webPageLd({
          name: "Политика за бисквитки",
          path: "/biskvitki",
          lastReviewed: "2026-06-01",
        })}
      />
      <div className="container-content max-w-3xl py-10">
        <Prose html={markdownToHtml(CONTENT)} />
      </div>
    </>
  );
}
