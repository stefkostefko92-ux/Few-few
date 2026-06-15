import { requireAdmin } from "@/lib/auth";
import { getAdSettings } from "@/lib/settings";
import { saveAdSettings } from "@/lib/admin/settings-actions";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const { saved, error } = await searchParams;
  const ad = await getAdSettings();

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
    </div>
  );
}
