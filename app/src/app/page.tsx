import Link from "next/link";
import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { Phone, Pill, Info, ArrowRight, AlertTriangle } from "@/components/icons";

export const metadata: Metadata = buildMetadata({
  title: undefined,
  description: SITE.description,
  path: "/",
});

const QUICK_LINKS = [
  {
    href: "/uslugi",
    title: "Услуги и телефони",
    text: "Важните местни телефони — болница, ВиК, ток, автогара, община — на едно място.",
    Icon: Phone,
  },
  {
    href: "/dezhurna-apteka",
    title: "Дежурна аптека",
    text: "Коя аптека работи денонощно в Дупница и къде да намерите пълния списък.",
    Icon: Pill,
  },
  {
    href: "/dostapnost",
    title: "По-лесно четене",
    text: "Увеличете текста, включете висок контраст или тъмен режим — за по-удобно ползване.",
    Icon: Info,
  },
];

export default function HomePage() {
  return (
    <>
      <section className="page-hero border-b border-slate-200 bg-gradient-to-br from-brand-50 via-white to-white">
        <div className="container-content py-14 sm:py-20">
          <p className="eyebrow">Граждански портал за Дупница</p>
          <h1 className="mt-2 max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            {SITE.slogan}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            {SITE.description}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/uslugi" className="btn-primary">
              Услуги и телефони
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
            <Link href="/dezhurna-apteka" className="btn-secondary">
              Дежурна аптека
            </Link>
          </div>
        </div>
      </section>

      {/* Спешен телефон — винаги виден. */}
      <div className="border-b border-red-200 bg-red-50">
        <div className="container-content flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-base">
          <AlertTriangle className="h-5 w-5 text-red-700" aria-hidden />
          <span className="font-semibold text-red-800">При спешност:</span>
          <a
            href="tel:112"
            className="font-bold text-red-800 underline underline-offset-2"
          >
            обадете се на 112
          </a>
          <span className="text-red-700">
            — полиция, спешна помощ, пожарна (безплатно, денонощно).
          </span>
        </div>
      </div>

      <section className="container-content py-12">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map(({ href, title, text, Icon }) => (
            <Link key={href} href={href} className="card group block">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-lg bg-brand-50 text-brand-700">
                <Icon className="h-6 w-6" aria-hidden />
              </div>
              <h2 className="font-display text-xl font-bold text-slate-900">
                {title}
              </h2>
              <p className="mt-2 text-base text-slate-600">{text}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                Отвори
                <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container-content pb-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="section-title">Какво е това</h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-700">
            Независима гражданска инициатива, която събира на едно достъпно място
            информацията за Дупница, която днес е разпръсната. Започваме с най-
            нужното — важните телефони и дежурната аптека — и ще добавяме още
            (прекъсвания на ток и вода, транспорт, събития, помощ с е-услуги).
            Това не е официалният сайт на община Дупница.
          </p>
          <Link
            href="/za-nas"
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            Повече за проекта
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
