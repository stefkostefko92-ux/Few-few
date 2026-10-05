// frontend/src/pages/GamePage.jsx
// v50 — Server Season: таблото на играта за сървър. Четири раздела: обзор +
// настройки, роли за ниво, магазин, класация. Лимитите (роли, артикули) идват
// от backend-а по tier; при достигнат лимит формата казва защо, не мълчи.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gamepad2, Trophy, ShoppingBag, Layers, Save, Plus, Trash2, Pencil, Sparkles, Target } from "lucide-react";
import { useT } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";
import { PremiumBadge } from "../components/PremiumBadge";
import DiscordChannelSelect, { DiscordRoleSelect } from "../components/DiscordPicker";
import {
  getGame, updateGameSettings, getGameShop, createGameShopItem, updateGameShopItem, deleteGameShopItem,
  getGameLeaderboard, getGamePurchases, getGameCompanions, getGameQuests, createGameQuest, cancelGameQuest, getGameMinigames,
} from "../api";

const SNOWFLAKE = /^\d{17,20}$/;
const errMsg = (err, fallback) => {
  const e = err?.response?.data?.error;
  if (typeof e === "string") return e;
  if (e?.formErrors?.length) return e.formErrors.join(", ");
  if (e?.fieldErrors) return Object.entries(e.fieldErrors).map(([k, v]) => `${k}: ${v.join(", ")}`).join(" · ");
  return fallback;
};

const TABS = [
  { id: "overview", tKey: "game.tab.overview", icon: Gamepad2 },
  { id: "levels", tKey: "game.tab.levels", icon: Layers },
  { id: "shop", tKey: "game.tab.shop", icon: ShoppingBag },
  { id: "leaderboard", tKey: "game.tab.leaderboard", icon: Trophy },
  { id: "companions", tKey: "game.tab.companions", icon: Sparkles },
  { id: "quests", tKey: "game.tab.quests", icon: Target },
];

export default function GamePage() {
  const { t } = useT();
  const { serverId } = useParams();
  const [tab, setTab] = useState("overview");
  const { data, isLoading, isError } = useQuery({ queryKey: ["game", serverId], queryFn: () => getGame(serverId) });

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="cs-heading flex items-center gap-2"><Gamepad2 className="w-6 h-6 text-cs-cyan" aria-hidden="true" /> {t("game.title")}</h1>
        <p className="text-sm text-cs-muted mt-1">{t("game.subtitle")}</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("game.title")}>
        {TABS.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
            className={`px-3 py-2 text-sm rounded border transition-colors flex items-center gap-2 ${tab === x.id ? "border-cs-cyan text-cs-cyan" : "border-cs-border text-cs-muted hover:text-cs-text"}`}>
            <x.icon className="w-4 h-4" aria-hidden="true" /> {t(x.tKey)}
          </button>
        ))}
      </div>
      {isLoading && <p className="text-cs-muted">{t("game.loading")}</p>}
      {isError && <p className="text-danger">{t("game.loadFailed")}</p>}
      {data && tab === "overview" && <OverviewTab data={data} />}
      {data && tab === "levels" && <LevelsTab data={data} />}
      {data && tab === "shop" && <ShopTab data={data} />}
      {data && tab === "leaderboard" && <LeaderboardTab />}
      {data && tab === "companions" && <CompanionsTab data={data} />}
      {data && tab === "quests" && <QuestsTab data={data} />}
    </div>
  );
}

// ─── Обзор + настройки ────────────────────────────────────────────────────────
function useSettingsForm(data) {
  const s = data.settings;
  const [form, setForm] = useState(() => ({
    enabled: s.enabled, xpPerMessage: s.xpPerMessage, messageCooldownSec: s.messageCooldownSec, xpPerVoiceMinute: s.xpPerVoiceMinute,
    announceChannelId: s.announceChannelId || "", levelUpMessage: s.levelUpMessage, dailySparks: s.dailySparks,
    spawnEnabled: s.spawnEnabled, spawnChannelIds: [...(s.spawnChannelIds || [])],
    countingChannelId: s.countingChannelId || "", triviaChannelId: s.triviaChannelId || "", triviaSchedule: s.triviaSchedule || "",
    questChannelId: s.questChannelId || "", questEnabled: s.questEnabled,
  }));
  // Формата се попълва веднъж от заредените данни; refetch не бие незапазени промени.
  return [form, setForm];
}

function OverviewTab({ data }) {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { serverId } = useParams();
  const [form, setForm] = useSettingsForm(data);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const save = useMutation({
    mutationFn: () => updateGameSettings(serverId, {
      enabled: !!form.enabled,
      xpPerMessage: Number(form.xpPerMessage), messageCooldownSec: Number(form.messageCooldownSec), xpPerVoiceMinute: Number(form.xpPerVoiceMinute),
      announceChannelId: form.announceChannelId.trim() || null, levelUpMessage: !!form.levelUpMessage, dailySparks: Number(form.dailySparks),
      spawnEnabled: !!form.spawnEnabled,
      spawnChannelIds: form.spawnChannelIds.filter((x) => SNOWFLAKE.test(x)),
      countingChannelId: form.countingChannelId.trim() || null, triviaChannelId: form.triviaChannelId.trim() || null,
      triviaSchedule: form.triviaSchedule || null, questChannelId: form.questChannelId.trim() || null, questEnabled: !!form.questEnabled,
    }),
    onSuccess: () => { toast.success(t("game.saved")); qc.invalidateQueries({ queryKey: ["game", serverId] }); },
    onError: (err) => toast.error(errMsg(err, t("game.saveFailed"))),
  });
  const st = data.stats;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label={t("game.stats.players")} value={st.players} />
        <Stat label={t("game.stats.totalXp")} value={st.totalXp} />
        <Stat label={t("game.stats.messages")} value={st.totalMessages} />
        <Stat label={t("game.stats.voice")} value={st.totalVoiceMinutes} />
        <Stat label={t("game.stats.sparks")} value={st.sparksInCirculation} />
      </div>

      <form className="cs-card space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="accent-cs-cyan w-5 h-5" checked={!!form.enabled} onChange={set("enabled")} />
          <span className="font-semibold text-cs-text">{t("game.enabled")}</span>
        </label>
        <p className="text-xs text-cs-dim">{t("game.enabledHint")}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label={t("game.xpPerMessage")}><input className="cs-input" type="number" min={1} max={100} value={form.xpPerMessage} onChange={set("xpPerMessage")} /></Field>
          <Field label={t("game.messageCooldownSec")}><input className="cs-input" type="number" min={10} max={3600} value={form.messageCooldownSec} onChange={set("messageCooldownSec")} /></Field>
          <Field label={t("game.xpPerVoiceMinute")}><input className="cs-input" type="number" min={0} max={50} value={form.xpPerVoiceMinute} onChange={set("xpPerVoiceMinute")} /></Field>
          <Field label={t("game.dailySparks")}><input className="cs-input" type="number" min={1} max={1000} value={form.dailySparks} onChange={set("dailySparks")} /></Field>
          <Field label={t("game.announceChannelId")} hint={t("game.announceHint")}><DiscordChannelSelect kind="text" value={form.announceChannelId} onChange={(v) => setForm((f) => ({ ...f, announceChannelId: v || "" }))} /></Field>
          <label className="flex items-center gap-3 mt-6">
            <input type="checkbox" className="accent-cs-cyan w-5 h-5" checked={!!form.levelUpMessage} onChange={set("levelUpMessage")} />
            <span className="text-sm text-cs-text">{t("game.levelUpMessage")}</span>
          </label>
        </div>

        <h2 className="text-lg font-semibold text-cs-text pt-2">{t("game.minigames.title")}</h2>
        <p className="text-xs text-cs-dim">{t("game.minigames.hint")}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex items-center gap-3">
            <input type="checkbox" className="accent-cs-cyan w-5 h-5" checked={!!form.spawnEnabled} onChange={set("spawnEnabled")} />
            <span className="text-sm text-cs-text">{t("game.spawn.enabled")}</span>
          </label>
          <Field label={t("game.spawn.channels")} hint={t("game.spawn.channelsHint")}>
            <DiscordChannelSelect kind="text" value="" onChange={(v) => { if (v && !form.spawnChannelIds.includes(v)) setForm((f) => ({ ...f, spawnChannelIds: [...f.spawnChannelIds, v] })); }} />
            {form.spawnChannelIds.length > 0 && (
              <ul className="flex flex-wrap gap-2 mt-2">
                {form.spawnChannelIds.map((id) => (
                  <li key={id} className="cs-badge flex items-center gap-1 font-mono">{id}
                    <button type="button" aria-label={t("game.levels.remove")} onClick={() => setForm((f) => ({ ...f, spawnChannelIds: f.spawnChannelIds.filter((x) => x !== id) }))}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </Field>
          <Field label={t("game.counting.channel")}><DiscordChannelSelect kind="text" value={form.countingChannelId} onChange={(v) => setForm((f) => ({ ...f, countingChannelId: v || "" }))} /></Field>
          <Field label={t("game.trivia.channel")}><DiscordChannelSelect kind="text" value={form.triviaChannelId} onChange={(v) => setForm((f) => ({ ...f, triviaChannelId: v || "" }))} /></Field>
          <Field label={t("game.trivia.schedule")}>
            <select className="cs-select" value={form.triviaSchedule} onChange={set("triviaSchedule")}>
              <option value="">{t("game.trivia.off")}</option>
              {/* Дневната trivia е Premium (backend връща 403) — заключена предварително,
                  вместо да пусне заявка и да покаже грешка (одит 25.09.2026). */}
              <option value="daily" disabled={!data.isPremium}>{t("game.trivia.daily")}{data.isPremium ? "" : " · Premium"}</option>
              <option value="weekly">{t("game.trivia.weekly")}</option>
            </select>
          </Field>
          <Field label={t("game.quest.channel")}><DiscordChannelSelect kind="text" value={form.questChannelId} onChange={(v) => setForm((f) => ({ ...f, questChannelId: v || "" }))} /></Field>
          <label className="flex items-center gap-3">
            <input type="checkbox" className="accent-cs-cyan w-5 h-5" checked={!!form.questEnabled} onChange={set("questEnabled")} />
            <span className="text-sm text-cs-text">{t("game.quest.enabled")}</span>
          </label>
        </div>
        <div className="flex justify-end">
          <button type="submit" className="cs-btn-primary" disabled={save.isPending}><Save className="w-4 h-4" aria-hidden="true" /> {t("game.save")}</button>
        </div>
      </form>

      {st.top?.length > 0 && (
        <div className="cs-card">
          <h2 className="text-lg font-semibold text-cs-text mb-3">{t("game.stats.top")}</h2>
          <ol className="space-y-1 text-sm">
            {st.top.map((r, i) => (
              <li key={r.userId} className="flex items-center gap-3">
                <span className="font-mono text-cs-dim w-6">{i + 1}.</span>
                <span className="font-mono text-cs-text">{r.userId}</span>
                <span className="text-cs-muted">{t("game.lb.level")} {r.level} · {r.xp} XP · ✨ {r.sparks} · 🔥 {r.streak}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="cs-card !p-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-cs-dim">{label}</div>
      <div className="text-xl font-bold text-cs-text">{Number(value || 0).toLocaleString()}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="cs-label">{label}</span>
      {children}
      {hint && <span className="block text-xs text-cs-dim mt-1">{hint}</span>}
    </label>
  );
}

// ─── Роли за ниво ─────────────────────────────────────────────────────────────
function LevelsTab({ data }) {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { serverId } = useParams();
  const [rows, setRows] = useState(() => (data.settings.levelRoles || []).map((r) => ({ level: r.level, roleId: r.roleId })));
  const limit = data.limits.levelRoles;
  // Непълен ред (без роля или с ниво < 1) се изхвърляше тихо и таблото казваше
  // „Запазено“ — ролята просто изчезваше (одит 26.09.2026). Сега записът спира.
  const rowOk = (r) => Number(r.level) >= 1 && SNOWFLAKE.test(String(r.roleId).trim());
  const invalidRows = rows.filter((r) => !rowOk(r));
  const save = useMutation({
    mutationFn: () => updateGameSettings(serverId, {
      levelRoles: rows.filter(rowOk).map((r) => ({ level: Number(r.level), roleId: String(r.roleId).trim() })),
    }),
    onSuccess: () => { toast.success(t("game.saved")); qc.invalidateQueries({ queryKey: ["game", serverId] }); },
    onError: (err) => toast.error(errMsg(err, t("game.saveFailed"))),
  });
  return (
    <div className="space-y-4">
      <div className="cs-card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-cs-text">{t("game.levels.title")}</h2>
          <span className="cs-badge">{rows.length} / {limit}{!data.isPremium && <PremiumBadge small />}</span>
        </div>
        <p className="text-xs text-cs-dim mt-1">{t("game.levels.hint")}</p>
        <div className="mt-4 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[6rem_1fr_auto] gap-2 items-center">
              <input className="cs-input" type="number" min={1} max={200} aria-label={t("game.levels.level")} value={r.level} onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, level: e.target.value } : x))} />
              <DiscordRoleSelect value={r.roleId} onChange={(v) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, roleId: v || "" } : x))} />
              <button type="button" className="cs-btn-ghost" aria-label={t("game.levels.remove")} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" className="cs-btn-secondary" disabled={rows.length >= limit} onClick={() => setRows((rs) => [...rs, { level: (rs.at(-1)?.level ? Number(rs.at(-1).level) + 5 : 5), roleId: "" }])}><Plus className="w-4 h-4" aria-hidden="true" /> {t("game.levels.add")}</button>
          <button type="button" className="cs-btn-primary" disabled={save.isPending}
            onClick={() => (invalidRows.length ? toast.error(t("game.levels.invalidRows")) : save.mutate())}><Save className="w-4 h-4" aria-hidden="true" /> {t("game.save")}</button>
        </div>
        {rows.length >= limit && <p className="text-xs text-warning mt-2">{t("game.levels.limit", { n: limit })}</p>}
      </div>
      <div className="cs-card">
        <h3 className="font-semibold text-cs-text mb-2">{t("game.levels.table")}</h3>
        <table className="cs-table w-full text-sm">
          <thead><tr><th>{t("game.levels.level")}</th><th>{t("game.levels.xpNeeded")}</th></tr></thead>
          <tbody>{data.levelTable.map((l) => <tr key={l.level}><td>{l.level}</td><td className="font-mono">{l.xp.toLocaleString()}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Магазин ─────────────────────────────────────────────────────────────────
const emptyItem = () => ({ name: "", description: "", priceSparks: 100, type: "ROLE", roleId: "", durationDays: "", stock: "", enabled: true, sortOrder: 0 });

function ShopTab({ data }) {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { serverId } = useParams();
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [form, setForm] = useState(emptyItem());
  // Без isLoading/isError магазинът казваше „няма артикули“, докато зарежда
  // или при грешка — и бутонът „Нов“ пускаше над лимита (одит 26.09.2026).
  const { data: items = [], isLoading: shopLoading, isError: shopError } = useQuery({ queryKey: ["game-shop", serverId], queryFn: () => getGameShop(serverId) });
  const { data: purchases = [] } = useQuery({ queryKey: ["game-purchases", serverId], queryFn: () => getGamePurchases(serverId) });
  const limit = data.limits.shopItems;
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["game-shop", serverId] }); qc.invalidateQueries({ queryKey: ["game", serverId] }); };
  const payload = () => ({
    name: form.name.trim(), description: form.description.trim() || null, priceSparks: Number(form.priceSparks), type: form.type,
    roleId: form.type === "ROLE" ? form.roleId.trim() : null,
    durationDays: form.durationDays === "" ? null : Number(form.durationDays),
    stock: form.stock === "" ? null : Number(form.stock),
    enabled: !!form.enabled, sortOrder: Number(form.sortOrder) || 0,
  });
  const createM = useMutation({ mutationFn: () => createGameShopItem(serverId, payload()), onSuccess: () => { invalidate(); setEditing(null); toast.success(t("game.saved")); }, onError: (err) => toast.error(errMsg(err, t("game.saveFailed"))) });
  const updateM = useMutation({ mutationFn: () => updateGameShopItem(serverId, editing, payload()), onSuccess: () => { invalidate(); setEditing(null); toast.success(t("game.saved")); }, onError: (err) => toast.error(errMsg(err, t("game.saveFailed"))) });
  const deleteM = useMutation({ mutationFn: (id) => deleteGameShopItem(serverId, id), onSuccess: invalidate, onError: (err) => toast.error(errMsg(err, t("game.saveFailed"))) });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const openEdit = (i) => { setForm({ name: i.name, description: i.description || "", priceSparks: i.priceSparks, type: i.type, roleId: i.roleId || "", durationDays: i.durationDays ?? "", stock: i.stock ?? "", enabled: i.enabled, sortOrder: i.sortOrder }); setEditing(i.id); };

  return (
    <div className="space-y-4">
      <div className="cs-card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-cs-text">{t("game.shop.title")}</h2>
          <div className="flex items-center gap-2">
            <span className="cs-badge">{items.length} / {limit}{!data.isPremium && <PremiumBadge small />}</span>
            <button type="button" className="cs-btn-primary" disabled={shopLoading || shopError || items.length >= limit} onClick={() => { setForm(emptyItem()); setEditing("new"); }}><Plus className="w-4 h-4" aria-hidden="true" /> {t("game.shop.new")}</button>
          </div>
        </div>
        <p className="text-xs text-cs-dim mt-1">{t("game.shop.hint")}</p>
        {items.length >= limit && <p className="text-xs text-warning mt-2">{t("game.shop.limit", { n: limit })}</p>}
        {shopLoading && <p className="text-sm text-cs-muted mt-4" role="status">{t("game.loading")}</p>}
        {shopError && <p className="text-sm text-danger mt-4" role="alert">{t("common.operationFailed")}</p>}
        {!shopLoading && !shopError && items.length === 0 && <p className="text-sm text-cs-muted mt-4">{t("game.shop.empty")}</p>}
        <ul className="mt-4 divide-y divide-cs-border/50">
          {items.map((i) => (
            <li key={i.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-semibold text-cs-text flex items-center gap-2 flex-wrap">
                  {i.name} <span className="cs-badge">✨ {i.priceSparks}</span>
                  <span className="cs-badge">{i.type === "ROLE" ? t("game.shop.typeRole") : t("game.shop.typeCustom")}</span>
                  {!i.enabled && <span className="cs-badge">{t("game.shop.disabled")}</span>}
                </div>
                <div className="text-xs text-cs-dim mt-1 break-all">
                  {i.description}{i.roleId ? ` · role ${i.roleId}` : ""}{i.durationDays ? ` · ${i.durationDays}d` : ""}{i.stock != null ? ` · ${t("game.shop.sold")} ${i.sold}/${i.stock}` : ` · ${t("game.shop.sold")} ${i.sold}`}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="cs-btn-ghost" aria-label={t("game.shop.update")} onClick={() => openEdit(i)}><Pencil className="w-4 h-4" aria-hidden="true" /></button>
                <button type="button" className="cs-btn-ghost text-danger" aria-label={t("game.shop.delete")} onClick={() => { if (window.confirm(t("game.shop.confirmDelete"))) deleteM.mutate(i.id); }}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {editing && (
        <form className="cs-card space-y-4" onSubmit={(e) => { e.preventDefault(); (editing === "new" ? createM : updateM).mutate(); }}>
          <h3 className="font-semibold text-cs-text">{editing === "new" ? t("game.shop.new") : t("game.shop.update")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={t("game.shop.name")}><input className="cs-input" required maxLength={80} value={form.name} onChange={set("name")} /></Field>
            <Field label={t("game.shop.price")}><input className="cs-input" type="number" min={1} required value={form.priceSparks} onChange={set("priceSparks")} /></Field>
            <Field label={t("game.shop.description")}><input className="cs-input" maxLength={300} value={form.description} onChange={set("description")} /></Field>
            <Field label={t("game.shop.type")}>
              <select className="cs-select" value={form.type} onChange={set("type")}>
                <option value="ROLE">{t("game.shop.typeRole")}</option>
                <option value="CUSTOM">{t("game.shop.typeCustom")}</option>
              </select>
            </Field>
            {form.type === "ROLE" && <Field label={t("game.shop.roleId")}><DiscordRoleSelect value={form.roleId} onChange={(v) => setForm((f) => ({ ...f, roleId: v || "" }))} /></Field>}
            <Field label={t("game.shop.durationDays")}><input className="cs-input" type="number" min={1} max={365} value={form.durationDays} onChange={set("durationDays")} /></Field>
            <Field label={t("game.shop.stock")}><input className="cs-input" type="number" min={1} value={form.stock} onChange={set("stock")} /></Field>
            <label className="flex items-center gap-3 mt-6">
              <input type="checkbox" className="accent-cs-cyan w-5 h-5" checked={!!form.enabled} onChange={set("enabled")} />
              <span className="text-sm text-cs-text">{t("game.shop.enabled")}</span>
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="cs-btn-secondary" onClick={() => setEditing(null)}>{t("common.cancel")}</button>
            <button type="submit" className="cs-btn-primary" disabled={createM.isPending || updateM.isPending}>{editing === "new" ? t("game.shop.create") : t("game.shop.update")}</button>
          </div>
        </form>
      )}

      <div className="cs-card">
        <h3 className="font-semibold text-cs-text mb-2">{t("game.purchases.title")}</h3>
        {purchases.length === 0 ? <p className="text-sm text-cs-muted">{t("game.purchases.empty")}</p> : (
          <div className="overflow-x-auto"><table className="cs-table w-full text-sm min-w-[36rem]">
            <thead><tr><th>{t("game.lb.user")}</th><th>{t("game.shop.name")}</th><th>✨</th><th>{t("game.purchases.expires")}</th></tr></thead>
            <tbody>{purchases.map((p) => (
              <tr key={p.id}><td className="font-mono">{p.userId}</td><td>{p.item?.name}</td><td>{p.priceSparks}</td><td className="font-mono text-xs">{p.revokedAt ? t("game.purchases.revoked") : (p.expiresAt ? String(p.expiresAt).slice(0, 10) : "—")}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

// ─── Класация ────────────────────────────────────────────────────────────────
function LeaderboardTab() {
  const { t } = useT();
  const { serverId } = useParams();
  const [by, setBy] = useState("xp");
  const { data, isLoading, isError } = useQuery({ queryKey: ["game-lb", serverId, by], queryFn: () => getGameLeaderboard(serverId, by) });
  const rows = data?.rows || [];
  return (
    <div className="cs-card">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-lg font-semibold text-cs-text">{t("game.lb.title")}</h2>
        <label className="flex items-center gap-2 text-sm text-cs-muted">{t("game.lb.by")}
          <select className="cs-select" value={by} onChange={(e) => setBy(e.target.value)} aria-label={t("game.lb.by")}>
            <option value="xp">{t("game.lb.xp")}</option>
            <option value="seasonXp">{t("game.lb.seasonXp")}</option>
            <option value="sparks">{t("game.lb.sparks")}</option>
            <option value="streak">{t("game.lb.streak")}</option>
          </select>
        </label>
      </div>
      {isLoading ? <p className="text-sm text-cs-muted" role="status">{t("game.loading")}</p>
        : isError ? <p className="text-sm text-danger" role="alert">{t("common.operationFailed")}</p>
        : rows.length === 0 ? <p className="text-sm text-cs-muted">{t("game.lb.empty")}</p> : (
        <div className="overflow-x-auto"><table className="cs-table w-full text-sm min-w-[40rem]">
          <thead><tr><th>#</th><th>{t("game.lb.user")}</th><th>{t("game.lb.level")}</th><th>XP</th><th>{t("game.lb.seasonXp")}</th><th>✨</th><th>🔥</th><th>{t("game.lb.messages")}</th><th>{t("game.lb.voice")}</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.userId}><td>{i + 1}</td><td className="font-mono">{r.userId}</td><td>{r.level}</td><td>{r.xp}</td><td>{r.seasonXp}</td><td>{r.sparks}</td><td>{r.streak}</td><td>{r.messages}</td><td>{r.voiceMinutes}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

// ─── Спътници: каталог + кой какво е уловил ─────────────────────────────────
const RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];
function CompanionsTab({ data }) {
  const { t } = useT();
  const { serverId } = useParams();
  const { data: c, isLoading } = useQuery({ queryKey: ["game-companions", serverId], queryFn: () => getGameCompanions(serverId) });
  if (isLoading || !c) return <p className="text-cs-muted">{t("game.loading")}</p>;
  const groups = RARITY_ORDER.map((r) => ({ r, items: c.catalog.filter((x) => x.rarity === r) })).filter((g) => g.items.length);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={t("game.companions.catalogSize")} value={c.catalog.length} />
        <Stat label={t("game.companions.spawns")} value={c.spawns} />
        <Stat label={t("game.companions.caught")} value={c.caught} />
        <div className="cs-card !p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-cs-dim">{t("game.companions.season")}</div>
          <div className="text-sm font-bold text-cs-text">{c.season.name}</div>
          <div className="text-xs text-cs-dim">{String(c.season.startsAt).slice(0, 10)} → {String(c.season.endsAt).slice(0, 10)}</div>
        </div>
      </div>
      <p className="text-xs text-cs-dim">{t("game.companions.hint", { slots: data.limits.companionSlots })}{!data.isPremium && <> <PremiumBadge small /></>}</p>
      {groups.map((g) => (
        <section key={g.r} className="cs-card">
          <h2 className="text-lg font-semibold text-cs-text mb-3 flex items-center gap-2">{g.items[0].rarityEmoji} {t(`game.companions.rarity.${g.r}`)} <span className="cs-badge">{g.items.length}</span></h2>
          <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {g.items.map((x) => (
              <li key={x.id} className="text-center">
                <img src={x.imageUrl.replace(/^https?:\/\/[^/]+/, "")} alt={x.name} width={96} height={96} loading="lazy" className="w-24 h-24 mx-auto rounded" />
                <div className="text-sm text-cs-text mt-1">{x.name}{x.seasonId ? " ✦" : ""}</div>
                <div className="text-[10px] font-mono text-cs-dim">{t("game.companions.caughtN", { n: x.caught })}</div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {c.collectors.length > 0 && (
        <section className="cs-card">
          <h2 className="text-lg font-semibold text-cs-text mb-2">{t("game.companions.collectors")}</h2>
          <ol className="text-sm space-y-1">{c.collectors.map((x, i) => <li key={x.userId}><span className="font-mono text-cs-dim w-6 inline-block">{i + 1}.</span> <span className="font-mono">{x.userId}</span> <span className="text-cs-muted">· {x.count}</span></li>)}</ol>
        </section>
      )}
    </div>
  );
}

// ─── Етап 3: куестове + мини-игри (Counting, trivia, парти команди) ──────────
function QuestsTab({ data }) {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { serverId } = useParams();
  const { data: q, isLoading } = useQuery({ queryKey: ["game-quests", serverId], queryFn: () => getGameQuests(serverId) });
  const { data: mg } = useQuery({ queryKey: ["game-minigames", serverId], queryFn: () => getGameMinigames(serverId) });
  const [form, setForm] = useState({ type: "MESSAGES", target: 1000, rewardSparks: 100, days: 7 });
  const [open, setOpen] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["game-quests", serverId] });
  const create = useMutation({
    mutationFn: () => createGameQuest(serverId, { type: form.type, target: Number(form.target), rewardSparks: Number(form.rewardSparks), days: Number(form.days) }),
    onSuccess: () => { toast.success(t("game.saved")); setOpen(false); refresh(); },
    onError: (err) => toast.error(err?.response?.data?.code === "LIMIT_REACHED" ? t("game.quests.limit", { n: err.response.data.limit }) : errMsg(err, t("game.saveFailed"))),
  });
  const cancel = useMutation({
    mutationFn: (id) => cancelGameQuest(serverId, id),
    onSuccess: () => { toast.success(t("game.saved")); refresh(); },
    onError: (err) => toast.error(errMsg(err, t("game.saveFailed"))),
  });
  if (isLoading || !q) return <p className="text-cs-muted">{t("game.loading")}</p>;
  const typeMeta = (k) => q.types.find((x) => x.key === k) || {};
  const atLimit = q.active.length >= data.limits.activeQuests;
  const date = (d) => new Date(d).toLocaleDateString();
  return (
    <div className="space-y-6">
      <section className="cs-card space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-cs-text">{t("game.quests.title")}</h2>
          <button type="button" className="cs-btn-primary" onClick={() => setOpen((v) => !v)} disabled={atLimit}><Plus className="w-4 h-4" aria-hidden="true" /> {t("game.quests.new")}</button>
        </div>
        <p className="text-xs text-cs-dim">{t("game.quests.hint", { n: data.limits.activeQuests })}{!data.isPremium && <> <PremiumBadge small /></>}</p>
        {atLimit && <p className="text-xs text-warning">{t("game.quests.limit", { n: data.limits.activeQuests })}</p>}
        {!data.settings.questChannelId && <p className="text-xs text-warning">{t("game.quests.needChannel")}</p>}
        {open && !atLimit && (
          <form className="grid grid-cols-1 md:grid-cols-4 gap-3 border-t border-cs-border pt-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <Field label={t("game.quests.type")}>
              <select className="cs-select" value={form.type} onChange={(e) => { const k = e.target.value; setForm((f) => ({ ...f, type: k, rewardSparks: typeMeta(k).reward || f.rewardSparks })); }}>
                {q.types.map((x) => <option key={x.key} value={x.key}>{x.emoji} {t(`game.quests.type.${x.key}`)}</option>)}
              </select>
            </Field>
            <Field label={t("game.quests.target")}><input className="cs-input" type="number" min={1} max={1000000} value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} required /></Field>
            <Field label={t("game.quests.reward")}><input className="cs-input" type="number" min={1} max={10000} value={form.rewardSparks} onChange={(e) => setForm((f) => ({ ...f, rewardSparks: e.target.value }))} required /></Field>
            <Field label={t("game.quests.days")}><input className="cs-input" type="number" min={1} max={30} value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} required /></Field>
            <div className="md:col-span-4 flex justify-end"><button type="submit" className="cs-btn-primary" disabled={create.isPending}>{t("game.quests.create")}</button></div>
          </form>
        )}
        <h3 className="text-sm font-semibold text-cs-text pt-2">{t("game.quests.active")}</h3>
        {q.active.length === 0 ? <p className="text-sm text-cs-muted">{t("game.quests.empty")}</p> : (
          <ul className="space-y-3">
            {q.active.map((x) => (
              <li key={x.id} className="border border-cs-border rounded p-3 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="font-semibold text-cs-text">{x.emoji} {t(`game.quests.type.${x.type}`)} · {x.target.toLocaleString()}</div>
                  <button type="button" className="cs-btn-danger text-xs" onClick={() => { if (window.confirm(t("game.quests.confirmCancel"))) cancel.mutate(x.id); }} disabled={cancel.isPending}><Trash2 className="w-3 h-3" aria-hidden="true" /> {t("game.quests.cancel")}</button>
                </div>
                <div className="font-mono text-xs text-cs-muted break-all">{x.bar} · {x.progress.toLocaleString()} / {x.target.toLocaleString()}</div>
                <div className="text-xs text-cs-dim">{t("game.quests.ends")}: {date(x.endsAt)} · ✨ {x.rewardSparks} · {t("game.quests.contributors")}: {x.contributors.map((c) => `${c.userId} (${c.amount})`).join(", ") || "—"}</div>
              </li>
            ))}
          </ul>
        )}
        {q.history.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-cs-text pt-2">{t("game.quests.history")}</h3>
            <div className="overflow-x-auto"><table className="cs-table w-full text-sm min-w-[36rem]">
              <thead><tr><th>{t("game.quests.type")}</th><th>{t("game.quests.target")}</th><th>{t("game.quests.ends")}</th><th>{t("game.quests.contributors")}</th><th></th></tr></thead>
              <tbody>{q.history.map((x) => (
                <tr key={x.id}><td>{x.emoji} {t(`game.quests.type.${x.type}`)}</td><td>{x.progress.toLocaleString()} / {x.target.toLocaleString()}</td><td>{date(x.endsAt)}</td><td>{x.contributors}</td><td><span className="cs-badge">{t(`game.quests.status.${x.status}`)}</span></td></tr>
              ))}</tbody>
            </table></div>
          </>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="cs-card space-y-2">
          <h2 className="text-lg font-semibold text-cs-text">{t("game.counting.title")}</h2>
          <p className="text-xs text-cs-dim">{t("game.counting.hint")}</p>
          {mg?.counting?.channelId ? (
            <div className="grid grid-cols-2 gap-3">
              <Stat label={t("game.counting.current")} value={mg.counting.current} />
              <Stat label={t("game.counting.high")} value={mg.counting.high} />
            </div>
          ) : <p className="text-sm text-cs-muted">{t("game.counting.off")}</p>}
        </section>
        <section className="cs-card space-y-2">
          <h2 className="text-lg font-semibold text-cs-text">{t("game.party.title")}</h2>
          <p className="text-xs text-cs-dim">{t("game.party.hint")}{!data.isPremium && <> <PremiumBadge small /></>}</p>
        </section>
      </div>

      <section className="cs-card space-y-3">
        <h2 className="text-lg font-semibold text-cs-text">{t("game.triviaStats.title")}</h2>
        <p className="text-xs text-cs-dim">{t("game.triviaStats.hint")}{!data.isPremium && <> <PremiumBadge small /> {t("game.trivia.dailyPremium")}</>}</p>
        {mg?.trivia && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label={t("game.triviaStats.rounds")} value={mg.trivia.rounds} />
              <div className="cs-card !p-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-cs-dim">{t("game.trivia.schedule")}</div>
                <div className="text-sm font-bold text-cs-text">{mg.trivia.schedule ? t(`game.trivia.${mg.trivia.schedule}`) : t("game.trivia.off")}</div>
              </div>
            </div>
            {mg.trivia.winners.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-cs-text mb-1">{t("game.triviaStats.winners")}</h3>
                <ol className="text-sm space-y-1">{mg.trivia.winners.map((w, i) => <li key={w.userId}><span className="font-mono text-cs-dim w-6 inline-block">{i + 1}.</span> <span className="font-mono">{w.userId}</span> <span className="text-cs-muted">· 🏆 {w.wins}</span></li>)}</ol>
              </div>
            )}
            {mg.trivia.recent.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-cs-text mb-1">{t("game.triviaStats.recent")}</h3>
                <ul className="text-sm space-y-1">{mg.trivia.recent.map((r) => (
                  <li key={r.id} className="flex flex-wrap gap-2 items-baseline"><span className="cs-badge">{t(`game.triviaStats.source.${r.source}`)}</span> <span className="text-cs-text">{r.question}</span> <span className="text-xs text-cs-dim">· {r.winnerId ? <span className="font-mono">{r.winnerId}</span> : t("game.triviaStats.noWinner")} · {r.answers} {t("game.triviaStats.answers")}</span></li>
                ))}</ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
