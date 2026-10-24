import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PUSH_TOPICS } from "@/lib/push";
import { selectSubscribers } from "@/lib/push-core";
import { sendManualPush } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPushPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; failed?: string; error?: string }>;
}) {
  await requireAdmin();
  const { sent, failed, error } = await searchParams;
  const subs = await prisma.pushSubscription.findMany({ select: { topics: true } });
  const keys = Object.keys(PUSH_TOPICS) as (keyof typeof PUSH_TOPICS)[];
  const configured = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">Известия</h1>

      {!configured && (
        <div role="alert" className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Известията не са включени на сървъра (липсват VAPID ключове).
        </div>
      )}
      {sent !== undefined && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          Изпратено до {sent} устройства{failed && failed !== "0" ? `, неуспешни: ${failed}` : ""}.
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Абонати по тема</h2>
        <ul className="mt-2 space-y-1 text-slate-700">
          {keys.map((k) => (
            <li key={k}>
              {PUSH_TOPICS[k]}: <strong>{selectSubscribers(subs, k).length}</strong>
            </li>
          ))}
        </ul>
      </div>

      <form action={sendManualPush} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Изпрати известие</h2>
        <p className="text-sm text-slate-600">
          Известието отива веднага до всички абонати на темата и не може да се върне. Пишете кратко и ясно.
        </p>
        <div>
          <label className="label" htmlFor="topic">Тема</label>
          <select id="topic" name="topic" className="input" required>
            {keys.map((k) => (
              <option key={k} value={k}>
                {PUSH_TOPICS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="title">Заглавие (до 90 знака)</label>
          <input id="title" name="title" className="input" maxLength={90} required />
        </div>
        <div>
          <label className="label" htmlFor="body">Текст (до 180 знака)</label>
          <textarea id="body" name="body" rows={3} className="input" maxLength={180} required />
        </div>
        <div>
          <label className="label" htmlFor="url">Вътрешна връзка (по избор)</label>
          <input id="url" name="url" className="input" defaultValue="/" placeholder="/izmami" />
        </div>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="confirm" required className="mt-1 h-5 w-5" />
          <span>Потвърждавам, че искам да изпратя известието сега.</span>
        </label>
        <button type="submit" className="btn-primary">
          Изпрати
        </button>
      </form>
    </div>
  );
}
