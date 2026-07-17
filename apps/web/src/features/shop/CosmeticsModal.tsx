import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeCustomCosmeticId, type CosmeticType, type GameKey } from "@aso/shared";
import { Badge, Button, Modal } from "../../ui";
import { ApiError, api, type CosmeticView } from "../../lib/api";
import { useAuthStore, useCosmeticsModal, useCosmeticsStore, useStoreModal } from "../../lib/store";
import { GAME_CATALOG } from "../lobby/games";

const TYPE_ORDER: CosmeticType[] = ["FELT", "CARDBACK", "BOARD", "CUE", "ESTATE"];
const VIP_TIERS = ["SILVER", "GOLD", "PLATINUM"];

/** Per-game cosmetics shop. Buys with gems; equips instantly. Opened from the
 *  lobby tile or in-match via `useCosmeticsModal`. */
export function CosmeticsModal() {
  const { t } = useTranslation();
  const game = useCosmeticsModal((s) => s.game);
  const close = useCosmeticsModal((s) => s.closeCosmetics);
  const openStore = useStoreModal((s) => s.openStore);
  const setEquipped = useCosmeticsStore((s) => s.setEquipped);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [items, setItems] = useState<CosmeticView[]>([]);
  const [gems, setGems] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!game) return;
    setError(null);
    api
      .cosmetics(game)
      .then((r) => {
        setItems(r.items);
        setGems(r.gems);
      })
      .catch(() => setError(t("shop.error")));
  }, [game, t]);

  if (!game) return null;
  const title = GAME_CATALOG.find((g) => g.key === game)?.title ?? game;

  async function buy(item: CosmeticView) {
    if (!game) return;
    setBusy(item.id);
    setError(null);
    try {
      const r = await api.buyCosmetic(item.id);
      setGems(r.gems);
      if (user) setUser({ ...user, gems: r.gems });
      // Auto-equip the freshly bought item for immediate gratification.
      const eq = await api.equipCosmetic(item.id);
      setEquipped(eq.equipped);
      const fresh = await api.cosmetics(game);
      setItems(fresh.items);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setError(code === "insufficient_gems" ? t("cosmetics.needGems") : t("shop.error"));
    } finally {
      setBusy(null);
    }
  }

  async function equip(item: CosmeticView) {
    if (!game) return;
    setBusy(item.id);
    try {
      const eq = await api.equipCosmetic(item.id);
      setEquipped(eq.equipped);
      setItems((prev) =>
        prev.map((c) => ({
          ...c,
          equipped: c.id === item.id ? true : c.type === item.type ? false : c.equipped,
        })),
      );
    } catch {
      setError(t("shop.error"));
    } finally {
      setBusy(null);
    }
  }

  const isVip = !!user && VIP_TIERS.includes(user.vipTier);

  async function equipCustom(type: CosmeticType, a: string, b: string) {
    if (!game) return;
    const id = makeCustomCosmeticId(game as GameKey, type, a, b);
    setBusy(id);
    setError(null);
    try {
      const eq = await api.equipCustomCosmetic(id);
      setEquipped(eq.equipped);
      // A custom palette wins the slot — clear the catalog "equipped" flags.
      setItems((prev) => prev.map((c) => (c.type === type ? { ...c, equipped: false } : c)));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setError(code === "forbidden" ? t("cosmetics.customVip") : t("shop.error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={close} title={`${t("cosmetics.title")} · ${title}`}>
      <div className="-mt-2 mb-4 flex items-center justify-between">
        <p className="text-xs text-ink-muted">{t("cosmetics.subtitle")}</p>
        <button
          type="button"
          onClick={() => openStore("gems")}
          aria-label={t("cosmetics.buyGems")}
          className="flex items-center gap-1 rounded-full border border-brass-400/25 px-2.5 py-1 text-sm text-ink-100 hover:border-brass-300"
        >
          💎 {gems} <span className="text-brass-300" aria-hidden>+</span>
        </button>
      </div>

      {error ? (
        <p role="alert" className="mb-3 rounded-card bg-loss/10 px-3 py-2 text-sm text-loss">
          {error}
        </p>
      ) : null}

      <div className="max-h-[60vh] overflow-y-auto pr-1">
        {TYPE_ORDER.map((type) => {
          const group = items.filter((i) => i.type === type);
          if (!group.length) return null;
          return (
            <div key={type} className="mb-5">
              <h3 className="mb-2 text-sm font-semibold text-ink-300">{t(`cosmetics.type.${type}`)}</h3>
              <CustomPalette
                type={type}
                isVip={isVip}
                busy={busy}
                onEquip={(a, b) => equipCustom(type, a, b)}
                onNeedVip={() => openStore("vip")}
                t={t}
              />
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {group.map((item) => (
                  <li key={item.id}>
                    <CosmeticCard
                      item={item}
                      busy={busy === item.id}
                      onBuy={() => buy(item)}
                      onEquip={() => equip(item)}
                      t={t}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/** VIP creative perk: pick two colours and equip a custom palette for a slot. */
function CustomPalette({
  type,
  isVip,
  busy,
  onEquip,
  onNeedVip,
  t,
}: {
  type: CosmeticType;
  isVip: boolean;
  busy: string | null;
  onEquip: (a: string, b: string) => void;
  onNeedVip: () => void;
  t: (k: string) => string;
}) {
  const [a, setA] = useState("#173a63");
  const [b, setB] = useState("#0b0f24");
  const preview =
    type === "BOARD"
      ? undefined
      : type === "CARDBACK"
        ? `linear-gradient(135deg, ${a}, ${b})`
        : `radial-gradient(120% 120% at 40% 20%, ${a}, ${b})`;
  const pending = busy?.includes(".custom-") ?? false;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-card border border-violet-400/25 bg-felt-800/50 p-2.5">
      <span
        className="h-11 w-16 shrink-0 rounded-md border border-brass-400/25"
        style={
          type === "BOARD"
            ? { display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", overflow: "hidden" }
            : { background: preview }
        }
      >
        {type === "BOARD" ? (
          <>
            <span style={{ background: a }} />
            <span style={{ background: b }} />
            <span style={{ background: b }} />
            <span style={{ background: a }} />
          </>
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-100">
          {t("cosmetics.custom")} <Badge tone="vip">VIP</Badge>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input type="color" value={a} onChange={(e) => setA(e.target.value)} aria-label={t("cosmetics.colorA")} className="h-6 w-9 cursor-pointer rounded border-0 bg-transparent p-0" />
          <input type="color" value={b} onChange={(e) => setB(e.target.value)} aria-label={t("cosmetics.colorB")} className="h-6 w-9 cursor-pointer rounded border-0 bg-transparent p-0" />
        </div>
      </div>
      <Button
        variant="felt"
        loading={pending}
        onClick={() => (isVip ? onEquip(a, b) : onNeedVip())}
        className="shrink-0"
      >
        {isVip ? t("cosmetics.equip") : `🔒 ${t("cosmetics.vipOnly")}`}
      </Button>
    </div>
  );
}

function Swatch({ item }: { item: CosmeticView }) {
  const { a, b } = item.colors;
  if (item.type === "CARDBACK") {
    return (
      <span
        className="grid h-16 w-full place-items-center rounded-md border border-brass-400/40 font-display text-xl text-brass-300"
        style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
      >
        A
      </span>
    );
  }
  if (item.type === "BOARD") {
    return (
      <span className="grid h-16 w-full grid-cols-2 grid-rows-2 overflow-hidden rounded-md border border-brass-400/20">
        <span style={{ background: a }} />
        <span style={{ background: b }} />
        <span style={{ background: b }} />
        <span style={{ background: a }} />
      </span>
    );
  }
  // FELT
  return (
    <span
      className="block h-16 w-full rounded-md border border-brass-400/20"
      style={{ background: `radial-gradient(120% 120% at 40% 20%, ${a}, ${b})` }}
    />
  );
}

function CosmeticCard({
  item,
  busy,
  onBuy,
  onEquip,
  t,
}: {
  item: CosmeticView;
  busy: boolean;
  onBuy: () => void;
  onEquip: () => void;
  t: (k: string) => string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-brass-400/15 bg-felt-800/60 p-2">
      <Swatch item={item} />
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-xs text-ink-100" title={item.name}>
          {item.name}
        </span>
        {item.vipExclusive ? <Badge tone="vip">VIP</Badge> : null}
      </div>

      {item.equipped ? (
        <Button variant="ghost" disabled className="w-full text-win">
          ✓ {t("cosmetics.equipped")}
        </Button>
      ) : item.owned ? (
        <Button variant="felt" loading={busy} onClick={onEquip} className="w-full">
          {t("cosmetics.equip")}
        </Button>
      ) : item.locked ? (
        <Button variant="ghost" disabled className="w-full">
          🔒 {t("cosmetics.vipOnly")}
        </Button>
      ) : (
        <Button loading={busy} onClick={onBuy} className="w-full">
          💎 {item.gemPrice}
        </Button>
      )}
    </div>
  );
}
