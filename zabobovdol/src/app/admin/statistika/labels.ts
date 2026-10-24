// Етикети на български за таблото „Статистика“. Определенията на метриките
// са в docs/tracking-plan.md — тук са само кратките подсказки под числата.

export const NORTH_STAR_METRICS = ["tel_click", "helpful_yes", "share_click"] as const;

export const EVENT_LABELS: Record<string, string> = {
  view: "Прегледи на страници",
  share_click: "Натиснато „Сподели“",
  tel_click: "Натиснат телефонен номер",
  helpful_yes: "„Помогна ли ви?“ — Да",
  helpful_no: "„Помогна ли ви?“ — Не",
  app_open: "Отворено от иконата на телефона",
  install_click: "Натиснато „Сложи на телефона“",
  push_subscribe: "Абонамент за известия",
  push_unsubscribe: "Отписване от известия",
  phone_report: "Сигнал „грешен номер“",
  viber_click: "Отворен Viber каналът",
  rss_click: "Отворен RSS абонаментът",
  banner_click: "Клик по рекламен банер",
  qr: "Сканиран QR код (/p/…)",
  search: "Търсения",
  search_miss: "Неуспешни търсения",
};

export function sourceLabel(s: string): string {
  if (s === "direct") return "Директно (без препращане)";
  if (s === "internal") return "От друга страница на сайта";
  if (s === "share") return "Споделена връзка (?s=share)";
  if (s === "app") return "Иконата на телефона";
  if (s === "google") return "Google";
  if (s === "bing") return "Bing";
  if (s === "yandex") return "Yandex";
  if (s === "duckduckgo") return "DuckDuckGo";
  if (s === "facebook") return "Facebook";
  if (s === "instagram") return "Instagram";
  if (s === "viber") return "Viber";
  if (s === "rss") return "RSS";
  if (s === "push") return "Известие";
  if (s === "family") return "„За близките“";
  if (s === "print") return "Печатна листовка";
  if (s === "chatgpt" || s === "perplexity" || s === "claude") return `AI помощник (${s})`;
  if (s === "egov") return "egov.bg";
  if (s === "other") return "Непознат маркер";
  if (s === "other-site") return "Друг сайт (без име — поверителност)";
  if (s.startsWith("qr-")) return `QR плакат „${s.slice(3)}“`;
  if (s.startsWith("site:")) return `Сайт ${s.slice(5)}`;
  return s || "—";
}

/** Групата на канала — за обобщението „откъде идват хората“. */
export function channelGroup(s: string): string {
  if (s.startsWith("qr-")) return "QR плакати";
  if (["google", "bing", "yandex", "duckduckgo"].includes(s)) return "Търсачки";
  if (["chatgpt", "perplexity", "claude"].includes(s)) return "AI помощници";
  if (["facebook", "instagram", "viber"].includes(s)) return "Социални мрежи и Viber";
  if (s === "share") return "Споделени връзки";
  if (s === "app") return "Приложението (иконата)";
  if (s === "direct") return "Директно";
  if (["rss", "push", "family", "print"].includes(s)) return "Наши канали (RSS, известия, печат)";
  return "Други сайтове";
}
