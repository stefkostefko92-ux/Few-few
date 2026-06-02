import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import type { ProductView } from "@aso/shared";
import { Badge, Button, Panel } from "../../ui";
import { ApiError, api } from "../../lib/api";
import { useAuthStore } from "../../lib/store";

const KIND_ORDER: ProductView["kind"][] = ["VIP_SUB", "GEMS", "CHIP_PACK", "COSMETIC"];
const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;

export function Shop() {
  const { t } = useTranslation();
  const setUser = useAuthStore((s) => s.setUser);
  const [products, setProducts] = useState<ProductView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [params] = useSearchParams();

  useEffect(() => {
    api.catalog().then((c) => setProducts(c.products)).catch(() => undefined);
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
                  </div>
                  <Button loading={busy === p.sku} onClick={() => void buy(p.sku)} className="w-full">
                    {eur(p.priceCents)}
                  </Button>
                </Panel>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
