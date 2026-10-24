// sites.mjs — живите адреси на продуктите: ЕДИНСТВЕНИЯТ списък за tools/seo/live-check.mjs.
//
// url = каноничният адрес, както е в canonical-а и sitemap-а на сайта (не алиас).
// key = файлът с IndexNow ключа в репото, ако продуктът го държи там. Ключът е публичен по
//       дизайн (сервира се на живо), затова проверката го сравнява с живия сайт.
// Нов продукт с домейн → ред тук. Продукт без домейн (CSPos, treydar, vpsdash…) не влиза.
export const SITES = [
  { product: "carbonstealth.eu", url: "https://carbonstealth.eu", note: "хъбът — кодът не е в това репо" },
  { product: "zabobovdol", url: "https://zabobovdol.carbonstealth.eu", note: "ключът се сервира от маршрут (src/app/indexnow-key.txt/)" },
  { product: "medqr", url: "https://medqr.carbonstealth.eu" },
  { product: "SupremeDiscordBot", url: "https://supremebot.carbonstealth.eu", key: "SupremeDiscordBot/frontend/public/09d438d11f84037ca203486287865836.txt" },
  { product: "adblock", url: "https://adblock.carbonstealth.eu", key: "adblock/server/indexnow_key.txt" },
  { product: "korpora", url: "https://korpora.carbonstealth.eu", key: "korpora/public/indexnow-key.txt" },
  { product: "linketto", url: "https://linketto.carbonstealth.eu" },
  { product: "Nexus", url: "https://nexus.carbonstealth.eu", key: "Nexus/client/public/indexnow-key.txt" },
  { product: "Gaming", url: "https://gaming.carbonstealth.eu" },
  { product: "Minyor", url: "https://minyor.carbonstealth.eu" },
  { product: "piuma", url: "https://piuma.carbonstealth.eu", key: "piuma/public/indexnow-key.txt" },
  { product: "mastilko", url: "https://mastilko-bg.com", key: "mastilko/public/a7165a3a38349feabee2f8ce359f4002.txt" },
  { product: "vizitka", url: "https://vizitka-bg.com", note: "ключът е в env на сървъра (INDEXNOW_KEY), не в репото" },
  { product: "eternaltouch", url: "https://eternaltouch.it", key: "eternaltouch/src/public/indexnow-key.txt" },
  { product: "evanitasport", url: "https://evanita-bg.com", key: "evanitasport/indexnow-key.txt" },
  { product: "ospedalitrasparenti", url: "https://ospedalitrasparenti.it", key: "ospedalitrasparenti/site/5b4aa30a56f781cd13180f778257e0e2.txt" },
  { product: "panev", url: "https://panevascensori.it", key: "panev/d6e1a2e328c3fd92c84f47c85c1fb084.txt" },
  { product: "scuolabulgara", url: "https://www.scuolabulgaramilano.it", key: "scuolabulgara/public/indexnow-key.txt" },
  { product: "kebab", url: "https://uylas-kebap-center.it" },
];
