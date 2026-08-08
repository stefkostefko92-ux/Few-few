// frontend/src/components/DiscordChannelSelect.jsx
// Избор на Discord канал/категория — от СПИСЪК, не чрез изписана на ръка снежинка.
//
// ЗАЩО (сигнал от собственика, 08.08.2026: „нямам опция да избера в коя
// категория да се отварят тикетите"): настройката съществуваше, но беше поле за
// 19 цифри. За да го попълни, човек трябва да включи Developer Mode в Discord,
// да намери категорията, десен бутон, Copy Channel ID, залепи. Това не е избор,
// а домашно — и точно затова изглеждаше като липсваща функция.
//
// По-лошото е тихият провал: сгрешена цифра не гърми никъде. Ботът просто пада
// на авто-избор (при discuss) или мълчи (при welcomer — точно каквото гонихме
// снощи). Списък с реалните канали премахва цял клас „настроих го, не работи".
//
// Дисциплина:
//   • Fail-open: падне ли ботът, полето става текстово и старият начин работи.
//     Настройка не бива да е недостъпна, защото списъкът не се е заредил.
//   • Показваме и дали ботът МОЖЕ да пише/създава там — предупреждението идва
//     ПРЕДИ избора, не след първия провален тикет.
//   • Всеки видим низ минава през `t()`.
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import api from "../api";
import { useT } from "../contexts/I18nContext";

const SNOWFLAKE = /^\d{17,20}$/;

export function useGuildChannels() {
  const { serverId } = useParams();
  return useQuery({
    queryKey: ["guild-channels", serverId],
    queryFn: async () => (await api.get(`/servers/${serverId}/channels`)).data,
    enabled: !!serverId,
    staleTime: 60_000,
    retry: false,          // ботът или отговаря, или падаме на текстово поле
  });
}

/**
 * @param {"category"|"text"} kind какво се избира
 * @param {string} value   текущият ID (или "")
 * @param {(id: string) => void} onChange
 * @param {string} [emptyLabel] текст за „нищо избрано" (напр. авто-избор)
 */
export default function DiscordChannelSelect({ kind, value, onChange, emptyLabel, id }) {
  const { t } = useT();
  const { data, isLoading, isError } = useGuildChannels();

  const list = kind === "category" ? data?.categories : data?.text;
  const chosen = list?.find((c) => c.id === value);

  // Ботът е недостъпен или не е в сървъра → старият начин, без да губим стойност.
  if (isError || (!isLoading && !list)) {
    return (
      <>
        <input
          id={id}
          className="cs-input font-mono text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder={t("channelSelect.manualPlaceholder")}
        />
        <p className="text-xs text-warning mt-1 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          {t("channelSelect.botUnreachable")}
        </p>
      </>
    );
  }

  return (
    <>
      <select
        id={id}
        className="cs-input"
        value={value}
        disabled={isLoading}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{isLoading ? t("channelSelect.loading") : (emptyLabel || t("channelSelect.none"))}</option>
        {/* Стойност, записана преди ботът да види канала (или изтрит канал):
            показваме я, вместо мълчаливо да я нулираме при следващия запис. */}
        {value && !chosen && SNOWFLAKE.test(value) && (
          <option value={value}>{t("channelSelect.unknownKept", { id: value })}</option>
        )}
        {(list || []).map((c) => (
          <option key={c.id} value={c.id}>
            {kind === "category" ? c.name : `# ${c.name}`}
          </option>
        ))}
      </select>

      {/* Правата се казват ПРЕДИ първия провал, не след него. */}
      {chosen && kind === "text" && chosen.canSend === false && (
        <p className="text-xs text-warning mt-1 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          {t("channelSelect.cannotSend")}
        </p>
      )}
      {chosen && kind === "category" && chosen.canCreate === false && (
        <p className="text-xs text-warning mt-1 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          {t("channelSelect.cannotCreate")}
        </p>
      )}
    </>
  );
}
