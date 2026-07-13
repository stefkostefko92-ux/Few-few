import Link from "next/link";
import { SITE } from "@/lib/site";

const COLS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Разгледай",
    links: [
      { href: "/predpriyatiya", label: "Предприятия" },
      { href: "/kartina", label: "Картината на сектора" },
      { href: "/koncentraciya", label: "Концентрация" },
      { href: "/sluchai", label: "Известни случаи" },
      { href: "/prozrachnost-indeks", label: "Индекс на прозрачност" },
    ],
  },
  {
    title: "Действай",
    links: [
      { href: "/signal", label: "Как да подадеш сигнал" },
      { href: "/rakovodstvo", label: "Как да провериш сам" },
      { href: "/konflikti", label: "Конфликт на интереси" },
      { href: "/svarzanost", label: "Проверка на свързаност" },
      { href: "/data", label: "Отворени данни" },
    ],
  },
  {
    title: "Информация",
    links: [
      { href: "/parichni-potoci", label: "Паричните потоци" },
      { href: "/istochnici", label: "Източници" },
      { href: "/metodologiya", label: "Методология" },
    ],
  },
  {
    title: "Правно",
    links: [
      { href: "/impressum", label: "Импресум" },
      { href: "/poveritelnost", label: "Поверителност" },
      { href: "/biskvitki", label: "Бисквитки" },
      { href: "/dostupnost", label: "Достъпност" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50">
      <div className="container-content py-10">
        <div className="mb-8 max-w-md">
          <p className="text-base font-extrabold text-slate-900">{SITE.name}</p>
          <p className="mt-2 text-sm text-slate-600">{SITE.description}</p>
          <p className="mt-3 text-xs text-slate-500">
            Независим граждански проект. Не е официален сайт на държавен орган или предприятие.
            Данните са с образователна цел — проверявайте в посочените официални източници.
            Разследване не е присъда.
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {COLS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-sm font-semibold text-slate-900">{col.title}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-slate-600 hover:text-brand-700">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-slate-200 py-4">
        <p className="container-content text-center text-xs text-slate-500">
          © {new Date().getFullYear()}{" "}
          <a href={SITE.authorUrl} target="_blank" rel="noopener noreferrer" className="hover:text-brand-700">
            {SITE.author}
          </a>
          . Съдържанието е с информативна и образователна цел.
        </p>
      </div>
    </footer>
  );
}
