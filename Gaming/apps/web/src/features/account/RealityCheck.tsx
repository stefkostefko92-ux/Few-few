import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Modal } from "../../ui";
import { api } from "../../lib/api";
import { useAuthStore } from "../../lib/store";
import { nextRealityCheck, readDaily, sessionMinutes, sessionStart, tickDaily } from "./playTime";

/** Повторно напомняне за достигнат дневен лимит (минути), ако играчът продължи. */
const LIMIT_REMIND_EVERY = 15;

export const RESPONSIBLE_QUERY_KEY = ["responsible"] as const;

/** Настройките за отговорна игра на влезлия играч (споделени с профила). */
export function useResponsibleSettings() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: RESPONSIBLE_QUERY_KEY,
    queryFn: api.responsible,
    enabled: !!user && user.role !== "GUEST",
    staleTime: 60_000,
  });
}

/**
 * Отговорна игра (монтиран в Layout): модал „Играете от X мин“ на всеки
 * избран интервал (30/60/120) с „Почивка“ / „Продължи“, и известие при
 * достигнат дневен лимит на сесията. Времето се брои само докато разделът е
 * видим. Помощ за играча, не наказание — самоизключването е сървърно.
 */
export function RealityCheck() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data } = useResponsibleSettings();
  const interval = data?.realityCheckMinutes ?? 0;
  const limit = data?.dailyLimitMinutes ?? null;

  const start = useRef(sessionStart());
  const [elapsed, setElapsed] = useState(() => sessionMinutes(start.current));
  const [today, setToday] = useState(() => readDaily().minutes);
  const [checkAt, setCheckAt] = useState<number | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const nextCheck = useRef<number | null>(null);
  const nextLimit = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      setElapsed(sessionMinutes(start.current));
      setToday(tickDaily(1).minutes);
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Смяна на интервала → броенето тръгва от следващото кратно.
  useEffect(() => {
    nextCheck.current = interval > 0 ? nextRealityCheck(sessionMinutes(start.current), interval) : null;
  }, [interval]);

  useEffect(() => {
    if (interval <= 0 || nextCheck.current === null || elapsed < nextCheck.current) return;
    setCheckAt(elapsed);
    nextCheck.current = nextRealityCheck(elapsed, interval);
  }, [elapsed, interval]);

  useEffect(() => {
    if (limit === null || today < limit || today < nextLimit.current) return;
    setLimitOpen(true);
    nextLimit.current = today + LIMIT_REMIND_EVERY;
  }, [today, limit]);

  const takeBreak = () => {
    setCheckAt(null);
    setLimitOpen(false);
    navigate("/account");
  };

  return (
    <>
      <Modal
        open={checkAt !== null}
        onClose={() => setCheckAt(null)}
        title={t("responsible.realityTitle")}
      >
        <p className="text-ink-300">{t("responsible.realityBody", { n: checkAt ?? elapsed })}</p>
        <div className="mt-6 flex gap-3">
          <Button variant="ghost" onClick={takeBreak} className="flex-1">
            {t("responsible.takeBreak")}
          </Button>
          <Button onClick={() => setCheckAt(null)} className="flex-1">
            {t("responsible.keepPlaying")}
          </Button>
        </div>
      </Modal>
      <Modal open={limitOpen} onClose={() => setLimitOpen(false)} title={t("responsible.limitTitle")}>
        <p className="text-ink-300">{t("responsible.limitBody", { n: limit ?? 0 })}</p>
        <div className="mt-6 flex gap-3">
          <Button onClick={takeBreak} className="flex-1">
            {t("responsible.takeBreak")}
          </Button>
          <Button variant="ghost" onClick={() => setLimitOpen(false)} className="flex-1">
            {t("responsible.understood")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
