import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PRODUCT_KINDS, formatDualPrice } from "@aso/shared";
import { Badge, Button, Panel, cn } from "../../ui";
import { adminApi, type AdminProduct, type ProductCreate } from "./adminApi";
import { ErrorPanel, errorMessage, useLoad } from "./load";

const field =
  "rounded-card border border-brass-400/20 bg-felt-900/60 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brass-300";

type Draft = {
  sku: string;
  kind: string;
  priceCents: string;
  gems: string;
  chips: string;
  cosmeticId: string;
};

const emptyDraft: Draft = { sku: "", kind: "GEMS", priceCents: "", gems: "", chips: "", cosmeticId: "" };

const numOrNull = (s: string): number | null => (s.trim() === "" ? null : Number(s));

/** Store editor (§14, ADMIN/OWNER). Create products, edit price/grant, retire via
 *  active=false (no hard delete — Purchase history keeps its FK). */
export function AdminProducts() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useLoad(() => adminApi.products(), []);
  const [rows, setRows] = useState<AdminProduct[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (data) setRows(data.products);
  }, [data]);

  if (error) return <ErrorPanel error={error} onRetry={reload} />;
  if (loading) return <p className="text-ink-muted">{t("common.loading")}</p>;

  function startCreate() {
    setCreating(true);
    setEditId(null);
    setDraft(emptyDraft);
    setNotice(null);
  }

  function startEdit(p: AdminProduct) {
    setEditId(p.id);
    setCreating(false);
    setNotice(null);
    setDraft({
      sku: p.sku,
      kind: p.kind,
      priceCents: String(p.priceCents),
      gems: p.gems === null ? "" : String(p.gems),
      chips: p.chips === null ? "" : String(p.chips),
      cosmeticId: p.cosmeticId ?? "",
    });
  }

  function cancel() {
    setCreating(false);
    setEditId(null);
  }

  async function submit() {
    setBusy(true);
    setNotice(null);
    try {
      if (creating) {
        const input: ProductCreate = {
          sku: draft.sku.trim(),
          kind: draft.kind,
          priceCents: Number(draft.priceCents || 0),
          gems: numOrNull(draft.gems),
          chips: numOrNull(draft.chips),
          cosmeticId: draft.cosmeticId.trim() || null,
        };
        const r = await adminApi.createProduct(input);
        setRows((prev) => [...prev, r.product]);
      } else if (editId) {
        const r = await adminApi.updateProduct(editId, {
          priceCents: Number(draft.priceCents || 0),
          gems: numOrNull(draft.gems),
          chips: numOrNull(draft.chips),
          cosmeticId: draft.cosmeticId.trim() || null,
        });
        setRows((prev) => prev.map((p) => (p.id === editId ? r.product : p)));
      }
      cancel();
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p: AdminProduct) {
    setBusy(true);
    try {
      const r = await adminApi.updateProduct(p.id, { active: !p.active });
      setRows((prev) => prev.map((x) => (x.id === p.id ? r.product : x)));
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const editing = creating || editId !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg text-ink-100">{t("admin.productsTitle", "Продукти")}</h3>
        {!editing ? <Button onClick={startCreate}>{t("admin.productAdd", "Нов продукт")}</Button> : null}
      </div>

      {editing ? (
        <Panel className="flex flex-col gap-3">
          <h4 className="text-ink-100">
            {creating ? t("admin.productAdd", "Нов продукт") : t("admin.productEdit", "Редакция на продукт")}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">{t("admin.productSku", "SKU")}</span>
              <input
                className={field}
                value={draft.sku}
                disabled={!creating}
                onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                placeholder="gems_small"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">{t("admin.productKind", "Вид")}</span>
              <select
                className={field}
                value={draft.kind}
                disabled={!creating}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
              >
                {PRODUCT_KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">{t("admin.productPrice", "Цена (в стотинки €)")}</span>
              <input
                type="number"
                className={field}
                value={draft.priceCents}
                onChange={(e) => setDraft({ ...draft, priceCents: e.target.value })}
                placeholder="199"
              />
              {draft.priceCents ? (
                <span className="text-xs text-brass-300">{formatDualPrice(Number(draft.priceCents))}</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">{t("admin.productCosmetic", "Козметичен ID")}</span>
              <input
                className={field}
                value={draft.cosmeticId}
                onChange={(e) => setDraft({ ...draft, cosmeticId: e.target.value })}
                placeholder="—"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">{t("admin.productGems", "Скъпоценни камъни")}</span>
              <input
                type="number"
                className={field}
                value={draft.gems}
                onChange={(e) => setDraft({ ...draft, gems: e.target.value })}
                placeholder="—"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">{t("admin.productChips", "Чипове")}</span>
              <input
                type="number"
                className={field}
                value={draft.chips}
                onChange={(e) => setDraft({ ...draft, chips: e.target.value })}
                placeholder="—"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button loading={busy} disabled={creating && !draft.sku.trim()} onClick={submit}>
              {t("admin.save")}
            </Button>
            <Button variant="ghost" onClick={cancel}>
              {t("admin.cancel", "Отказ")}
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-ink-muted">
            <tr className="border-b border-brass-400/15">
              <th className="px-4 py-2">{t("admin.productSku", "SKU")}</th>
              <th className="px-3 py-2">{t("admin.productKind", "Вид")}</th>
              <th className="px-3 py-2 text-right">{t("admin.productPriceShort", "Цена")}</th>
              <th className="px-3 py-2 text-right">{t("admin.productGems", "Скъпоценни камъни")}</th>
              <th className="px-3 py-2 text-right">{t("admin.productChips", "Чипове")}</th>
              <th className="px-3 py-2">{t("admin.productActive", "Активен")}</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={cn("border-b border-brass-400/5", !p.active && "opacity-50")}>
                <td className="px-4 py-2 font-mono text-ink-100">{p.sku}</td>
                <td className="px-3 py-2 text-ink-300">{p.kind}</td>
                <td className="px-3 py-2 text-right tnum text-brass-300">{formatDualPrice(p.priceCents)}</td>
                <td className="px-3 py-2 text-right tnum text-ink-300">{p.gems ?? "—"}</td>
                <td className="px-3 py-2 text-right tnum text-ink-300">{p.chips ?? "—"}</td>
                <td className="px-3 py-2">
                  <Badge tone={p.active ? "brass" : "felt"}>
                    {p.active ? t("admin.productActive", "Активен") : t("admin.productInactive", "Спрян")}
                  </Badge>
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => startEdit(p)}>
                      {t("admin.edit", "Редактирай")}
                    </Button>
                    <Button variant="ghost" loading={busy} onClick={() => toggleActive(p)}>
                      {p.active ? t("admin.productDeactivate", "Спри") : t("admin.productActivate", "Пусни")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {notice ? <p className="text-center text-sm text-loss">{notice}</p> : null}
    </div>
  );
}
