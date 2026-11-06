// Логиката на пробата за AI на устройството (tools/ai_probe.html): промптът, ограничението на
// отговора и разборът му. Класически скрипт → globalThis.SA_AI; tests/ai_probe.test.mjs го пуска във vm.
// Нищо от тук не е в пакета (tools/ е извън zip-а) — това е проба преди 6.0 (docs/PLAN-6.0.md).
(function (root) {
  // Езиците, които Prompt API приема (developer.chrome.com/docs/extensions/ai/prompt-api, 21.10.2026).
  const LANGS = ["en", "ja", "es", "de", "fr"];

  const SYSTEM = [
    "You classify one short text snippet taken from a social feed or a web page.",
    "Answer ad=true only if the snippet is itself a paid placement: a post or box labelled as sponsored,",
    "promoted, advertisement or paid partnership in any language (for example Sponsored, Promoted, Ad,",
    "Anzeige, Gesponsert, Patrocinado, Sponsorisé, 広告, スポンサー).",
    "Answer ad=false for organic content, including posts that merely talk about sponsors or advertising.",
    "Reply only with the JSON object.",
  ].join(" ");

  // JSON Schema за responseConstraint: само { "ad": boolean }.
  const SCHEMA = { type: "object", properties: { ad: { type: "boolean" } }, required: ["ad"], additionalProperties: false };

  /** Отговорът на модела → true/false, или null, ако не става ясно (никога не гадаем). */
  function parseAnswer(text) {
    const s = String(text == null ? "" : text).trim();
    try {
      const o = JSON.parse(s);
      if (o && typeof o.ad === "boolean") return o.ad;
    } catch {}
    const m = /"ad"\s*:\s*(true|false)/i.exec(s);
    return m ? m[1].toLowerCase() === "true" : null;
  }

  /** Само текстът, който пращаме на модела: съкратен, без празни редове — моделът е на устройството. */
  function snippet(text, max = 400) {
    return String(text == null ? "" : text).replace(/\s+/g, " ").trim().slice(0, max);
  }

  // Примери за пробата: етикетирани на ръка; половината реклами, половината не (вкл. „говори за спонсор“).
  const SAMPLES = [
    { lang: "en", ad: true, text: "Brand Shoes · Sponsored · Summer sale: 40% off all running shoes. Shop now" },
    { lang: "en", ad: false, text: "Alice · 2 h · I was sponsored by my friends to run a marathon for charity!" },
    { lang: "en", ad: true, text: "Promoted · Try CloudHost free for 30 days. Deploy in seconds." },
    { lang: "en", ad: false, text: "Why do podcasts read ads? A short history of sponsorship in radio." },
    { lang: "de", ad: true, text: "Gesponsert · Jetzt 20 % auf alle Kaffeemaschinen sichern" },
    { lang: "de", ad: false, text: "Unser Verein sucht neue Sponsoren für die Jugendmannschaft" },
    { lang: "es", ad: true, text: "Patrocinado · Descubre las nuevas zapatillas con envío gratis" },
    { lang: "es", ad: false, text: "María · Hoy fui al mercado con mi abuela, ¡qué bonito día!" },
    { lang: "fr", ad: true, text: "Sponsorisé · Votre assurance auto dès 9 € par mois" },
    { lang: "fr", ad: false, text: "Les publicités à la télévision coûtent de plus en plus cher, selon une étude" },
    { lang: "ja", ad: true, text: "広告 · 今だけ送料無料！新しいスニーカーをチェック" },
    { lang: "ja", ad: false, text: "今日は友だちと公園でピクニックをしました" },
  ];

  root.SA_AI = { LANGS, SYSTEM, SCHEMA, parseAnswer, snippet, SAMPLES };
})(typeof globalThis !== "undefined" ? globalThis : this);
