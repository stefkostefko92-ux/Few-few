import { requireAdmin } from "@/lib/auth";
import { getAiConfig, maskKey, PROVIDER_LABELS } from "@/lib/ai-config";
import { saveAiSettings } from "@/lib/admin/settings-actions";
import { AiTester } from "@/components/admin/AiTester";

export const dynamic = "force-dynamic";

export default async function AdminAssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const { saved } = await searchParams;
  const ai = await getAiConfig();

  const on = ai.effective !== "rules";
  const wantsAiButBroken = ai.configured !== "rules" && ai.effective === "rules";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Дигитален помощник (AI)</h1>
        <p className="text-slate-600">
          Чатът долу вдясно на сайта. Тук включвате „умния“ режим и проверявате
          дали работи — без да пипате сървъра.
        </p>
      </div>

      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          Запазено.
        </div>
      )}

      {/* Състояние */}
      <div
        className={
          "rounded-xl border p-5 " +
          (on
            ? "border-green-300 bg-green-50"
            : wantsAiButBroken
              ? "border-amber-300 bg-amber-50"
              : "border-slate-200 bg-white")
        }
      >
        <div className="flex items-center gap-2">
          <span
            className={
              "inline-block h-3 w-3 rounded-full " +
              (on ? "bg-green-500" : wantsAiButBroken ? "bg-amber-500" : "bg-slate-400")
            }
            aria-hidden
          />
          <span className="font-semibold text-slate-900">
            {on
              ? `Включен: ${PROVIDER_LABELS[ai.effective]}`
              : wantsAiButBroken
                ? "Избран е AI, но липсва валиден ключ"
                : "Работи без AI (само от съдържанието на сайта)"}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {on
            ? "Помощникът отговаря разговорно и помни разговора."
            : wantsAiButBroken
              ? "Помощникът временно отговаря от съдържанието на сайта. Поставете валиден ключ по-долу и натиснете „Запази“."
              : "Това е надеждно и безплатно. За разговорни отговори изберете Gemini (безплатно) по-долу."}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Източник на настройката: <strong>{ai.source}</strong>
        </p>
      </div>

      {/* Тест на живо */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Проба на живо</h2>
        <p className="mt-1 mb-3 text-sm text-slate-600">
          Напишете въпрос (напр. „телефон на общината“) и вижте отговора и кой
          режим е отговорил.
        </p>
        <AiTester />
      </div>

      {/* Настройки */}
      <form
        action={saveAiSettings}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6"
      >
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Настройки</h2>
          <p className="mt-1 text-sm text-slate-600">
            Изберете режим. Препоръка: <strong>Gemini</strong> — безплатен и
            разговорен.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="label">Режим на помощника</legend>
          {(["rules", "gemini", "anthropic"] as const).map((p) => (
            <label
              key={p}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
            >
              <input
                type="radio"
                name="provider"
                value={p}
                defaultChecked={ai.configured === p}
                className="mt-1"
              />
              <span className="text-sm">
                <span className="font-medium text-slate-900">{PROVIDER_LABELS[p]}</span>
                {p === "gemini" && (
                  <span className="block text-slate-500">
                    Безплатен ключ от{" "}
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener"
                      className="text-brand-700 underline"
                    >
                      aistudio.google.com/apikey
                    </a>
                    .
                  </span>
                )}
                {p === "anthropic" && (
                  <span className="block text-slate-500">
                    Най-високо качество, но платен (ключ от console.anthropic.com).
                  </span>
                )}
              </span>
            </label>
          ))}
        </fieldset>

        {/* Gemini */}
        <div className="space-y-3 rounded-lg bg-slate-50 p-4">
          <h3 className="font-medium text-slate-900">Google Gemini (безплатен)</h3>
          <div>
            <label className="label" htmlFor="geminiKey">
              Ключ {ai.geminiKey && <span className="text-slate-500">(зададен: {maskKey(ai.geminiKey)})</span>}
            </label>
            <input
              id="geminiKey"
              name="geminiKey"
              type="password"
              autoComplete="off"
              className="input"
              placeholder={ai.geminiKey ? "Оставете празно, за да запазите текущия" : "Поставете ключа тук"}
            />
            {ai.geminiKey && (
              <label className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" name="clearGemini" /> Изтрий запазения ключ
              </label>
            )}
          </div>
          <div>
            <label className="label" htmlFor="geminiModel">Модел</label>
            <input
              id="geminiModel"
              name="geminiModel"
              className="input"
              defaultValue={ai.geminiModel}
              placeholder="gemini-2.0-flash"
            />
          </div>
        </div>

        {/* Claude */}
        <div className="space-y-3 rounded-lg bg-slate-50 p-4">
          <h3 className="font-medium text-slate-900">Anthropic Claude (платен)</h3>
          <div>
            <label className="label" htmlFor="anthropicKey">
              Ключ {ai.anthropicKey && <span className="text-slate-500">(зададен: {maskKey(ai.anthropicKey)})</span>}
            </label>
            <input
              id="anthropicKey"
              name="anthropicKey"
              type="password"
              autoComplete="off"
              className="input"
              placeholder={ai.anthropicKey ? "Оставете празно, за да запазите текущия" : "Поставете ключа тук"}
            />
            {ai.anthropicKey && (
              <label className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" name="clearAnthropic" /> Изтрий запазения ключ
              </label>
            )}
          </div>
          <div>
            <label className="label" htmlFor="anthropicModel">Модел</label>
            <input
              id="anthropicModel"
              name="anthropicModel"
              className="input"
              defaultValue={ai.anthropicModel}
              placeholder="claude-opus-4-8"
            />
          </div>
        </div>

        <button type="submit" className="btn-primary">Запази</button>
        <p className="text-xs text-slate-500">
          Ключовете се пазят сигурно и никога не се показват изцяло, нито се
          записват в историята на промените.
        </p>
      </form>
    </div>
  );
}
