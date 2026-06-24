import { requireAdmin } from "@/lib/auth";
import { SITE } from "@/lib/site";
import { getSeoVerification } from "@/lib/settings";
import { getIndexNowKey, INDEXNOW_KEY_PATH } from "@/lib/indexnow";
import { saveSeoVerification, notifySearchEngines } from "@/lib/admin/settings-actions";

export const dynamic = "force-dynamic";

export default async function IndexingPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; inx?: string; n?: string; msg?: string }>;
}) {
  await requireAdmin();
  const { saved, inx, n, msg } = await searchParams;
  const [ver, key] = await Promise.all([getSeoVerification(), getIndexNowKey()]);

  const sitemapUrl = `${SITE.url}/sitemap.xml`;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Търсачки (индексиране)</h1>
        <p className="text-slate-600">
          Оттук уведомявате търсачките за сайта, за да го намират хората по-бързо.
        </p>
      </div>

      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">Запазено.</div>
      )}
      {inx === "ok" && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          Готово! Уведомихме търсачките за <strong>{n}</strong> страници (Bing, Yandex и др.).
        </div>
      )}
      {inx === "err" && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          Възникна проблем: {msg}. Опитайте отново след малко.
        </div>
      )}

      {/* 1. Моментално уведомяване (IndexNow) */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          1. Уведоми търсачките сега (Bing, Yandex и др.)
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          С едно натискане казваме на търсачките, че сайтът има нови или обновени
          страници, и ги подканваме да ги обходят. Ползва протокола{" "}
          <strong>IndexNow</strong> (Bing, Yandex, Seznam и др.).{" "}
          <em>Google не участва в IndexNow — за него вижте точка 2 по-долу.</em>
        </p>
        <form action={notifySearchEngines} className="mt-4">
          <button type="submit" className="btn-primary">
            Уведоми търсачките за всички страници
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Може да го правите след по-голяма промяна в съдържанието. Ключът за
          IndexNow е генериран автоматично и е достъпен на{" "}
          <a href={INDEXNOW_KEY_PATH} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
            {SITE.domain}{INDEXNOW_KEY_PATH}
          </a>
          {key ? ` (ключ: ${key.slice(0, 8)}…).` : "."}
        </p>
      </section>

      {/* 2. Потвърждаване на собствеността + подаване на sitemap */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          2. Google и Bing — потвърдете собствеността и подайте картата на сайта
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Това се прави веднъж. Влизате в безплатните инструменти на Google и Bing,
          потвърждавате, че сайтът е ваш (с кода по-долу), и подавате адреса на
          картата на сайта (sitemap). После търсачките сами я следят.
        </p>

        <form action={saveSeoVerification} className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="google">
              Код за Google Search Console (само стойността на „content“)
            </label>
            <input
              id="google"
              name="google"
              defaultValue={ver.google}
              className="input"
              placeholder="напр. abcDEF123..."
            />
            <p className="mt-1 text-xs text-slate-500">
              В Google Search Console изберете метод „HTML маркер“ и поставете тук
              само стойността от <code>content=&quot;…&quot;</code>.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="bing">
              Код за Bing Webmaster Tools (стойността на „msvalidate.01“)
            </label>
            <input
              id="bing"
              name="bing"
              defaultValue={ver.bing}
              className="input"
              placeholder="напр. 0123456789ABCDEF..."
            />
          </div>
          <button type="submit" className="btn-primary">
            Запази кодовете
          </button>
        </form>

        <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
          <div className="font-semibold">Стъпки (веднъж):</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Отворете{" "}
              <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                Google Search Console
              </a>{" "}
              и{" "}
              <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                Bing Webmaster Tools
              </a>{" "}
              (вход с Google/Microsoft акаунт).
            </li>
            <li>Добавете сайта <strong>{SITE.url}</strong>.</li>
            <li>За потвърждение изберете „HTML маркер/таг“, копирайте кода и го поставете горе, после „Запази“.</li>
            <li>Натиснете „Verify/Потвърди“ в инструмента.</li>
            <li>
              Подайте картата на сайта (Sitemap):{" "}
              <a href={sitemapUrl} target="_blank" rel="noopener noreferrer" className="break-all text-brand-700 underline">
                {sitemapUrl}
              </a>
            </li>
          </ol>
        </div>
      </section>

      {/* 3. Полезни адреси */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Адреси за търсачките</h2>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            Карта на сайта:{" "}
            <a href={sitemapUrl} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">{sitemapUrl}</a>
          </li>
          <li>
            Правила за обхождане:{" "}
            <a href={`${SITE.url}/robots.txt`} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">{SITE.url}/robots.txt</a>
          </li>
          <li>
            За AI търсачки:{" "}
            <a href={`${SITE.url}/llms.txt`} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">{SITE.url}/llms.txt</a>
          </li>
        </ul>
      </section>
    </div>
  );
}
