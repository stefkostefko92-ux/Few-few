import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { formatDualPrice, type ProductView, type VipPerks, type VipTier } from "@aso/shared";
import { Badge, Button, Panel } from "../../ui";
import { ApiError, api } from "../../lib/api";
import { useAuthStore } from "../../lib/store";

type VipPerksMap = Record<VipTier, VipPerks>;

const KIND_ORDER: ProductView["kind"][] = ["VIP_SUB", "GEMS", "CHIP_PACK", "COSMETIC"];
// Двойно обозначаване €/лв. по Закона за въвеждане на еврото (преходен период).
const eur = formatDualPrice;

/** Human-readable, distinguishing perks for a VIP tier. */
function perkLines(p: VipPerks, t: (k: string, o?: Record<string, unknown>) => string): string[] {
  const lines: string[] = [];
  // `adsRemoved` is intentionally not shown — there is no ad system, so listing
  // "no ads" as a perk would be a misleading commercial practice.
  if (p.xpMultiplier > 1) lines.push(t("shop.perk.xp", { p: Math.round((p.xpMultiplier - 1) * 100) }));
  if (p.dailyChipMultiplier > 1)
    lines.push(t("shop.perk.daily", { p: Math.round((p.dailyChipMultiplier - 1) * 100) }));
  if (p.monthlyGems > 0) lines.push(t("shop.perk.gems", { n: p.monthlyGems }));
  if (p.exclusiveCosmetics) lines.push(t("shop.perk.cosmetics"));
  lines.push(t("shop.perk.quests", { n: p.questSlots }));
  if (p.nameBadge) lines.push(t("shop.perk.badge"));
  return lines;
}

export function Shop() {
  const { t } = useTranslation();
  const setUser = useAuthStore((s) => s.setUser);
  const [products, setProducts] = useState<ProductView[]>([]);
  const [vipPerks, setVipPerks] = useState<VipPerksMap | null>(null);
  const [billingEnabled, setBillingEnabled] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Per-SKU checkout consent (CRD art. 16): the buyer must agree before we
  // create a Stripe session. One-off digital goods → immediate supply + loss of
  // the 14-day withdrawal right; VIP → 14-day right with proportional deduction.
  const [consented, setConsented] = useState<Record<string, boolean>>({});
  const [params] = useSearchParams();

  useEffect(() => {
    api
      .catalog()
      .then((c) => {
        setProducts(c.products);
        setVipPerks(c.vipPerks);
        setBillingEnabled(c.billingEnabled !== false);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const status = params.get("status");
    if (status === "success") {
      setNotice(t("shop.purchaseSuccess"));
      // The webhook credits asynchronously; refresh the wallet so the new
      // balance shows once it has landed.
      api.me().then((r) => setUser(r.user)).catch(() => undefined);
    }
    if (status === "cancel") setNotice(t("shop.purchaseCancel"));
  }, [params, t, setUser]);

  async function buy(sku: string) {
    if (!consented[sku]) return; // gated by the consent checkbox below
    setBusy(sku);
    setNotice(null);
    try {
      const { url } = await api.checkout(sku);
      if (url) window.location.href = url;
    } catch (err) {
      setNotice(
        err instanceof ApiError && err.code === "stripe_unavailable"
          ? t("shop.unavailable")
          : t("shop.error"),
      );
    } finally {
      setBusy(null);
    }
  }

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    items: products.filter((p) => p.kind === kind),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-2 text-4xl text-brass-300">{t("nav.shop")}</h1>
      <p className="mb-6 text-sm text-ink-muted">{t("shop.disclaimer")}</p>

      {!billingEnabled ? (
        <Panel className="mb-6 border-brass-400/40 py-3 text-center text-ink-100">
          {t("shop.comingSoon")}
        </Panel>
      ) : null}

      {notice ? (
        <Panel className="mb-6 border-brass-400/40 py-3 text-center text-ink-100">{notice}</Panel>
      ) : null}

      {grouped.map((group) => (
        <section key={group.kind} className="mb-8">
          <h2 className="mb-3 text-xl text-ink-300">{t(`shop.kind.${group.kind}`)}</h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((p) => (
              <li key={p.sku}>
                <Panel className="flex h-full flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg text-ink-100">{p.title}</h3>
                      {p.vipTier ? <Badge tone="vip">{p.vipTier}</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-brass-300">
                      {p.grantGems ? t("shop.grantGems", { n: p.grantGems }) : null}
                      {p.grantChips ? t("shop.grantChips", { n: p.grantChips }) : null}
                      {p.kind === "VIP_SUB" ? t("shop.perMonth") : null}
                    </p>
                    {p.kind === "VIP_SUB" && p.vipTier && vipPerks ? (
                      <ul className="mt-3 space-y-1 text-xs text-ink-300">
                        {perkLines(vipPerks[p.vipTier], t).map((line) => (
                          <li key={line} className="flex items-start gap-1.5">
                            <span className="text-win">✓</span>
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div>
                    <label className="mb-3 flex items-start gap-2 text-xs text-ink-300">
                      <input
                        type="checkbox"
                        checked={consented[p.sku] ?? false}
                        onChange={(e) =>
                          setConsented((c) => ({ ...c, [p.sku]: e.target.checked }))
                        }
                        className="mt-0.5 size-4 shrink-0 accent-brass-300"
                      />
                      <span>
                        {p.kind === "VIP_SUB"
                          ? t("shop.consentSubscription")
                          : t("shop.consentImmediate")}
                      </span>
                    </label>
                    <Button
                      loading={busy === p.sku}
                      disabled={!billingEnabled || !(consented[p.sku] ?? false)}
                      onClick={() => void buy(p.sku)}
                      className="w-full"
                    >
                      {billingEnabled ? eur(p.priceCents) : `${eur(p.priceCents)} · ${t("shop.soon")}`}
                    </Button>
                    {!(consented[p.sku] ?? false) ? (
                      <p className="mt-1.5 text-center text-[0.7rem] text-ink-muted">
                        {t("shop.consentRequired")}
                      </p>
                    ) : null}
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
