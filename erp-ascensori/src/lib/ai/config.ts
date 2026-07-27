// Конфигурация на AI помощника — ЧИСТА, за да се тества без обкръжение.
//
// Функцията е ИЗКЛЮЧЕНА по подразбиране и това не е предпазливост, а изискване:
// четенето на документ прати съдържанието му на ТРЕТА СТРАНА. В тези документи
// има имена, данъчни номера и адреси — лични данни по смисъла на ОРЗД. Затова
// включването е съзнателно действие на клиента, не стойност по подразбиране,
// която някой открива след година.
//
// Три правила:
//
//   1. Ключът живее САМО на сървъра (`.env`, mode 600). Никога не пътува към
//      браузъра и никога не влиза в репото.
//   2. Липсващ ключ НЕ е грешка — функцията просто е изключена и интерфейсът го
//      казва. Приложението работи и без нея.
//   3. Доставчикът е сменяем. Клиент, който не иска данните му да излизат от
//      ЕС, посочва европейски endpoint или изключва функцията изцяло.

export const PROVIDER_AI = ["off", "gemini", "anthropic", "openai"] as const;
export type ProviderAi = (typeof PROVIDER_AI)[number];

export interface ConfigAi {
  /** Какво е поискано в обкръжението. */
  configurato: ProviderAi;
  /** Какво реално ще работи: без ключ пада на „off“. */
  effettivo: ProviderAi;
  chiave: string;
  modello: string;
  /** Крайният адрес — сменяем заради регионалните endpoint-и и заради проксита. */
  baseUrl: string;
  /** Показва се на потребителя: кой получава документа. */
  etichettaFornitore: string;
}

/**
 * Моделите по подразбиране са МУЛТИМОДАЛНИ.
 *
 * Не е дребна подробност: цялата функция чете сканирани PDF-и и снимки от
 * телефон. Текстов модел би приел заявката и би върнал празнота — най-лошият
 * вид повреда, защото прилича на „документът не съдържа данни“.
 */
const PREDEFINITI: Record<
  Exclude<ProviderAi, "off">,
  { modello: string; url: string; nome: string }
> = {
  gemini: {
    modello: "gemini-2.5-flash",
    url: "https://generativelanguage.googleapis.com/v1beta",
    nome: "Google Gemini",
  },
  anthropic: {
    // НАЙ-ЕВТИНИЯТ, КОЙТО ВЪРШИ ТОЧНО ТАЗИ РАБОТА. Задачата е тясна: чете се
    // един документ и се ПРЕДЛАГАТ стойности на полета, които човек преглежда.
    // Haiku 4.5 е мултимодален (снимка от телефона на техника, сканиран PDF) и
    // поддържа structured outputs, тоест отговорът излиза по нашата схема, а не
    // като текст за разбор. По-скъп модел би платил разсъждение, което тук няма
    // на какво да се приложи.
    modello: "claude-haiku-4-5",
    url: "https://api.anthropic.com/v1",
    nome: "Anthropic Claude",
  },
  openai: {
    modello: "gpt-4o-mini",
    url: "https://api.openai.com/v1",
    nome: "OpenAI",
  },
};

function comeProvider(v: string | undefined | null): ProviderAi | "" {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return (PROVIDER_AI as readonly string[]).includes(s)
    ? (s as ProviderAi)
    : "";
}

/** Изчислява конфигурацията от обкръжението. Чисто — оттам и тестовете. */
export function risolviConfigAi(
  env: Record<string, string | undefined>,
): ConfigAi {
  const configurato = comeProvider(env.AI_PROVIDER) || "off";
  if (configurato === "off")
    return {
      configurato: "off",
      effettivo: "off",
      chiave: "",
      modello: "",
      baseUrl: "",
      etichettaFornitore: "",
    };

  const p = PREDEFINITI[configurato];
  const chiave = (env.AI_API_KEY ?? "").trim();
  return {
    configurato,
    // Без ключ функцията е изключена. Заявка към доставчик без ключ дава 401 и
    // объркващо съобщение — по-честно е изобщо да не се показва бутонът.
    effettivo: chiave ? configurato : "off",
    chiave,
    modello: (env.AI_MODEL ?? "").trim() || p.modello,
    baseUrl: (env.AI_BASE_URL ?? "").trim().replace(/\/+$/, "") || p.url,
    etichettaFornitore: (env.AI_FORNITORE_ETICHETTA ?? "").trim() || p.nome,
  };
}

export function configAi(): ConfigAi {
  return risolviConfigAi(process.env as Record<string, string | undefined>);
}

export function aiAttiva(): boolean {
  return configAi().effettivo !== "off";
}
