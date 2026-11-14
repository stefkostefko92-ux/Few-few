import { requireAdmin } from "@/lib/auth";
import { mailStatus } from "@/lib/mail-config";
import { BREVO_HOST, hintForCode } from "@/lib/mail-config-core";
import { disableMailSettings, sendTestMail } from "@/lib/admin/mail-actions";
import { MailSettingsForm } from "@/components/admin/MailSettingsForm";
import { formatDateTime } from "@/lib/format-date";

export const dynamic = "force-dynamic";

// Пощата на сайта (Brevo SMTP) — по образеца на rilievi: настройва се от
// панела, без достъп до сървъра. Откъде тръгват писмата: панелът (ако е
// включен) → SMTP_* от .env → без поща (сигналите пак се записват в панела).
export default async function AdminMailPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; off?: string; test?: string; code?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const st = await mailStatus();

  const on = st.source !== null;
  const tone = st.panelKeyBroken
    ? "border-amber-300 bg-amber-50"
    : on
      ? "border-green-300 bg-green-50"
      : "border-slate-200 bg-white";
  const dot = st.panelKeyBroken ? "bg-amber-500" : on ? "bg-green-500" : "bg-slate-400";

  const code = (sp.code ?? "").replace(/[^A-Z0-9_]/g, "").slice(0, 31);
  const flash =
    sp.saved === "1"
      ? { ok: true, text: "Запазено и включено. Пратете пробно писмо, за да проверите." }
      : sp.off === "1"
        ? { ok: true, text: "Пощата от панела е изключена." }
        : sp.test === "ok"
          ? { ok: true, text: `Пробното писмо е изпратено до ${admin.email}. Проверете пощата си (и „Спам“).` }
          : sp.test === "off"
            ? { ok: false, text: "Няма настроена поща — попълнете формата по-долу." }
            : sp.test === "limit"
              ? { ok: false, text: "Твърде много пробни писма. Изчакайте няколко минути." }
              : sp.test === "err"
                ? { ok: false, text: hintForCode(code || "EERROR") }
                : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Поща на сайта (Brevo)</h1>
        <p className="text-slate-600">
          Оттук тръгват писмата на сайта: сигналите до общината, известията към екипа за
          нови обяви, сигнали и съобщения. Настройва се тук, без достъп до сървъра.
        </p>
      </div>

      {flash && (
        <p
          role={flash.ok ? "status" : "alert"}
          className={
            "rounded-lg px-4 py-2 text-sm " +
            (flash.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")
          }
        >
          {flash.text}
        </p>
      )}

      {/* Състояние */}
      <div className={`rounded-xl border p-5 ${tone}`}>
        <div className="flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-full ${dot}`} aria-hidden />
          <span className="font-semibold text-slate-900">
            {st.source === "панел"
              ? "Включена: настройката от панела"
              : st.source === ".env"
                ? "Включена: настройката от сървъра (.env)"
                : "Изключена — писмата не тръгват"}
          </span>
        </div>
        {st.panelKeyBroken && (
          <p className="mt-2 text-sm text-amber-900">
            Записаният ключ вече не може да се прочете (сменена е тайната на сървъра). Поставете
            SMTP ключа отново и натиснете „Запази и включи“.
          </p>
        )}
        {!on && !st.panelKeyBroken && (
          <p className="mt-2 text-sm text-slate-600">
            Сигналите и съобщенията пак се записват в панела, но никой не получава имейл.
          </p>
        )}
        {st.saved && (
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="inline text-slate-600">Сървър: </dt>
              <dd className="inline">
                {st.saved.host}:{st.saved.port}
              </dd>
            </div>
            <div>
              <dt className="inline text-slate-600">Подател: </dt>
              <dd className="inline">
                {st.saved.fromName} &lt;{st.saved.fromEmail}&gt;
              </dd>
            </div>
            <div>
              <dt className="inline text-slate-600">От панела: </dt>
              <dd className="inline">{st.enabled ? "включена" : "изключена"}</dd>
            </div>
            {st.updatedAt && (
              <div>
                <dt className="inline text-slate-600">Последна промяна: </dt>
                <dd className="inline">
                  {formatDateTime(new Date(st.updatedAt))}
                  {st.updatedBy ? ` · ${st.updatedBy}` : ""}
                </dd>
              </div>
            )}
          </dl>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <form action={sendTestMail}>
            <button type="submit" className="btn-secondary">
              Изпрати пробно писмо до {admin.email}
            </button>
          </form>
          {st.enabled && (
            <form action={disableMailSettings}>
              <button type="submit" className="btn-secondary">
                Изключи пощата от панела
              </button>
            </form>
          )}
        </div>
      </div>

      <MailSettingsForm
        keySaved={st.keySaved}
        defaults={{
          host: st.saved?.host ?? BREVO_HOST,
          port: st.saved?.port || "587",
          user: st.saved?.user ?? "",
          fromName: st.saved?.fromName || "За Бобов дол",
          fromEmail: st.saved?.fromEmail || "no-reply@carbonstealth.eu",
        }}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
        <h2 className="text-lg font-semibold text-slate-900">Как се взимат данните от Brevo</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Влезте в Brevo → горе вдясно името на акаунта → <strong>SMTP &amp; API</strong>.</li>
          <li>
            В раздел <strong>SMTP</strong> са сървърът, портът и логинът. Натиснете{" "}
            <strong>Generate a new SMTP key</strong> и копирайте ключа (показва се веднъж).
          </li>
          <li>
            В <strong>Senders, Domains &amp; Dedicated IPs</strong> потвърдете адреса на подателя
            (или целия домейн) — иначе Brevo не праща от него.
          </li>
          <li>Попълнете формата, въведете паролата си за панела и натиснете „Запази и включи“.</li>
          <li>Натиснете „Изпрати пробно писмо“ — трябва да дойде до вашия имейл.</li>
        </ol>
        <p className="mt-3 text-xs text-slate-600">
          Ключът се пази шифрован и никога не се показва, нито се записва в одит лога.
          Изключването връща към настройката от сървъра (.env), ако има такава.
        </p>
      </div>
    </div>
  );
}
