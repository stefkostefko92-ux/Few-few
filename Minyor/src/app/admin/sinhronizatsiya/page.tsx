import { requireAdmin } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { runSyncAction } from "@/lib/admin/sync-actions";

export const dynamic = "force-dynamic";

export default async function SyncPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  await requireAdmin();
  const { ok, err } = await searchParams;
  const [lastRun, lastStatus] = await Promise.all([
    getSetting("syncLastRun"),
    getSetting("syncLastStatus"),
  ]);

  const lastRunText = lastRun
    ? new Intl.DateTimeFormat("bg-BG", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(lastRun))
    : "няма";

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">Синхронизация на данни</h1>
      <p className="text-slate-600">
        Програмата, резултатите, следващият мач и класирането се обновяват
        автоматично от <strong>bgclubs.eu</strong>. Тук можете да стартирате
        обновяване ръчно.
      </p>

      {ok && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          Обновяването завърши успешно.
        </div>
      )}
      {err && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          Обновяването не успя. Вижте статуса по-долу или опитайте отново по-късно.
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Последно обновяване</dt>
            <dd className="font-medium text-slate-900">{lastRunText}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Статус</dt>
            <dd className="text-right font-medium text-slate-900">
              {lastStatus ?? "—"}
            </dd>
          </div>
        </dl>
        <form action={runSyncAction} className="mt-5">
          <button type="submit" className="btn-primary">
            Обнови сега
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        <p className="font-semibold text-slate-700">Бележки</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Автоматичните данни (source „bgclubs“) са водещи пред ръчно
            въведените за програма, резултати и класиране.
          </li>
          <li>
            <strong>Съставът</strong> на отбора се поддържа ръчно от раздел
            „Състав“ — за него няма надежден автоматичен източник.
          </li>
          <li>
            Редовното обновяване се извършва от сървърен cron на всеки няколко
            часа (вижте DEPLOY.md).
          </li>
        </ul>
      </div>
    </div>
  );
}
