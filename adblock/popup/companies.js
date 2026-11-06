// „Чия е тази връзка“ за „Връзки на страницата“ — домейн → компанията, която стои зад него.
// Собствена карта (MIT): готовите бази (Disconnect, TrackerDB на Ghostery) са CC BY-NC-SA — некомерсиални,
// затова не влизат в пакета (adblock/CLAUDE.md, листите). Тук са само широко известни рекламни,
// аналитични и социални домейни с еднозначен собственик; непознат хост не получава етикет — никога не
// гадаем. Нов ред = проверен собственик (страницата на компанията или нейната политика).
// Класически скрипт (без модули), зарежда се преди popup.js; tests/companies.test.mjs го пуска във vm.
(function (root) {
  const OWNERS = {
    Google: ["google-analytics.com", "googletagmanager.com", "googlesyndication.com", "googleadservices.com",
      "googletagservices.com", "doubleclick.net", "2mdn.net", "app-measurement.com", "googleapis.com", "gstatic.com",
      "youtube.com", "ytimg.com", "youtube-nocookie.com"],
    Meta: ["facebook.net", "facebook.com", "fbcdn.net", "instagram.com", "cdninstagram.com"],
    Microsoft: ["bing.com", "clarity.ms", "adnxs.com"],
    LinkedIn: ["linkedin.com", "licdn.com"],
    Amazon: ["amazon-adsystem.com"],
    X: ["twitter.com", "ads-twitter.com", "x.com", "twimg.com"],
    TikTok: ["tiktok.com", "tiktokcdn.com"],
    Pinterest: ["pinterest.com", "pinimg.com"],
    Snap: ["snapchat.com", "sc-static.net"],
    Reddit: ["reddit.com", "redditstatic.com"],
    Yandex: ["yandex.ru", "yandex.net", "yandex.com"],
    Baidu: ["baidu.com"],
    Yahoo: ["yahoo.com", "yimg.com"],
    Adobe: ["omtrdc.net", "demdex.net", "adobedtm.com"],
    Criteo: ["criteo.com", "criteo.net"],
    Taboola: ["taboola.com"],
    "The Trade Desk": ["adsrvr.org"],
    Magnite: ["rubiconproject.com"],
    PubMatic: ["pubmatic.com"],
    OpenX: ["openx.net"],
    "Index Exchange": ["casalemedia.com"],
    "Media.net": ["media.net"],
    Comscore: ["scorecardresearch.com"],
    Quantcast: ["quantserve.com", "quantcount.com"],
    Hotjar: ["hotjar.com", "hotjar.io"],
    Mouseflow: ["mouseflow.com"],
    "Lucky Orange": ["luckyorange.com", "luckyorange.net"],
    Mixpanel: ["mixpanel.com"],
    Amplitude: ["amplitude.com"],
    Segment: ["segment.com", "segment.io"],
    HubSpot: ["hubspot.com", "hs-analytics.net", "hs-scripts.com", "hsforms.net"],
    Sentry: ["sentry.io", "sentry-cdn.com"],
    "New Relic": ["newrelic.com", "nr-data.net"],
    Cloudflare: ["cloudflareinsights.com"],
  };
  const BY_DOMAIN = new Map();
  for (const [company, domains] of Object.entries(OWNERS)) for (const d of domains) BY_DOMAIN.set(d, company);

  /** Компанията зад хоста или "" — точен домейн или негов поддомейн (никога част от име). */
  function companyOf(host) {
    let h = String(host || "").toLowerCase().replace(/\.$/, "");
    while (h.includes(".")) {
      const c = BY_DOMAIN.get(h);
      if (c) return c;
      h = h.slice(h.indexOf(".") + 1);
    }
    return "";
  }
  root.SA_COMPANIES = { companyOf, size: BY_DOMAIN.size };
})(typeof globalThis !== "undefined" ? globalThis : this);
