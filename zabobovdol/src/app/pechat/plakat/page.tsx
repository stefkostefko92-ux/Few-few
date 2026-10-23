import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { PrintButton } from "@/components/PrintButton";
import { QrCode } from "@/components/QrCode";
import { GENERAL_PROMISE, parseShortCode, posterPromise, shortLinkPath } from "@/lib/qr";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Плакат за разпечатване — За Бобов дол",
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

  return (
    <div className="container-content py-8">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Плакат за разпечатване
          </h1>
          <p className="max-w-xl text-slate-600">
            Разпечатайте този плакат (A4) и го закачете на видно място — в
            аптеката, кметството, на автобусната спирка, в магазина или в
            читалището. Така и хората, които още не познават сайта, ще го открият.
          </p>
          {poster ? (
            <p className="mt-2 max-w-xl text-slate-700">
              Плакат с код <strong>{poster.code}</strong>
              {poster.label ? <> · {poster.label}</> : null}. QR кодът води към{" "}
              <strong>
                {SITE.domain}
                {shortLinkPath(poster.code)}
              </strong>{" "}
              — така виждаме колко хора са го сканирали точно на това място (само брой, без
              имена).
            </p>
          ) : asked ? (
            <p className="mt-2 max-w-xl rounded-lg bg-amber-50 p-3 text-amber-900" role="status">
              {code ? <>Кодът „{code}“ не е намерен или не е активен.</> : <>Кодът не е валиден.</>}{" "}
              Плакатът по-долу е с общия QR код. Кодовете се създават в админ панела →
              „QR кодове“ (само малки латински букви, цифри и тире).
            </p>
          ) : (
            <p className="mt-2 max-w-xl text-slate-600">
              За плакат за определено място добавете към адреса{" "}
              <strong>?kod=</strong> и кода от админ панела (раздел „QR кодове“).
            </p>
          )}
        </div>
        <PrintButton label="Принтирай плаката" />
      </div>

      {/* Лист за печат (A4, портрет) */}
      <div className="print-sheet mx-auto flex max-w-2xl flex-col items-center rounded-2xl border border-slate-300 bg-white p-10 text-center shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/bobov-dol-grb.png"
          alt="Герб на Бобов дол"
          width={120}
          height={173}
          className="h-32 w-auto"
        />

        <h2 className="mt-5 font-display text-5xl font-extrabold tracking-tight text-brand-800">
          За Бобов дол
        </h2>
        <p
          className={
            poster
              ? "mt-3 font-display text-3xl font-extrabold leading-tight text-slate-900"
              : "mt-2 text-xl font-semibold text-slate-700"
          }
        >
          {promise}
        </p>

        <p className="mt-5 max-w-md text-lg text-slate-700">
          Важни телефони, аптека, пенсии и помощи, обяви, събития, транспорт и
          обяснения „как да…“ стъпка по стъпка — лесно и разбираемо, за всички
          възрасти.
        </p>

        {/* Голям QR код */}
        <div className="mt-7 rounded-2xl border-2 border-slate-200 p-4">
          {poster ? (
            <QrCode
              value={`${SITE.url}${shortLinkPath(poster.code)}`}
              label={`QR код: ${promise}`}
              size={224}
              className="h-56 w-56"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/qr-zabobovdol.png"
              alt="QR код към сайта"
              width={220}
              height={220}
              className="h-56 w-56"
            />
          )}
        </div>
        <p className="mt-3 text-lg font-semibold text-slate-800">
          Сканирайте с камерата на телефона
        </p>
        <p className="mt-1 font-display text-2xl font-extrabold text-brand-700">
          {SITE.domain}
        </p>

        {/* Най-важните телефони */}
        <div className="mt-7 grid w-full max-w-md grid-cols-1 gap-3 text-left">
          <div className="rounded-xl bg-red-50 p-4 text-center">
            <div className="text-sm font-medium text-red-800">Спешен телефон</div>
            <div className="font-display text-4xl font-extrabold text-red-700">112</div>
            <div className="text-xs text-red-700">полиция · спешна помощ · пожарна</div>
          </div>
          {SITE.contact.phone && (
            <div className="rounded-xl border border-slate-200 p-3 text-center text-slate-700">
              За въпроси и предложения:{" "}
              <strong className="text-slate-900">{SITE.contact.phone}</strong>
            </div>
          )}
        </div>

        <p className="mt-6 max-w-md rounded-xl bg-amber-50 p-3 text-base font-semibold text-amber-900">
          Истинският ни адрес: {SITE.domain} — никога не искаме пари, ЕГН, ПИН или
          кодове от SMS.
        </p>

        <p className="mt-4 text-xs text-slate-600">
          Независим граждански проект в полза на жителите на {SITE.geo.city}.
        </p>
      </div>

      <p className="no-print mx-auto mt-6 max-w-2xl text-slate-600">
        Още за печат: <Link href="/pechat/sedmitsa" className="font-semibold text-brand-700 underline">седмицата в Бобов дол</Link>{" "}
        (за хората без смартфон) и <Link href="/pechat" className="font-semibold text-brand-700 underline">важните телефони</Link>.
      </p>
    </div>
  );
}
