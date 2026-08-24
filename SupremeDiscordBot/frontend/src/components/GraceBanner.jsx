// frontend/src/components/GraceBanner.jsx
// Показва се, когато абонаментът е ОТМЕНЕН, но платеният период още тече.
//
// Защо съществува: решението на собственика е отмяната да НЕ отнема достъп
// веднага — клиентът е платил текущия период и го ползва докрай (backend:
// stripe.js → customer.subscription.deleted пише Server.accessUntil). Без този
// банер състоянието е невидимо: планът в базата е „free“, услугата още работи,
// и в един момент спира без предупреждение. Тук казваме кога.
//
// Различен от PastDueBanner: там плащането е ПРОВАЛЕНО (червено, „оправи го“),
// тук всичко е платено и наред (кехлибарено, „поднови, ако искаш да продължиш“).
//
// НЕ показваме при refund/chargeback — там достъпът пада в същата секунда и
// accessUntil е null, значи този компонент така или иначе мълчи.
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { getServer } from "../api";
import { useT } from "../contexts/I18nContext";

export default function GraceBanner() {
  const { t } = useT();
  const { serverId } = useParams();

  const { data: server } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => getServer(serverId),
    enabled: !!serverId,
  });

  if (!serverId || !server?.accessUntil) return null;

  const until = new Date(server.accessUntil);
  if (!(until > new Date())) return null;

  const days = Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86_400_000));

  return (
    <div role="status" className="bg-warning/15 border-b border-warning/40 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Clock className="w-5 h-5 text-warning flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm text-cs-text font-bold">{t("grace.title")}</div>
            <div className="text-xs text-cs-muted">
              {t("grace.desc", { days, date: until.toLocaleDateString() })}
            </div>
          </div>
        </div>
        <Link
          to={`/dashboard/${serverId}/premium`}
          className="px-4 py-1.5 rounded-full bg-warning hover:bg-warning/80 text-cs-bg text-xs font-bold uppercase tracking-wider transition-colors"
        >
          {t("grace.renew")}
        </Link>
      </div>
    </div>
  );
}
