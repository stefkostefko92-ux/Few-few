import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = buildMetadata({
  title: "За проекта",
  description:
    "За Бобов дол е независима гражданска инициатива за дигитализация в полза на жителите — услуги, информация и помощ на едно място.",
  path: "/za-nas",
});

export default function AboutPage() {
  return (
    <>
      <PageHero
        title="За проекта"
        crumbs={[{ name: "За проекта", path: "/za-nas" }]}
      />
      <div className="container-content max-w-3xl py-10">
        <div className="prose-content text-slate-700">
          <p>
            <strong>{SITE.name}</strong> е независима гражданска инициатива, която
            събира на едно място полезната за ежедневието информация за град{" "}
            {SITE.geo.city} и помага на хората да се справят с дигиталния свят.
          </p>
          <h2>Защо</h2>
          <p>
            {SITE.geo.city} е малък град в преход. Много услуги вече са онлайн, но
            не всеки се чувства сигурен да ги ползва. Идеята е проста: лесен достъп
            до информация и реална човешка помощ — за хора от всички възрасти.
          </p>
          <h2>Какво предлагаме</h2>
          <ul>
            <li>Указател с важни телефони и услуги</li>
            <li>Разбираеми обяснения „Как да…“ за е-услуги</li>
            <li>Събития, обяви и каталог на местния бизнес</li>
            <li>Помощ на живо с електронни услуги</li>
          </ul>
          <h2>Независимост</h2>
          <p>
            Проектът е независим и не е официален сайт на община {SITE.geo.city}.
            Информацията се поддържа доброволно и се стреми да бъде точна и
            актуална.
          </p>
        </div>
      </div>
    </>
  );
}
