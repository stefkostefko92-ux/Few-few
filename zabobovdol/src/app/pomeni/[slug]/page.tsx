import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs, Prose } from "@/components/ui";
import { Mail } from "@/components/icons";
import { PhoneButton } from "@/components/PhoneButton";
import { PrintButton } from "@/components/PrintButton";
import { ShareButton } from "@/components/ShareButton";
import { ReportContent } from "@/components/ReportContent";
import { buildMetadata } from "@/lib/seo";
import { renderMarkdown } from "@/lib/markdown";
import { SITE } from "@/lib/site";
import { formatDate, formatDateTime, isoDate, isoDateTime } from "@/lib/format-date";
import {
  ceremonyLine,
  kindInfo,
  relativeDayLabel,
  safePhotoUrl,
  yearsLabel,
} from "@/lib/obituary";
import { getPublishedObituary, purgeExpiredObituaryContacts } from "@/lib/obituary-store";

export const dynamic = "force-dynamic";

// Датите са въведени от близките/админа като стенно софийско време.
const WALL = { wall: true } as const;

type Params = Promise<{ slug: string }>;

// Печатен лист А4: черно на бяло дори при тъмен режим (глобалните html.dark
// правила иначе дават светъл текст върху бялата хартия). Важи само за тази
// страница — стилът живее и изчезва заедно с нея.
const PRINT_CSS = `@media print {
  @page { size: A4; margin: 18mm; }
  .pomen-sheet, .pomen-sheet * { background: #fff !important; color: #000 !important; box-shadow: none !important; }
  .pomen-sheet { border-color: #000 !important; }
  .pomen-sheet .pomen-box { border-color: #000 !important; }
}`;

// Отделните обяви НЕ се индексират (noindex) по подразбиране:
// 1) уважение — тъжната вест е за общността и близките, не за да изскача
//    в търсачките години наред при търсене на името;
// 2) минимизация — името, датите и мястото на поклонението, събрани в едно,
//    са удобна мишена за измамници („почина Х, дарете…“) и за профилиране на
//    живите роднини; споделянето във Viber/Facebook работи и без индексиране;
// 3) списъкът /pomeni остава индексиран, за да се намира „некролози Бобов дол“.
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const o = await getPublishedObituary(slug);
  if (!o) return buildMetadata({ title: "Не е намерено", noindex: true });
  const info = kindInfo(o.kind);
  const years = yearsLabel(o.birthYear, o.deathDate);
  const line = ceremonyLine(o.kind, o.ceremonyAt, o.ceremonyPlace);
  return {
    ...buildMetadata({
      title: `${info.heading}: ${o.fullName}`,
      description: [`${info.heading}. ${o.fullName}${years ? `, ${years}` : ""}.`, line]
        .filter(Boolean)
        .join(" "),
      path: `/pomeni/${o.slug}`,
      type: "article",
      noindex: true,
    }),
    keywords: ["некролог", "помен", "тъжна вест", "възпоменание", "Бобов дол", "Carbon Stealth"],
  };
}

export default async function ObituaryPage({ params }: { params: Params }) {
  const { slug } = await params;
  await purgeExpiredObituaryContacts();
  const o = await getPublishedObituary(slug);
  if (!o) notFound();

  const info = kindInfo(o.kind);
  const years = yearsLabel(o.birthYear, o.deathDate);
  const when = relativeDayLabel(o.ceremonyAt, new Date());
  const photo = safePhotoUrl(o.photoUrl);
  const path = `/pomeni/${o.slug}`;
  const removeMail = `mailto:${SITE.contact.email}?subject=${encodeURIComponent(
    `Молба за поправка или сваляне: ${o.fullName}`,
  )}&body=${encodeURIComponent(`Обява: ${SITE.url}${path}\n\nКакво да променим или свалим:\n\nКой сте вие за починалия:\n`)}`;

  return (
    <div className="container-content py-8">
      <style>{PRINT_CSS}</style>
      <div className="no-print">
        <Breadcrumbs
          crumbs={[
            { name: "Начало", path: "/" },
            { name: "Некролози и помени", path: "/pomeni" },
            { name: o.fullName, path },
          ]}
        />
      </div>

      <article className="pomen-sheet mx-auto mt-6 max-w-2xl rounded-2xl border-2 border-slate-300 bg-white px-6 py-8 text-center sm:px-10 sm:py-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
          {info.heading}
        </p>
        <div className="mx-auto mt-3 w-16 border-t border-slate-300" aria-hidden />

        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={`Снимка на ${o.fullName}`}
            className="mx-auto mt-6 h-56 w-44 rounded-xl border border-slate-200 object-cover"
          />
        )}

        <h1 className="mt-6 text-3xl font-bold text-slate-900 sm:text-4xl">{o.fullName}</h1>
        {years && <p className="mt-2 text-xl text-slate-700">{years}</p>}
        {o.deathDate && (
          <p className="mt-3 text-lg text-slate-700">
            Почина на{" "}
            <time dateTime={isoDate(o.deathDate, WALL)}>{formatDate(o.deathDate, WALL)}</time>
          </p>
        )}

        {o.text && (
          <div className="mx-auto mt-6 max-w-prose text-lg">
            <Prose html={renderMarkdown(o.text)} />
          </div>
        )}

        {(o.ceremonyAt || o.ceremonyPlace) && (
          <div className="pomen-box mx-auto mt-6 max-w-md rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              {info.ceremony}
              {when && (
                <span className="ml-2 inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-sm font-semibold normal-case tracking-normal text-slate-800">
                  {when}
                </span>
              )}
            </p>
            {o.ceremonyAt && (
              <p className="mt-1 text-lg font-semibold text-slate-900">
                <time dateTime={isoDateTime(o.ceremonyAt, WALL)}>
                  {formatDateTime(o.ceremonyAt, WALL)}
                </time>
              </p>
            )}
            {o.ceremonyPlace && <p className="mt-1 text-lg text-slate-800">{o.ceremonyPlace}</p>}
          </div>
        )}

        {o.fromFamily && <p className="mt-6 text-lg italic text-slate-700">{o.fromFamily}</p>}
      </article>

      <div className="no-print mx-auto mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-center [&>*]:w-full sm:[&>*]:w-auto [&>div>button]:w-full sm:[&>div>button]:w-auto">
        <ShareButton
          title={`${info.heading}: ${o.fullName}`}
          text={`${info.heading}: ${o.fullName}`}
          path={path}
        />
        <PrintButton variant="secondary" label="Отпечатайте (А4)" />
      </div>

      <aside
        aria-labelledby="blizki-zaglavie"
        className="panel no-print mx-auto mt-8 max-w-2xl bg-slate-50 sm:p-6"
      >
        <h2 id="blizki-zaglavie" className="h-card">
          Вие сте от близките?
        </h2>
        <p className="mt-2 text-base text-slate-700">
          Ако искате да поправим нещо или да свалим тази обява — обадете се или пишете.
          Сваляме я до 72 часа.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <PhoneButton phone={SITE.contact.phone} />
          <a href={removeMail} className="btn-secondary w-full sm:w-auto">
            <Mail className="h-5 w-5" aria-hidden />
            Пишете ни
          </a>
        </div>
        <p className="mt-4">
          <Link href="/pomeni" className="link-more">
            <span aria-hidden="true">←</span> Всички некролози и помени
          </Link>
        </p>
        <ReportContent subject={`${info.heading}: ${o.fullName}`} path={path} />
      </aside>
    </div>
  );
}
