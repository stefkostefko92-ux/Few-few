import Link from "next/link";
import { getPinnedScamAlert } from "@/lib/queries";
import { AlertTriangle } from "@/components/icons";

// Показва закачено предупреждение за измама (ако има такова). Безопасно е без
// база данни — тогава просто не показва нищо.
export async function ScamBanner() {
  const alert = await getPinnedScamAlert();
  if (!alert) return null;

  return (
    <div className="border-b border-crimson-200 bg-crimson-50">
      <div className="container-content flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-base">
        <AlertTriangle className="h-5 w-5 text-crimson-700" aria-hidden />
        <span className="font-semibold text-crimson-700">Внимание, измама:</span>
        <span className="text-slate-700">{alert.summary || alert.title}</span>
        <Link href="/izmami" className="font-semibold text-crimson-700 underline">
          Как да се пазя
        </Link>
      </div>
    </div>
  );
}
