// Затвореният списък от действия, които сайтът брои. Пази се САМО броят на ден
// (DailyStat) — никакъв идентификатор на посетителя, никаква бисквитка. Сървърът
// (/api/e) приема единствено имената от този списък.
//
// Файлът е общ за сървъра и браузъра: `track()` се вика от клиентски компоненти.
export const EVENT_NAMES = [
  "share_click", // натиснат бутон „Сподели“
  "tel_click", // натиснат телефонен номер
  "helpful_yes", // „Помогна ли ви?“ — да
  "helpful_no", // „Помогна ли ви?“ — не
  "app_open", // отворено от иконата на началния екран (?s=app)
  "install_click", // натиснато „Сложи на телефона“
  "push_subscribe", // абонамент за известия
  "push_unsubscribe", // отписване от известия
  "phone_report", // „Този номер е сгрешен“
  "viber_click", // отворен Viber каналът
  "rss_click", // отворен RSS абонаментът
  "banner_click", // клик по рекламен банер (за отчета към рекламодателя)
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

const SET = new Set<string>(EVENT_NAMES);
export function isEventName(x: unknown): x is EventName {
  return typeof x === "string" && SET.has(x);
}

// Праща събитие без бисквитки и без идентификатор. Никога не хвърля — броенето
// не бива да чупи действието, което човек всъщност иска да направи.
export function track(name: EventName): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      e: name,
      p: window.location.pathname,
      s: new URLSearchParams(window.location.search).get("s") ?? "",
    });
    const blob = new Blob([body], { type: "application/json" });
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/e", blob)) return;
    void fetch("/api/e", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* броенето е второстепенно */
  }
}
