// frontend/src/components/DiscordPicker.jsx
// Избор на канал, категория и роля — от СПИСЪК, не чрез копиране на ID.
//
// ЗАЩО (собственикът, 08.08.2026: „не искам да копирам ID-та"): таблото искаше
// снежинки, изписани на ръка. За канал — 19 цифри след Developer Mode → десен
// бутон → Copy ID. За роли — СПИСЪК от такива, разделени със запетаи, в поле,
// което не може да ги провери. Това не е настройка, а домашно; и всяка сгрешена
// цифра се проваля ТИХО (ботът пада на авто-избор или просто мълчи).
//
// ЗАЩО ЧИПОВЕ, А НЕ `<select multiple>`: нативният multi-select иска Ctrl+клик
// на десктоп (никой не го знае), а на телефон е системен списък, в който не
// виждаш какво си избрал. Чиповете показват избора постоянно, махат се с един
// клик и се четат от екранен четец. При 60 роли падащ списък с търсене е
// единственото, което остава използваемо.
//
// Дисциплина:
//   • Fail-open — падне ли ботът, полето става текстово и старият начин работи.
//     Настройка не бива да е недостъпна, защото списък не се е заредил.
//   • Причината се казва ПРЕДИ избора: роля над бота или с опасни права се
//     маркира тук, вместо ботът да я откаже тихо после. Флагът идва от СЪЩАТА
//     функция, с която ботът реално отказва (`roleAssignabilityReason`).
//   • Запазена стойност за изчезнал канал/роля не се губи мълчаливо.
//   • Всеки видим низ минава през `t()`.
import { useMemo, useRef, useState, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { AlertTriangle, X, ChevronDown, Search } from "lucide-react";
import api from "../api";
import { useT } from "../contexts/I18nContext";

const SNOWFLAKE = /^\d{17,20}$/;

/** Каталогът на guild-а — една заявка, споделена от всички полета на екрана. */
export function useGuildDirectory() {
  const { serverId } = useParams();
  return useQuery({
    queryKey: ["guild-directory", serverId],
    queryFn: async () => (await api.get(`/servers/${serverId}/directory`)).data,
    enabled: !!serverId,
    staleTime: 60_000,
    retry: false,          // ботът или отговаря, или падаме на текстово поле
  });
}

function Warn({ children }) {
  return (
    <p className="text-xs text-warning mt-1 flex items-start gap-1.5">
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Текстово поле — резервният път, когато каталогът е недостъпен. */
function ManualId({ value, onChange, id, multi }) {
  const { t } = useT();
  return (
    <>
      <input
        id={id}
        className="cs-input font-mono text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t(multi ? "picker.manualPlaceholderMulti" : "picker.manualPlaceholder")}
      />
      <Warn>{t("picker.botUnreachable")}</Warn>
    </>
  );
}

// ─── Канал / категория (един избор) ──────────────────────────────────────────

export default function DiscordChannelSelect({ kind = "text", value, onChange, emptyLabel, id, ariaLabel }) {
  const { t } = useT();
  const { data, isLoading, isError } = useGuildDirectory();

  const list = kind === "category" ? data?.categories : data?.text;
  const chosen = list?.find((c) => c.id === value);

  if (isError || (!isLoading && !list)) {
    return <ManualId id={id} value={value} onChange={(v) => onChange(v.trim())} />;
  }

  return (
    <>
      {/* `ariaLabel` е за местата БЕЗ външен <label htmlFor> — напр. бързият
          избор на канал до бутона „Публикувай". Без него axe вдига select-name
          (WCAG 4.1.2 / EAA). Не се слага по подразбиране, за да не изяде
          по-конкретния етикет там, където го има. */}
      <select id={id} className="cs-input" value={value || ""} disabled={isLoading}
              aria-label={ariaLabel || undefined}
              onChange={(e) => onChange(e.target.value)}>
        <option value="">{isLoading ? t("picker.loading") : (emptyLabel || t("picker.none"))}</option>
        {/* Стойност отпреди (или изтрит канал) — показваме я, вместо да я нулираме тихо. */}
        {value && !chosen && SNOWFLAKE.test(value) && (
          <option value={value}>{t("picker.unknownKept", { id: value })}</option>
        )}
        {(list || []).map((c) => (
          <option key={c.id} value={c.id}>{kind === "category" ? c.name : `# ${c.name}`}</option>
        ))}
      </select>
      {chosen && kind === "text" && chosen.canSend === false && <Warn>{t("picker.cannotSend")}</Warn>}
      {chosen && kind === "category" && chosen.canCreate === false && <Warn>{t("picker.cannotCreate")}</Warn>}
    </>
  );
}

// ─── Роли ────────────────────────────────────────────────────────────────────

/** Причината, поради която ботът НЕ може да раздаде тази роля. */
function roleWarning(role, t) {
  if (!role || role.assignable) return null;
  return t(`picker.role.${role.reason || "managed"}`);
}

function RoleDot({ color }) {
  return (
    <span
      className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white/20"
      style={{ background: color || "#99aab5" }}
      aria-hidden="true"
    />
  );
}

/**
 * Избор на роли.
 *
 * @param {boolean} multi          няколко роли (чипове) или една
 * @param {string}  value          CSV от ID-та — СЪЩИЯТ формат, който формите
 *                                 вече държат, за да не пипаме логиката на запис
 * @param {boolean} [requireAssignable] маркирай ролите, които ботът не може да
 *                                 РАЗДАДЕ (за „изисква роля" това е без значение)
 */
export function DiscordRoleSelect({ multi = false, value, onChange, id, requireAssignable = true }) {
  const { t } = useT();
  const { data, isLoading, isError } = useGuildDirectory();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const [pos, setPos] = useState(null);

  const roles = data?.roles;
  const selected = useMemo(
    () => (value || "").split(",").map((x) => x.trim()).filter(Boolean),
    [value],
  );

  // Клик извън / Esc затварят списъка — иначе на телефон остава да виси.
  // Списъкът е в ПОРТАЛ (виж по-долу), значи `boxRef.contains` не го покрива —
  // проверяват се и двете дървета, иначе клик в самия списък го затваря.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (boxRef.current?.contains(e.target)) return;
      if (listRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // ─── Позициониране през портал ────────────────────────────────────────────
  // ЗАЩО: списъкът беше `position: absolute` вътре в реда си. Модалът обаче е
  // `max-h-[90vh] overflow-y-auto` — отвориш ли полето близо до долния ръб,
  // списъкът се РЕЖЕ от скрол-контейнера и опциите долу не се виждат без
  // превъртане. Порталът го изнася в <body> с `position: fixed`, значи никой
  // прародител не може да го отреже; позицията се смята от реалния правоъгълник
  // на бутона и се обръща НАГОРЕ, когато мястото под него не стига. Следи
  // scroll (capture — хваща и скрола ВЪТРЕ в модала) и resize. (08.08.2026)
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom;
      const above = r.top;
      const up = below < 240 && above > below;
      const maxH = Math.max(160, Math.min(288, (up ? above : below) - 12));
      setPos({
        left: r.left,
        width: r.width,
        top: up ? undefined : r.bottom + 4,
        bottom: up ? window.innerHeight - r.top + 4 : undefined,
        maxH,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  if (isError || (!isLoading && !roles)) {
    return <ManualId id={id} multi={multi} value={value} onChange={onChange} />;
  }

  const byId = (rid) => roles?.find((r) => r.id === rid);
  const emit = (ids) => onChange(ids.join(","));
  const toggle = (rid) => {
    if (!multi) { emit(selected[0] === rid ? [] : [rid]); setOpen(false); return; }
    emit(selected.includes(rid) ? selected.filter((x) => x !== rid) : [...selected, rid]);
  };

  const needle = q.trim().toLowerCase();
  const shown = (roles || []).filter((r) => !needle || r.name.toLowerCase().includes(needle));

  return (
    <div ref={boxRef} className="relative">
      {/* Избраното е ВИНАГИ видимо — това е разликата спрямо `<select multiple>`. */}
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5" aria-live="polite">
        {selected.map((rid) => {
          const r = byId(rid);
          return (
            <span key={rid}
                  className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 text-xs rounded-lg border border-cs-border bg-cs-panel text-cs-text max-w-full">
              <RoleDot color={r?.color} />
              <span className="truncate">{r ? r.name : t("picker.unknownKept", { id: rid })}</span>
              <button type="button" onClick={() => toggle(rid)}
                      aria-label={t("picker.removeRole", { name: r?.name || rid })}
                      className="p-1 text-cs-muted hover:text-danger">
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            </span>
          );
        })}
        {selected.length === 0 && (
          <span className="text-xs text-cs-dim">{isLoading ? t("picker.loading") : t("picker.noRoles")}</span>
        )}
      </div>

      <button type="button" id={id} ref={btnRef} onClick={() => setOpen((o) => !o)} disabled={isLoading}
              aria-expanded={open} aria-haspopup="listbox"
              className="cs-input flex items-center justify-between gap-2 text-left">
        <span className="text-cs-muted text-sm">
          {t(multi ? "picker.addRole" : "picker.pickRole")}
        </span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && pos && createPortal(
        <div
          ref={listRef}
          /* z над .cs-overlay (z-50): списъкът трябва да стои над модала, в
             който живее полето му. fixed + портал = никой overflow не го реже. */
          data-picker-portal=""
          style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH, zIndex: 60 }}
          className="overflow-y-auto rounded-xl border border-cs-border bg-cs-bg shadow-2xl"
        >
          <div className="sticky top-0 bg-cs-bg border-b border-cs-border p-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-cs-dim" aria-hidden="true" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                     className="cs-input !py-2 pl-8 text-sm" placeholder={t("picker.searchRole")} />
            </div>
          </div>
          <ul role="listbox" aria-multiselectable={multi}>
            {shown.length === 0 && <li className="px-3 py-3 text-xs text-cs-dim">{t("picker.noMatch")}</li>}
            {shown.map((r) => {
              const on = selected.includes(r.id);
              const warn = requireAssignable ? roleWarning(r, t) : null;
              return (
                <li key={r.id} role="option" aria-selected={on}>
                  <button type="button" onClick={() => toggle(r.id)}
                          className={`w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-cs-panel ${on ? "bg-cs-cyanGlow" : ""}`}>
                    <RoleDot color={r.color} />
                    <span className="text-sm text-cs-text truncate flex-1">{r.name}</span>
                    {warn && <span className="text-[10px] text-warning font-mono uppercase tracking-wider flex-shrink-0">{warn}</span>}
                    {on && <span className="text-cs-cyan text-xs flex-shrink-0" aria-hidden="true">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}

      {/* Обобщено предупреждение под полето — избраното вече е направено, но
          човекът трябва да види ЗАЩО няма да сработи, преди да натисне „Запази". */}
      {requireAssignable && selected.some((rid) => byId(rid) && !byId(rid).assignable) && (
        <Warn>{t("picker.someUnassignable")}</Warn>
      )}
    </div>
  );
}
