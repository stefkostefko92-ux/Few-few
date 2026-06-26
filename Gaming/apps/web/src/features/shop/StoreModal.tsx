import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { ProductView } from "@aso/shared";
import { Badge, Button, Modal } from "../../ui";
import { ApiError, api } from "../../lib/api";
import { useStoreModal } from "../../lib/store";

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;

/**
 * Quick-buy store surfaced anywhere in the app (incl. mid-match via the wallet
 * bar). Shows the impulse currencies — gems and chip packs — with one-tap
 * Stripe checkout, plus a shortcut into the full shop for VIP and cosmetics.
 * Credit is always applied server-side from the signed webhook, never here.
 */
export function StoreModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const open = useStoreModal((s) => s.open);
  const reason = useStoreModal((s) => s.reason);
  const close = useStoreModal((s) => s.closeStore);

  const [products, setProducts] = useState<ProductView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || products.length) return;
    setLoading(true);
    setError(null);
    api
      .catalog()
      .then((c) => setProducts(c.products))
      .catch(() => setError(t("shop.error")))
      .finally(() => setLoading(false));
  }, [open, products.length, t]);

  async function buy(sku: string) {
    setBusy(sku);
    setError(null);
    try {
      const { url } = await api.checkout(sku);
      if (url) window.location.href = url;
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "stripe_unavailable"
          ? t("shop.unavailable")
          : t("shop.error"),
      );
    } finally {
      setBusy(null);
    }
  }

  const gems = products.filter((p) => p.kind === "GEMS");
  const chips = products.filter((p) => p.kind === "CHIP_PACK");

  const heading =
    reason === "chips"
      ? t("store.lowChips")
      : reason === "gems"
        ? t("store.lowGems")
        : reason === "vip"
          ? t("store.vipTitle")
          : t("store.title");

  return (
    <Modal open={open} onClose={close} title={heading}>
      <p className="-mt-2 mb-4 text-xs text-ink-muted">{t("shop.disclaimer")}</p>

      {error ? (
        <p role="alert" className="mb-3 rounded-card bg-loss/10 px-3 py-2 text-sm text-loss">
          {error}
        </p>
      ) : null}

      {loading && products.length === 0 ? (
        <p aria-live="polite" className="py-6 text-center text-sm text-ink-muted">
          {t("common.loading")}
        </p>
      ) : null}

      <Section label={`🪙 ${t("shop.kind.CHIP_PACK")}`} items={chips} busy={busy} onBuy={buy} t={t} />
      <Section label={`💎 ${t("shop.kind.GEMS")}`} items={gems} busy={busy} onBuy={buy} t={t} />

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-brass-400/15 pt-4">
        <Badge tone="vip">VIP</Badge>
        <Button
          variant="ghost"
          onClick={() => {
            close();
            navigate("/shop");
          }}
        >
          {t("store.fullShop")} →
        </Button>
      </div>
    </Modal>
  );
}

function Section({
  label,
  items,
  busy,
  onBuy,
  t,
}: {
  label: string;
  items: ProductView[];
  busy: string | null;
  onBuy: (sku: string) => void;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  if (!items.length) return null;
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-sm font-semibold text-ink-300">{label}</h3>
      <ul className="flex flex-col gap-2">
        {items.map((p) => (
          <li
            key={p.sku}
            className="flex items-center justify-between gap-3 rounded-card border border-brass-400/15 bg-felt-800/60 px-3 py-2"
          >
            <div>
              <div className="text-sm text-ink-100">{p.title}</div>
              <div className="text-xs text-brass-300">
                {p.grantGems ? t("shop.grantGems", { n: p.grantGems }) : null}
                {p.grantChips ? t("shop.grantChips", { n: p.grantChips }) : null}
              </div>
            </div>
            <Button loading={busy === p.sku} onClick={() => onBuy(p.sku)} className="shrink-0">
              {eur(p.priceCents)}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
