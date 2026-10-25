import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { formatPhoneBg } from "@/lib/phone";
import { SECTION } from "@/lib/section-names";
import { PageHero } from "@/components/ui";
import { QrCode } from "@/components/QrCode";
import { GENERAL_PROMISE, parseShortCode, posterPromise, shortLinkPath } from "@/lib/qr";
import { INDEPENDENT, Sheet112, SheetLayout, SHEET_TITLE, sheetCrumbs } from "../_components/PrintKit";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Плакат за разпечатване",
    description:
      "Готов за печат плакат (A4) с QR код към сайта „За Бобов дол“. Разпечатайте и закачете в аптеката, кметството, на спирката или в магазина, за да го видят повече хора.",
    path: "/pechat/plakat",
  }),
  keywords: [
    "плакат Бобов дол",
    "QR код Бобов дол",
    "За Бобов дол",
    "печат плакат A4",
    "дежурна аптека Бобов дол",
    "Carbon Stealth",
  ],
};

type Poster = { code: string; target: string; label: string } | null;

// asked: дали в адреса изобщо има ?kod= (за подсказка), но самият текст се
// показва само ако е валиден код — чужд текст от адреса не се отпечатва.
async function findPoster(
  raw: unknown,
): Promise<{ poster: Poster; asked: boolean; code: string | null }> {
  const code = parseShortCode(raw);
  const asked = typeof raw === "string" && raw.trim() !== "";
  if (!code) return { poster: null, asked, code: null };
  try {
    const row = await prisma.shortLink.findFirst({
      where: { code: { equals: code, mode: "insensitive" }, published: true },
      select: { target: true, label: true },
    });
    return { poster: row ? { code, target: row.target, label: row.label } : null, asked, code };
  } catch {
    return { poster: null, asked, code };
  }
}

export default async function PosterPage({
  searchParams,
}: {
  searchParams: Promise<{ kod?: string | string[] }>;
}) {
  const { kod } = await searchParams;
  const { poster, asked, code } = await findPoster(Array.isArray(kod) ? kod[0] : kod);
  const promise = poster ? posterPromise(poster.target) : GENERAL_PROMISE;

  // Бележката над листа: за плакат с код — накъде води; за невалиден код —
  // че излиза общият плакат. Без код — нищо (служебната подсказка за
  // „?kod=“ е в админ панела, не за гражданите).
  const note = poster ? (
    <p>
      Плакат с код <strong>{poster.code}</strong>
      {poster.label ? <> · {poster.label}</> : null}. QR кодът води към{" "}
      <strong className="[overflow-wrap:anywhere]">
        {SITE.domain}
        {shortLinkPath(poster.code)}
      </strong>{" "}
      — така виждаме колко хора са го сканирали точно на това място (само брой, без имена).
    </p>
  ) : asked ? (
    <p className="callout-warning" role="status">
      {code ? <>Кодът „{code}“ не е намерен или не е активен.</> : <>Кодът не е валиден.</>}{" "}
      Плакатът по-долу е с общия QR код. Кодовете се създават в админ панела →
      „QR кодове“ (само малки латински букви, цифри и тире).
    </p>
  ) : (
    "Листът е за хартия A4."
  );

  return (
    <>
      <PageHero
        className="no-print"
        eyebrow={SECTION.print}
        title={SHEET_TITLE["/pechat/plakat"]}
        intro="Разпечатайте този плакат (A4) и го закачете на видно място — в аптеката, кметството, на автобусната спирка, в магазина или в читалището. Така и хората, които още не познават сайта, ще го открият."
        crumbs={sheetCrumbs("/pechat/plakat")}
      />

      {/* Лист за печат (A4, портрет) */}
      <SheetLayout
        current="/pechat/plakat"
        note={note}
        printLabel="Отпечатайте плаката"
        sheetClassName="flex flex-col items-center text-center sm:p-10"
      >
        {/* Гербът с прозрачен фон — без бяла кутия върху тъмния лист. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/bobov-dol-grb-mark.png"
          alt="Герб на Бобов дол"
          width={120}
          height={173}
          className="h-28 w-auto sm:h-32 print:h-24"
        />

        <h2 className="mt-5 font-display text-4xl font-extrabold tracking-tight text-brand-800 sm:text-5xl print:mt-3">
          За Бобов дол
        </h2>
        <p
          className={
            poster
              ? "mt-3 font-display text-2xl font-extrabold leading-tight text-slate-900 sm:text-3xl"
              : "mt-2 text-xl font-semibold text-slate-700"
          }
        >
          {promise}
        </p>
        {/* Независимостта — веднага под заглавието, а не дребно най-долу:
            закачен в кметството, плакатът не бива да изглежда общински. */}
        <p className="mt-3 max-w-md text-base font-semibold text-slate-800">{INDEPENDENT}</p>

        <p className="mt-5 max-w-md text-lg text-slate-700 print:mt-3">
          Важни телефони, аптека, пенсии и помощи, обяви, събития, транспорт и
          обяснения „как да…“ стъпка по стъпка — лесно и разбираемо, за всички
          възрасти.
        </p>

        {/* Голям QR код */}
        <div className="mt-7 rounded-2xl border-2 border-slate-300 p-4 print:mt-4 print:p-3">
          {poster ? (
            <QrCode
              value={`${SITE.url}${shortLinkPath(poster.code)}`}
              label={`QR код: ${promise}`}
              size={224}
              className="h-48 w-48 sm:h-56 sm:w-56 print:h-44 print:w-44"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/qr-zabobovdol.png"
              alt={`QR код към ${SITE.domain}`}
              width={220}
              height={220}
              className="h-48 w-48 sm:h-56 sm:w-56 print:h-44 print:w-44"
            />
          )}
        </div>
        <p className="mt-3 text-lg font-semibold text-slate-800">
          Сканирайте с камерата на телефона
        </p>
        <p className="mt-1 max-w-full font-display text-xl font-extrabold text-brand-700 [overflow-wrap:anywhere] sm:text-2xl">
          {SITE.domain}
        </p>

        {/* Спешният номер и връзката с екипа */}
        <div className="mt-7 grid w-full max-w-md gap-3 print:mt-4">
          <Sheet112 />
          {SITE.contact.phone && (
            <p className="rounded-xl border border-slate-300 p-3 text-base text-slate-700">
              За въпроси и предложения:{" "}
              <strong className="whitespace-nowrap text-slate-900">
                {formatPhoneBg(SITE.contact.phone)}
              </strong>
            </p>
          )}
          <p className="callout-note text-left font-semibold text-slate-900">
            Истинският ни адрес: <span className="[overflow-wrap:anywhere]">{SITE.domain}</span>{" "}
            — никога не искаме пари, ЕГН, ПИН или кодове от SMS.
          </p>
        </div>
      </SheetLayout>
    </>
  );
}
