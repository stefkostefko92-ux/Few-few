import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ACHIEVEMENT_DEFS, COSMETICS, GAME_KEYS, ROLES } from "@aso/shared";
import { Badge, Button, Field, cn } from "../../ui";
import { adminApi } from "./adminApi";
import { ConfirmButton } from "./ConfirmButton";
import { errorMessage, useLoad } from "./load";
import i18next from "i18next";
import type { GameKey } from "@aso/shared";
import { gameTitle as sharedGameTitle } from "../lobby/games";

const selectCls = "rounded-card border border-brass-400/20 bg-felt-900/60 px-2 py-2 text-sm text-ink-100";
// Преводимото име на играта (EN/IT интерфейсът не показва българските заглавия).
const gameTitle = (key: string): string => sharedGameTitle(i18next.t, key as GameKey);
const rank = (r: string | undefined): number => (r ? ROLES.indexOf(r as (typeof ROLES)[number]) : -1);

/**
 * Може ли актьорът да мутира този играч — огледало на сървърната защита
 * (ADMIN+, не себе си, само по-нисък ранг). Сървърът остава авторитетен.
 */
export function canMutateUser(meRole: string | undefined, meId: string | undefined, target: { id: string; role: string }) {
  if (meRole !== "ADMIN" && meRole !== "OWNER") return false;
  if (meId === target.id) return false;
  return rank(target.role) < rank(meRole);
}

/** Сгъваема секция, която монтира (и зарежда) съдържанието си едва при отваряне. */
function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="border-t border-brass-400/10 pt-3"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-xs uppercase tracking-wide text-ink-muted hover:text-ink-100">
        {title}
      </summary>
      {open ? <div className="mt-2">{children}</div> : null}
    </details>
  );
}

/** Общо състояние на действие: зает ключ + съобщение (успех/грешка от API). */
function useAction(reload: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  async function run(key: string, fn: () => Promise<unknown>, okText: string): Promise<boolean> {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "ok", text: okText });
      reload();
      return true;
    } catch (e) {
      setMsg({ tone: "err", text: errorMessage(e) });
      return false;
    } finally {
      setBusy(null);
    }
  }
  const view = msg ? (
    <p className={cn("mt-2 text-xs", msg.tone === "ok" ? "text-win" : "text-loss")}>{msg.text}</p>
  ) : null;
  return { busy, run, view };
}

function LoadState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  if (!error) return <p className="text-xs text-ink-muted">{t("common.loading")}</p>;
  return (
    <p className="text-xs text-loss">
      {errorMessage(error)}{" "}
      <button type="button" className="underline" onClick={onRetry}>
        {t("admin.retry", "Опитай пак")}
      </button>
    </p>
  );
}

interface SectionProps {
  userId: string;
  canMutate: boolean;
}

// ── Инвентар ─────────────────────────────────────────────────────────────────

function InventorySection({ userId, canMutate }: SectionProps) {
  const { t } = useTranslation();
  const { data, error, reload } = useLoad(() => adminApi.userInventory(userId), [userId]);
  const { busy, run, view } = useAction(reload);
  const [game, setGame] = useState<string>(COSMETICS[0]?.game ?? "");
  const [cosmeticId, setCosmeticId] = useState("");

  if (!data) return <LoadState error={error} onRetry={reload} />;
  const owned = new Set(data.items.map((i) => i.cosmeticId));
  const options = COSMETICS.filter((c) => c.game === game && !owned.has(c.id));
  const games = [...new Set(COSMETICS.map((c) => c.game))];

  return (
    <div className="flex flex-col gap-2">
      {data.items.length === 0 ? (
        <p className="text-xs text-ink-muted">{t("admin.invEmpty", "Няма козметики.")}</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-ink-300">
          {data.items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {i.name ?? i.cosmeticId}
                <span className="text-ink-muted"> · {i.game ? gameTitle(i.game) : "—"} · {i.type ?? "—"}</span>
                {i.equipped ? <Badge tone="brass" className="ml-2">{t("admin.invEquipped", "Екипиран")}</Badge> : null}
              </span>
              {canMutate ? (
                <ConfirmButton
                  label={t("admin.revoke", "Отнеми")}
                  busy={busy === i.id}
                  onConfirm={() => void run(i.id, () => adminApi.revokeCosmetic(userId, i.id), t("admin.saved"))}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canMutate ? (
        <div className="flex flex-wrap items-end gap-2">
          <select
            aria-label={t("admin.matchGame", "Игра")}
            className={selectCls}
            value={game}
            onChange={(e) => {
              setGame(e.target.value);
              setCosmeticId("");
            }}
          >
            {games.map((g) => (
              <option key={g} value={g}>{gameTitle(g)}</option>
            ))}
          </select>
          <select
            aria-label={t("admin.invCosmetic", "Козметика")}
            className={cn(selectCls, "min-w-40 flex-1")}
            value={cosmeticId}
            onChange={(e) => setCosmeticId(e.target.value)}
          >
            <option value="">{t("admin.invPick", "Избери козметика…")}</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.type}
                {c.vipExclusive ? " · VIP" : ""}
              </option>
            ))}
          </select>
          <Button
            variant="felt"
            loading={busy === "grant"}
            disabled={!cosmeticId}
            onClick={() =>
              void run("grant", () => adminApi.grantCosmetic(userId, cosmeticId), t("admin.granted")).then(
                (ok) => ok && setCosmeticId(""),
              )
            }
          >
            {t("admin.grant", "Дари")}
          </Button>
        </div>
      ) : null}
      {view}
    </div>
  );
}

// ── Постижения ───────────────────────────────────────────────────────────────

function AchievementsSection({ userId, canMutate }: SectionProps) {
  const { t, i18n } = useTranslation();
  const { data, error, reload } = useLoad(() => adminApi.userAchievements(userId), [userId]);
  const { busy, run, view } = useAction(reload);
  const [key, setKey] = useState("");

  if (!data) return <LoadState error={error} onRetry={reload} />;
  const unlocked = new Set(data.items.map((a) => a.key));
  const available = ACHIEVEMENT_DEFS.filter((d) => !unlocked.has(d.key));

  return (
    <div className="flex flex-col gap-2">
      {data.items.length === 0 ? (
        <p className="text-xs text-ink-muted">{t("admin.achEmpty", "Няма отключени постижения.")}</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-ink-300">
          {data.items.map((a) => (
            <li key={a.key} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {a.icon ?? "🏅"} {a.title ?? a.key}
                <span className="text-ink-muted"> · {new Date(a.unlockedAt).toLocaleDateString(i18n.language)}</span>
              </span>
              {canMutate ? (
                <ConfirmButton
                  label={t("admin.revoke", "Отнеми")}
                  busy={busy === a.key}
                  onConfirm={() => void run(a.key, () => adminApi.revokeAchievement(userId, a.key), t("admin.saved"))}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canMutate ? (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <select
              aria-label={t("admin.achPick", "Избери постижение…")}
              className={cn(selectCls, "min-w-40 flex-1")}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            >
              <option value="">{t("admin.achPick", "Избери постижение…")}</option>
              {available.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.icon} {d.title}
                </option>
              ))}
            </select>
            <Button
              variant="felt"
              loading={busy === "grant"}
              disabled={!key}
              onClick={() =>
                void run("grant", () => adminApi.grantAchievement(userId, key), t("admin.granted")).then(
                  (ok) => ok && setKey(""),
                )
              }
            >
              {t("admin.achUnlock", "Отключи")}
            </Button>
          </div>
          <p className="text-xs text-ink-muted">
            {t(
              "admin.achHint",
              "Ръчното отключване не дава наградата в камъни. Отнето постижение, чието условие още е изпълнено, се отключва отново при следващия мач.",
            )}
          </p>
        </>
      ) : null}
      {view}
    </div>
  );
}

// ── Мисии ────────────────────────────────────────────────────────────────────

function QuestsSection({ userId, canMutate }: SectionProps) {
  const { t } = useTranslation();
  const { data, error, reload } = useLoad(() => adminApi.userQuests(userId), [userId]);
  const { busy, run, view } = useAction(reload);

  if (!data) return <LoadState error={error} onRetry={reload} />;
  return (
    <div className="flex flex-col gap-2">
      {data.items.length === 0 ? (
        <p className="text-xs text-ink-muted">{t("admin.questsEmpty", "Няма мисии.")}</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-ink-300">
          {data.items.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {q.key}
                <span className="text-ink-muted"> · {q.period} · </span>
                <span className={q.completedAt ? "text-win" : "tnum"}>
                  {q.progress}/{q.target}
                </span>
              </span>
              {canMutate ? (
                <ConfirmButton
                  label={t("admin.questReset", "Нулирай")}
                  busy={busy === q.id}
                  onConfirm={() => void run(q.id, () => adminApi.resetQuest(userId, q.id), t("admin.saved"))}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canMutate ? (
        <p className="text-xs text-ink-muted">
          {t("admin.questHint", "Нулираната мисия се създава наново с прогрес 0; завършена мисия може да бъде изпълнена и наградена отново.")}
        </p>
      ) : null}
      {view}
    </div>
  );
}

// ── Рейтинги ─────────────────────────────────────────────────────────────────

function RatingsSection({ userId, canMutate }: SectionProps) {
  const { t } = useTranslation();
  const { data, error, reload } = useLoad(() => adminApi.userRatings(userId), [userId]);
  const { busy, run, view } = useAction(reload);
  const [game, setGame] = useState<string>(GAME_KEYS[0]);
  const [mmr, setMmr] = useState("");

  if (!data) return <LoadState error={error} onRetry={reload} />;
  const n = Number(mmr);
  const mmrValid = mmr !== "" && Number.isInteger(n) && n >= 0 && n <= 4000;

  return (
    <div className="flex flex-col gap-2">
      {data.items.length === 0 ? (
        <p className="text-xs text-ink-muted">{t("admin.ratingsEmpty", "Няма рейтинги.")}</p>
      ) : (
        <ul className="space-y-1 text-xs text-ink-300">
          {data.items.map((r) => (
            <li key={r.game} className="flex flex-wrap items-center justify-between gap-2">
              <span>{gameTitle(r.game)}</span>
              <span className="flex items-center gap-2">
                <span className="tnum">
                  MMR {r.mmr} · {r.wins}/{r.games}
                </span>
                {canMutate ? (
                  <ConfirmButton
                    label={t("admin.ratingReset", "Нулирай")}
                    question={t("admin.ratingResetQ", "MMR 1200, 0 игри, 0 победи?")}
                    busy={busy === r.game}
                    onConfirm={() => void run(r.game, () => adminApi.setRating(userId, r.game, { reset: true }), t("admin.saved"))}
                  />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canMutate ? (
        <div className="flex flex-wrap items-end gap-2">
          <select aria-label={t("admin.matchGame", "Игра")} className={selectCls} value={game} onChange={(e) => setGame(e.target.value)}>
            {GAME_KEYS.map((g) => (
              <option key={g} value={g}>{gameTitle(g)}</option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            max={4000}
            aria-label="MMR"
            placeholder="MMR (0–4000)"
            className={cn(selectCls, "w-32")}
            value={mmr}
            onChange={(e) => setMmr(e.target.value)}
          />
          <Button
            variant="felt"
            loading={busy === "set"}
            disabled={!mmrValid}
            onClick={() =>
              void run("set", () => adminApi.setRating(userId, game, { mmr: n }), t("admin.saved")).then(
                (ok) => ok && setMmr(""),
              )
            }
          >
            {t("admin.ratingSet", "Задай MMR")}
          </Button>
        </div>
      ) : null}
      {view}
    </div>
  );
}

// ── Известие ─────────────────────────────────────────────────────────────────

function NotificationSection({ userId, canMutate }: SectionProps) {
  const { t, i18n } = useTranslation();
  const { data, error, reload } = useLoad(() => adminApi.userNotifications(userId), [userId]);
  const { busy, run, view } = useAction(reload);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="flex flex-col gap-2">
      {canMutate ? (
        <div className="flex flex-col gap-2">
          <Field
            label={t("admin.notifTitle", "Заглавие")}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            aria-label={t("admin.notifBody", "Текст")}
            placeholder={t("admin.notifBody", "Текст")}
            className={cn(selectCls, "px-3")}
            rows={3}
            maxLength={1000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div>
            <Button
              variant="felt"
              loading={busy === "send"}
              disabled={!title.trim() || !body.trim()}
              onClick={() =>
                void run(
                  "send",
                  () => adminApi.sendNotification(userId, { title: title.trim(), body: body.trim() }),
                  t("admin.notifSent", "Известието е изпратено."),
                ).then((ok) => {
                  if (ok) {
                    setTitle("");
                    setBody("");
                  }
                })
              }
            >
              {t("admin.send")}
            </Button>
          </div>
        </div>
      ) : null}
      {view}
      <h5 className="mt-1 text-xs text-ink-muted">{t("admin.notifRecent", "Последни известия")}</h5>
      {!data ? (
        <LoadState error={error} onRetry={reload} />
      ) : data.items.length === 0 ? (
        <p className="text-xs text-ink-muted">{t("admin.notifEmpty", "Няма известия.")}</p>
      ) : (
        <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-ink-300">
          {data.items.map((n) => (
            <li key={n.id}>
              <span className="text-brass-300">{n.data?.title ?? n.data?.kind ?? n.type}</span>
              {n.data?.body ? <span> — {n.data.body}</span> : null}
              <span className="text-ink-muted">
                {" "}
                · {new Date(n.createdAt).toLocaleString(i18n.language)}
                {n.readAt ? ` · ${t("admin.notifRead", "прочетено")}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Абонамент ────────────────────────────────────────────────────────────────

function SubscriptionSection({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const { data, error, reload } = useLoad(() => adminApi.userSubscription(userId), [userId]);
  if (!data) return <LoadState error={error} onRetry={reload} />;
  const s = data.subscription;
  if (!s) return <p className="text-xs text-ink-muted">{t("admin.subNone", "Няма абонамент.")}</p>;
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-300">
      <dt className="text-ink-muted">{t("admin.subTier", "Ниво")}</dt>
      <dd><Badge tone="vip">{s.tier}</Badge></dd>
      <dt className="text-ink-muted">{t("admin.status", "Статус")}</dt>
      <dd>{s.status}</dd>
      <dt className="text-ink-muted">{t("admin.subPeriodEnd", "Текущ период до")}</dt>
      <dd>{new Date(s.currentPeriodEnd).toLocaleString(i18n.language)}</dd>
      <dt className="text-ink-muted">Stripe</dt>
      <dd className="break-all font-mono">{s.stripeSubId}</dd>
    </dl>
  );
}

// ── Изтриване на акаунт (само OWNER) ─────────────────────────────────────────

function DeleteAccountSection({
  userId,
  email,
  onDeleted,
}: {
  userId: string;
  email: string;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const matches = confirmEmail.trim().toLowerCase() === email.toLowerCase();

  async function erase() {
    setBusy(true);
    setErr(null);
    try {
      await adminApi.eraseUser(userId, confirmEmail.trim());
      setOpen(false);
      onDeleted();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)} className="w-full !text-loss">
        {t("admin.eraseOpen", "Изтрий акаунта")}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-card border border-loss/40 bg-loss/5 p-3" role="alert">
      <p className="text-sm font-semibold text-loss">{t("admin.eraseTitle", "Необратимо изтриване на акаунт")}</p>
      <p className="text-xs text-ink-300">
        {t(
          "admin.eraseWarning",
          "Акаунтът ще бъде анонимизиран според GDPR: имейл, име, парола, входове чрез Google/Facebook, приятелства и известия се изтриват, VIP абонаментът се отменя, а сесиите се прекратяват. Покупките остават само в анонимен вид. Действието не може да бъде отменено.",
        )}
      </p>
      <Field
        label={t("admin.eraseConfirmLabel", "Въведи имейла на играча за потвърждение")}
        value={confirmEmail}
        onChange={(e) => setConfirmEmail(e.target.value)}
        placeholder={email}
        autoComplete="off"
      />
      <div className="flex gap-2">
        <Button loading={busy} disabled={!matches} onClick={erase} className="flex-1 !bg-loss !from-loss !to-loss text-white">
          {t("admin.eraseConfirm", "Изтрий завинаги")}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {t("admin.cancel", "Отказ")}
        </Button>
      </div>
      {err ? <p className="text-xs text-loss">{err}</p> : null}
    </div>
  );
}

// ── Композиция за детайла на играч ───────────────────────────────────────────

export function UserDataSections({
  user,
  meRole,
  meId,
  onErased,
}: {
  user: { id: string; email: string; role: string; deletedAt?: string | null };
  meRole: string | undefined;
  meId: string | undefined;
  onErased: () => void;
}) {
  const { t } = useTranslation();
  const canMutate = canMutateUser(meRole, meId, user) && !user.deletedAt;
  const canErase = meRole === "OWNER" && meId !== user.id && user.role !== "OWNER" && !user.deletedAt;

  return (
    <>
      <Collapsible title={t("admin.secInventory", "Инвентар")}>
        <InventorySection userId={user.id} canMutate={canMutate} />
      </Collapsible>
      <Collapsible title={t("admin.secAchievements", "Постижения")}>
        <AchievementsSection userId={user.id} canMutate={canMutate} />
      </Collapsible>
      <Collapsible title={t("admin.secQuests", "Мисии")}>
        <QuestsSection userId={user.id} canMutate={canMutate} />
      </Collapsible>
      <Collapsible title={t("admin.ratings", "Рейтинги")}>
        <RatingsSection userId={user.id} canMutate={canMutate} />
      </Collapsible>
      <Collapsible title={t("admin.secNotification", "Известие")}>
        <NotificationSection userId={user.id} canMutate={canMutate} />
      </Collapsible>
      <Collapsible title={t("admin.secSubscription", "Абонамент")}>
        <SubscriptionSection userId={user.id} />
      </Collapsible>
      {canErase ? (
        <div className="border-t border-brass-400/10 pt-3">
          <DeleteAccountSection userId={user.id} email={user.email} onDeleted={onErased} />
        </div>
      ) : null}
    </>
  );
}
