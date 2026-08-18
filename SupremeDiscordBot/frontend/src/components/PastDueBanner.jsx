// frontend/src/components/PastDueBanner.jsx
// Показва се, когато Stripe е маркирал абонамента като `past_due` или `unpaid`.
//
// Защо съществува: при провалено плащане backend-ът пише `past_due` и праща DM
// на собственика на сървъра (stripe.js → invoice.payment_failed). Но DM-ът може
// да е затворен, изгубен в кутията или отворен от друг администратор — а в
// таблото досега НЕ пишеше нищо. Резултатът беше тих отпадък: човекът разбира,
// че е загубил Premium, чак когато ботът спре да работи.
//
// НЕ е скриваем. Останалите банери са информационни; този значи „услугата ти ще
// бъде спряна". Скриването му би било услуга към нас, не към клиента.
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AlertTriangle, CreditCard } from "lucide-react";
import { getServer, openPortal } from "../api";
import { useT } from "../contexts/I18nContext";

// Статусите на Stripe, при които парите не са влезли И вината е в плащането.
//
// `canceled` НЕ е тук — тогава абонаментът е приключил и говорят
// TrialBanner/PremiumPage. `incomplete` също НЕ е: при асинхронни методи
// (SEPA/ACH) плащането се обработва с ДНИ и това е нормален ход, не провал —
// червен „Payment failed" върху обработващо се плащане е лъжа към клиента
// (Продавача, 07.08.2026).
const AT_RISK = new Set(["past_due", "unpaid"]);

export default function PastDueBanner() {
  const { t } = useT();
  const { serverId } = useParams();

  const { data: server } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => getServer(serverId),
    enabled: !!serverId,
  });

  const portalMut = useMutation({
    mutationFn: () => openPortal(serverId),
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
  });

  if (!serverId || !server) return null;
  if (!AT_RISK.has(server.stripeStatus)) return null;

  // Колко дни сме в това състояние — Stripe ретрайва няколко пъти, преди да
  // отреже, и клиентът заслужава да знае, че часовникът тече.
  const days = server.pastDueSince
    ? Math.max(0, Math.floor((Date.now() - new Date(server.pastDueSince).getTime()) / 86_400_000))
    : null;

  return (
    <div role="alert" className="bg-danger/15 border-b border-danger/40 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm text-cs-text font-bold">{t("pastDue.title")}</div>
            <div className="text-xs text-cs-muted">
              {days !== null && days > 0
                ? t("pastDue.descDays", { count: days })
                : t("pastDue.desc")}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => portalMut.mutate()}
          disabled={portalMut.isPending}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-danger hover:bg-danger/80 text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
        >
          <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
          {portalMut.isPending ? t("pastDue.opening") : t("pastDue.fixPayment")}
        </button>
      </div>
      {portalMut.isError && (
        <p role="alert" className="max-w-7xl mx-auto mt-2 text-xs text-danger">
          {t("pastDue.portalFailed")}
        </p>
      )}
    </div>
  );
}
