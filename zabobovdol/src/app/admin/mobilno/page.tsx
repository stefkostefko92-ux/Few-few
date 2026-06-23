import { requireAdmin } from "@/lib/auth";
import { getAndroidApp } from "@/lib/settings";
import { saveAndroidApp } from "@/lib/admin/settings-actions";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function AdminMobileAppPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const { saved, error } = await searchParams;
  const { packageName, fingerprints } = await getAndroidApp();
  const linked = fingerprints.length > 0;
  const assetlinksUrl = `${SITE.url}/.well-known/assetlinks.json`;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Мобилно приложение (Android)</h1>
        <p className="text-slate-600">
          Приложението показва същия сайт на цял екран. Тук го свързвате със
          сайта, за да се отваря като истинско приложение (без адресна лента).
        </p>
      </div>

      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">Запазено.</div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Състояние */}
      <div
        className={
          "rounded-xl border p-5 " +
          (linked ? "border-green-300 bg-green-50" : "border-slate-200 bg-white")
        }
      >
        <div className="flex items-center gap-2">
          <span
            className={"inline-block h-3 w-3 rounded-full " + (linked ? "bg-green-500" : "bg-slate-400")}
            aria-hidden
          />
          <span className="font-semibold text-slate-900">
            {linked
              ? `Свързано приложение (${fingerprints.length} отпечатък/ци)`
              : "Все още няма свързано приложение"}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Файлът за връзка се сервира на{" "}
          <a href={assetlinksUrl} target="_blank" rel="noopener" className="text-brand-700 underline">
            {assetlinksUrl}
          </a>
          .
        </p>
      </div>

      {/* Как се прави */}
      <ol className="space-y-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
        <li><strong>1.</strong> Разработчикът строи приложението (виж папка <code>android/</code> в проекта — има подробни стъпки с Bubblewrap).</li>
        <li><strong>2.</strong> Качва приложението в Google Play и включва „Play App Signing“.</li>
        <li><strong>3.</strong> Google Play показва <strong>SHA‑256 отпечатък</strong> (Setup → App integrity → App signing key certificate).</li>
        <li><strong>4.</strong> Копирате този отпечатък тук долу и натискате „Запази“.</li>
        <li><strong>5.</strong> Готово — приложението започва да се отваря на цял екран.</li>
      </ol>

      {/* Настройки */}
      <form
        action={saveAndroidApp}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
      >
        <div>
          <label className="label" htmlFor="packageName">Име на пакет (Package name)</label>
          <input
            id="packageName"
            name="packageName"
            className="input"
            defaultValue={packageName}
            placeholder="eu.carbonstealth.zabobovdol"
          />
          <p className="mt-1 text-xs text-slate-500">
            Уникалното име на приложението в Google Play. Сменя се само ако
            разработчикът е избрал друго.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="fingerprints">
            SHA‑256 отпечатък(ци) на сертификата
          </label>
          <textarea
            id="fingerprints"
            name="fingerprints"
            rows={4}
            className="input font-mono text-xs"
            defaultValue={fingerprints.join("\n")}
            placeholder={"AB:CD:EF:12:…  (по един на ред, ако са повече)"}
          />
          <p className="mt-1 text-xs text-slate-500">
            Поставете го от Google Play Console. Може да добавите няколко (напр.
            ключа за качване и ключа на Play) — всеки на нов ред.
          </p>
        </div>
        <button type="submit" className="btn-primary">Запази</button>
      </form>
    </div>
  );
}
