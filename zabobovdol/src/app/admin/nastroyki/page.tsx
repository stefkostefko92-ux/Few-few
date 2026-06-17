import { requireAdmin } from "@/lib/auth";
import {
  getAdSettings,
  getDutyInfo,
  getFacebookUrl,
  getChurchServices,
} from "@/lib/settings";
import {
  saveAdSettings,
  saveDutyInfo,
  saveContactSettings,
  saveChurchServices,
} from "@/lib/admin/settings-actions";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const { saved, error } = await searchParams;
  const [ad, dutyInfo, facebookUrl, churchServices] = await Promise.all([
    getAdSettings(),
    getDutyInfo(),
    getFacebookUrl(),
    getChurchServices(),
  ]);

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">Настройки</h1>

      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">Запазено.</div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <form action={saveAdSettings} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Реклама</h2>
        <div>
          <label className="label" htmlFor="priceEur">
            Цена на реклама (€ на месец)
          </label>
          <input
            id="priceEur"
            name="priceEur"
            type="number"
            step="any"
            min="1"
            defaultValue={ad.priceEur}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="revolutUrl">
            Линк за плащане (Revolut)
          </label>
          <input
            id="revolutUrl"
            name="revolutUrl"
            type="url"
            defaultValue={ad.revolutUrl}
            className="input"
            placeholder="https://revolut.me/..."
          />
        </div>
        <button type="submit" className="btn-primary">
          Запази
        </button>
      </form>

      <form action={saveContactSettings} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Социални мрежи</h2>
        <p className="text-sm text-slate-600">
          Връзка към Facebook страницата или групата на проекта. Ако е попълнена,
          в долната част на сайта (footer) се показва бутон към Facebook. Оставете
          празно, за да го скриете.
        </p>
        <div>
          <label className="label" htmlFor="facebookUrl">
            Facebook (адрес на страница/група)
          </label>
          <input
            id="facebookUrl"
            name="facebookUrl"
            type="url"
            defaultValue={facebookUrl}
            className="input"
            placeholder="https://www.facebook.com/..."
          />
        </div>
        <button type="submit" className="btn-primary">
          Запази
        </button>
      </form>

      <form action={saveDutyInfo} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Дежурна аптека / лекар</h2>
        <p className="text-sm text-slate-600">
          Този текст се показва на страницата „Дежурна аптека“. Обновявайте го,
          когато се сменя дежурството (напр. коя аптека работи тази седмица, до
          колко часа, телефон).
        </p>
        <div>
          <label className="label" htmlFor="dutyInfo">
            Текущо дежурство (свободен текст)
          </label>
          <textarea
            id="dutyInfo"
            name="dutyInfo"
            rows={5}
            defaultValue={dutyInfo}
            className="input"
            placeholder={"Напр.:\nТази седмица (10–16 юни) дежури Аптека „Здраве“, ул. Кирил и Методий 5, до 20:00 ч. Телефон: 0700 00 000."}
          />
        </div>
        <button type="submit" className="btn-primary">
          Запази
        </button>
      </form>

      <form action={saveChurchServices} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Църковни служби</h2>
        <p className="text-sm text-slate-600">
          Този текст се показва в раздел „Религиозен живот“ на страница „Опознай
          Бобов дол“. Попълнете часовете на службите и празниците. Оставете
          празно, за да го скриете.
        </p>
        <div>
          <label className="label" htmlFor="churchServices">
            Часове на службите (свободен текст)
          </label>
          <textarea
            id="churchServices"
            name="churchServices"
            rows={5}
            defaultValue={churchServices}
            className="input"
            placeholder={"Напр.:\nХрам „Свети Никола“ — неделна св. литургия от 9:00 ч.\nГолеми празници — вечерня от 17:00 ч."}
          />
        </div>
        <button type="submit" className="btn-primary">
          Запази
        </button>
      </form>
    </div>
  );
}
