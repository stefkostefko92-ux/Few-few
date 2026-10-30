import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/ui";
import { SearchBar } from "@/components/SearchBar";
import { isDangerNav, navIcon } from "@/components/nav-icons";
import { PRIMARY_NAV, SITE, type NavItem } from "@/lib/site";
import { SECTION } from "@/lib/section-names";
import { breakableAddress } from "@/components/TrustCard";

// 404 — подредена като другите страници: заглавна лента, търсачка, най-търсените
// раздели и как да ни пишете. Без огромно „404“ (технически жаргон).
// Не се индексира, но връзките се следват; без canonical към началната.
export const metadata: Metadata = {
  title: "Страницата не е намерена",
  robots: { index: false, follow: true },
  alternates: { canonical: null },
};

const POPULAR = ["/uslugi", "/dezhurna-apteka", "/kak-da", "/pomoshti", "/izmami"];

const CARDS: NavItem[] = [
  ...POPULAR.map((href) => PRIMARY_NAV.find((i) => i.href === href)).filter(
    (i): i is NavItem => Boolean(i),
  ),
  { href: "/kontakti", label: "Контакти", description: "Как да се свържете с екипа на сайта" },
];

export default function NotFound() {
  return (
    <>
      <PageHero
        eyebrow="Грешка 404"
        title="Страницата не е намерена"
        intro="Връзката може да е остаряла или страницата да е преместена. Потърсете каквото ви трябва или изберете раздел отдолу."
      />
      <div className="container-content space-y-10 py-10">
        <section aria-labelledby="nf-search" className="max-w-2xl">
          <h2 id="nf-search" className="h-sub">
            Потърсете в сайта
          </h2>
          <div className="mt-3">
            <SearchBar />
          </div>
        </section>

        <section aria-labelledby="nf-popular">
          <h2 id="nf-popular" className="section-title mb-6">
            {SECTION.popular}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CARDS.map((item) => {
              const Icon = navIcon(item.href);
              return (
                <li key={item.href} className="flex">
                  <Link href={item.href} className="card group flex w-full items-start gap-4">
                    <span className={isDangerNav(item.href) ? "icon-chip icon-chip-danger" : "icon-chip"}>
                      <Icon aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="h-card block group-hover:underline">{item.label}</span>
                      {item.description && (
                        <span className="mt-0.5 block text-base text-slate-600">
                          {item.description}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <p className="text-base text-slate-700">
          Мислите, че е грешка?{" "}
          <a href={`mailto:${SITE.contact.email}`} className="link">
            Пишете ни на {breakableAddress(SITE.contact.email)}
          </a>{" "}
          или се върнете{" "}
          <Link href="/" className="link">
            към началото
          </Link>
          .
        </p>
      </div>
    </>
  );
}
