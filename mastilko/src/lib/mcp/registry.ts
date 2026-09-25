// Инструментите, които MCP конекторът излага на ChatGPT и Claude.
//
// Как работи всичко: Мастилко НЯМА база данни — състоянието на редактора се
// кодира в самия адрес (`#p=<base64url>`), `useLocalState` го прочита и го слива
// с подразбиранията. Затова конекторът не „създава“ нищо на сървъра: той
// сглобява валидно частично състояние, кодира го и връща готов линк. Нищо не се
// запазва, нищо не се пази.
//
// ВАЖНО за ограниченията: всяко поле тук трябва да е в рамките на схемата на
// СЪОТВЕТНОТО студио (`ProjectSchema` в `components/studios/*Studio.tsx`). Ако
// подадем по-дълъг текст, `ProjectSchema.parse` хвърля вътре в `useLocalState`,
// грешката се гълта и потребителят отваря линка на празен редактор — тоест
// мълчалив провал. Затова маxимумите долу са ОГЛЕДАЛО на студията; при промяна
// там, промени и тук (пази ги тестът „границите съвпадат със студията“).

import { z } from "zod";
import { encodeState } from "@/lib/share";
import { CATALOG, catalogById, searchCatalog } from "@/lib/mcp/catalog";

const SITE = "https://mastilko-bg.com";

/** Над този размер линкът става неизползваем (адресни ограничения в браузъри). */
const MAX_URL = 12000;

export interface TextContent {
  type: "text";
  text: string;
}

export interface CallToolResult {
  content: TextContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface Icon {
  src: string;
  mimeType?: string;
  sizes?: string[];
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  /** Иконата на инструмента (ревизия 2026-07-28). Същите файлове като в сайта. */
  icons?: Icon[];
  run(args: unknown): CallToolResult;
}

/** Иконите са от нашия домейн и са WebP — спецификацията иска HTTPS или data:. */
function icon(file: string): Icon[] {
  return [{ src: `${SITE}/icons/${file}.webp`, mimeType: "image/webp", sizes: ["512x512"] }];
}

// ── Дребни помощници за JSON Schema ─────────────────────────────────────────
const str = (description: string, maxLength: number) => ({ type: "string", description, maxLength });
const num = (description: string, minimum: number, maximum: number) => ({ type: "integer", description, minimum, maximum });
const bool = (description: string) => ({ type: "boolean", description });
const oneOf = (description: string, values: string[]) => ({ type: "string", description, enum: values });

const THEMES = ["med", "tera", "krem", "gora", "mastilo", "nebe"] as const;
const themeJson = oneOf(
  "Цветова тема: med (медено жълто, топло), tera (теракота), krem (кремаво, неутрално), gora (зелено), mastilo (тъмна), nebe (синьо). По подразбиране med.",
  [...THEMES],
);

/** Грешка във ВХОДА от асистента — връща се като `isError`, не като протоколна. */
export class ToolInputError extends Error {}

function ok(url: string, summary: string, extra: Record<string, unknown> = {}): CallToolResult {
  if (url.length > MAX_URL) {
    throw new ToolInputError(
      "Дизайнът стана твърде голям за споделяне по линк. Съкрати текста (най-често списъка с редове) и опитай пак.",
    );
  }
  const structuredContent = { url, summary, ...extra };
  return {
    // Текстът е за човека и за модела; structuredContent е за програмна употреба.
    // Двете носят едно и също — така работи и без поддръжка на structuredContent.
    content: [{ type: "text", text: `${summary}\n\nОтвори и принтирай: ${url}` }],
    structuredContent,
  };
}

/**
 * Строи инструмент за създаване: валидира аргументите, превръща ги в частично
 * състояние на студиото и връща линк.
 */
function design<S extends z.ZodRawShape>(opts: {
  name: string;
  title: string;
  description: string;
  path: string;
  /** Файлът в /public/icons без разширение. */
  iconFile: string;
  properties: Record<string, unknown>;
  required?: string[];
  schema: z.ZodObject<S>;
  toState: (args: z.infer<z.ZodObject<S>>) => Record<string, unknown>;
  summary: (args: z.infer<z.ZodObject<S>>) => string;
}): ToolDef {
  return {
    name: opts.name,
    title: opts.title,
    description: opts.description,
    icons: icon(opts.iconFile),
    inputSchema: {
      type: "object",
      properties: { ...opts.properties, themeId: themeJson },
      required: opts.required ?? [],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Готовият адрес — отваря Мастилко с попълнения дизайн." },
        summary: { type: "string", description: "Какво съдържа дизайнът." },
      },
      required: ["url", "summary"],
      additionalProperties: true,
    },
    run(raw) {
      // `.strict()` нарочно: Zod по подразбиране РЕЖЕ непознатите полета
      // мълчаливо. Тогава сгрешено име („subtitel“ вместо „subtitle“) дава
      // дизайн без това съдържание и никой не разбира — по-лошо от явна
      // грешка, която моделът може да прочете и да поправи. Освен това
      // обявената JSON Schema казва `additionalProperties: false`, тоест
      // рязането би било разминаване между обещано и действително.
      const parsed = opts.schema
        .extend({ themeId: z.enum(THEMES).optional() })
        .strict()
        .safeParse(raw ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new ToolInputError(
          `Невалиден вход за „${opts.name}“: ${first?.path.join(".") || "(корен)"} — ${first?.message}`,
        );
      }
      const args = parsed.data;
      const state: Record<string, unknown> = { ...opts.toState(args as z.infer<z.ZodObject<S>>) };
      if (args.themeId) state.themeId = args.themeId;
      const url = `${SITE}/${opts.path}#p=${encodeState(state)}`;
      return ok(url, opts.summary(args as z.infer<z.ZodObject<S>>), { tool: opts.path });
    },
  };
}

// ── 13-те инструмента за създаване ──────────────────────────────────────────
// (Снимките за документи липсват нарочно: искат качено от потребителя
//  изображение, което асистент не може да подаде. Виж каталога.)

const etiketi = design({
  name: "napravi_etiketi",
  title: "Етикети за печат",
  description:
    "Прави лист А4 с етикети за печат (буркани, кутии, подправки, тетрадки, инвентар) и връща линк. " +
    "Два режима: mode='same' пише един и същ текст на всички етикети (ползвай text1/text2); " +
    "mode='list' прави РАЗЛИЧЕН етикет на всеки ред от listText — това е начинът за цяла серия наведнъж. " +
    "Размерът се избира с presetId; най-често търсеният е '70x36' (24 на лист).",
  path: "etiketi",
  iconFile: "etiketi",
  properties: {
    presetId: oneOf(
      "Размер: 38x21 (65/лист), 48x25 (44), 52x30 (40), 63x38 (21), 70x36 (24 — най-търсен), 70x42 (21), 99x57 (10), 105x74 (8), oval (63×38), circle60 (Ø60), circle40 (Ø40).",
      ["38x21", "48x25", "52x30", "63x38", "70x36", "70x42", "99x57", "105x74", "oval", "circle60", "circle40"],
    ),
    mode: oneOf("'same' = еднакъв текст навсякъде; 'list' = по един етикет на ред от listText.", ["same", "list"]),
    text1: str("Главен ред (при mode='same'). Например „Мед от липа“.", 60),
    text2: str("Втори ред, по-дребен (при mode='same'). Например „Реколта 2026“.", 80),
    listText: str("По един етикет на ред (при mode='list'). Например: Лютеница\\nКисело зеле\\nМед", 4000),
    numbering: bool("Добавя пореден номер на всеки етикет."),
    numberStart: num("От кой номер започва номерацията.", 0, 99999),
    qrUrl: str("Адрес или текст за QR код върху етикета.", 300),
    cutLines: bool("Показва линии за рязане."),
    skipCells: num("Прескача толкова клетки — за доизползване на започнат лист.", 0, 200),
  },
  schema: z.object({
    presetId: z.enum(["38x21", "48x25", "52x30", "63x38", "70x36", "70x42", "99x57", "105x74", "oval", "circle60", "circle40"]).optional(),
    mode: z.enum(["same", "list"]).optional(),
    text1: z.string().max(60).optional(),
    text2: z.string().max(80).optional(),
    listText: z.string().max(4000).optional(),
    numbering: z.boolean().optional(),
    numberStart: z.number().int().min(0).max(99999).optional(),
    qrUrl: z.string().max(300).optional(),
    cutLines: z.boolean().optional(),
    skipCells: z.number().int().min(0).max(200).optional(),
  }),
  toState: (a) => ({ ...a }),
  summary: (a) =>
    a.mode === "list" && a.listText
      ? `Етикети (${a.presetId ?? "70x36"}) — ${a.listText.split("\n").filter((l) => l.trim()).length} различни на лист А4.`
      : `Етикети (${a.presetId ?? "70x36"}) с текст „${a.text1 ?? ""}“ на лист А4.`,
});

const vizitki = design({
  name: "napravi_vizitki",
  title: "Визитки 90 × 54 mm",
  description:
    "Прави визитки в българския стандарт 90 × 54 mm — 10 на лист А4 — и връща линк. " +
    "По желание слага QR код с контактите (vCard), за да се запише контактът директно в телефона.",
  path: "vizitki",
  iconFile: "vizitki",
  properties: {
    name: str("Име и фамилия.", 60),
    role: str("Длъжност. Например „Управител“.", 60),
    company: str("Фирма или бизнес.", 60),
    phone: str("Телефон.", 60),
    email: str("Имейл.", 60),
    website: str("Уебсайт.", 60),
    slogan: str("Кратък слоган.", 60),
    layout: oneOf("Оформление: lenta, klasik, linia, ramka, gorna, duo.", ["lenta", "klasik", "linia", "ramka", "gorna", "duo"]),
    qr: bool("Слага QR код с контактите (vCard)."),
    cutLines: bool("Показва линии за рязане."),
  },
  required: ["name"],
  schema: z.object({
    name: z.string().min(1).max(60),
    role: z.string().max(60).optional(),
    company: z.string().max(60).optional(),
    phone: z.string().max(60).optional(),
    email: z.string().max(60).optional(),
    website: z.string().max(60).optional(),
    slogan: z.string().max(60).optional(),
    layout: z.enum(["lenta", "klasik", "linia", "ramka", "gorna", "duo"]).optional(),
    qr: z.boolean().optional(),
    cutLines: z.boolean().optional(),
  }),
  toState: (a) => ({ ...a }),
  summary: (a) => `Визитки за ${a.name}${a.company ? ` (${a.company})` : ""} — 10 на лист А4.`,
});

const cv = design({
  name: "napravi_cv",
  title: "Автобиография (CV)",
  description:
    "Прави автобиография на български и връща линк. layout='europass' дава шаблона на ЕС " +
    "(тогава има смисъл да попълниш и birthDate, nationality, motherTongue, digitalSkills, driving). " +
    "Трудовият стаж и образованието се подават като списъци; умения и езици са по един на ред.",
  path: "cv",
  iconFile: "cv",
  properties: {
    name: str("Име и фамилия.", 100),
    title: str("Професия или търсена позиция. Например „Счетоводител“.", 100),
    phone: str("Телефон.", 100),
    email: str("Имейл.", 100),
    city: str("Град.", 100),
    website: str("Сайт или LinkedIn.", 100),
    summary: str("Кратко професионално резюме, 2–4 изречения.", 1000),
    jobs: {
      type: "array",
      description: "Трудов стаж, най-новото първо.",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          role: str("Длъжност.", 100),
          company: str("Работодател.", 100),
          period: str("Период. Например „2023 — сега“.", 60),
          desc: str("Какво е вършил — конкретни отговорности и резултати.", 1000),
        },
        required: ["role", "company"],
        additionalProperties: false,
      },
    },
    schools: {
      type: "array",
      description: "Образование, най-новото първо.",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          degree: str("Степен или специалност.", 100),
          school: str("Учебно заведение.", 100),
          period: str("Период. Например „2018 — 2022“.", 60),
        },
        required: ["degree", "school"],
        additionalProperties: false,
      },
    },
    skills: str("Умения — по едно на ред.", 500),
    languages: str("Езици — по един на ред. Например „Английски — B2“.", 300),
    layout: oneOf("Шаблон: klasik, moderen или europass (стандартът на ЕС).", ["klasik", "moderen", "europass"]),
    birthDate: str("Дата на раждане (Europass).", 120),
    nationality: str("Гражданство (Europass).", 120),
    motherTongue: str("Майчин език (Europass).", 120),
    digitalSkills: str("Дигитални умения (Europass).", 200),
    driving: str("Категория МПС (Europass). Например „B“.", 120),
  },
  required: ["name"],
  schema: z.object({
    name: z.string().min(1).max(100),
    title: z.string().max(100).optional(),
    phone: z.string().max(100).optional(),
    email: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    website: z.string().max(100).optional(),
    summary: z.string().max(1000).optional(),
    jobs: z
      .array(
        z.object({
          role: z.string().max(100),
          company: z.string().max(100),
          period: z.string().max(60).optional(),
          desc: z.string().max(1000).optional(),
        }),
      )
      .max(20)
      .optional(),
    schools: z
      .array(
        z.object({
          degree: z.string().max(100),
          school: z.string().max(100),
          period: z.string().max(60).optional(),
        }),
      )
      .max(20)
      .optional(),
    skills: z.string().max(500).optional(),
    languages: z.string().max(300).optional(),
    layout: z.enum(["klasik", "moderen", "europass"]).optional(),
    birthDate: z.string().max(120).optional(),
    nationality: z.string().max(120).optional(),
    motherTongue: z.string().max(120).optional(),
    digitalSkills: z.string().max(200).optional(),
    driving: z.string().max(120).optional(),
  }),
  toState: (a) => {
    const { jobs, schools, ...rest } = a;
    const state: Record<string, unknown> = { ...rest };
    // Студиото иска числово `id` на всеки ред (ключ за React и за пренареждане).
    if (jobs) state.jobs = jobs.map((j, i) => ({ id: i + 1, period: "", desc: "", ...j }));
    if (schools) state.schools = schools.map((s, i) => ({ id: i + 1, period: "", ...s }));
    return state;
  },
  summary: (a) =>
    `Автобиография за ${a.name}${a.layout === "europass" ? " (Europass)" : ""} — ${a.jobs?.length ?? 0} позиции, ${a.schools?.length ?? 0} образования.`,
});

const pismo = design({
  name: "napravi_motivacionno_pismo",
  title: "Мотивационно писмо",
  description:
    "Прави мотивационно писмо на А4 и връща линк. Текстът на писмото се подава в body — " +
    "напиши го сам, на български, в няколко абзаца, разделени с празен ред.",
  path: "pismo",
  iconFile: "pismo",
  properties: {
    name: str("Име на кандидата.", 100),
    phone: str("Телефон.", 100),
    email: str("Имейл.", 100),
    city: str("Град.", 100),
    date: str("Дата на писмото.", 100),
    company: str("Фирма, към която се кандидатства.", 100),
    position: str("Позиция.", 100),
    recipient: str("Получател. Например „До отдел Човешки ресурси“.", 100),
    body: str("Текстът на писмото. Абзаците се разделят с празен ред.", 4000),
    watermark: oneOf("Воден знак: none, chernova, poveritelno, kopie.", ["none", "chernova", "poveritelno", "kopie"]),
  },
  required: ["name"],
  schema: z.object({
    name: z.string().min(1).max(100),
    phone: z.string().max(100).optional(),
    email: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    date: z.string().max(100).optional(),
    company: z.string().max(100).optional(),
    position: z.string().max(100).optional(),
    recipient: z.string().max(100).optional(),
    body: z.string().max(4000).optional(),
    watermark: z.enum(["none", "chernova", "poveritelno", "kopie"]).optional(),
  }),
  toState: (a) => ({ ...a }),
  summary: (a) => `Мотивационно писмо за ${a.name}${a.position ? ` — ${a.position}` : ""}${a.company ? ` в ${a.company}` : ""}.`,
});

const gramoti = design({
  name: "napravi_gramota",
  title: "Грамота или сертификат",
  description:
    "Прави грамота, сертификат или диплома на хоризонтален А4 и връща линк. " +
    "За цяла серия наведнъж подай series (по едно име на ред) — всяко име получава собствена страница, " +
    "а „{име}“ в reason се заменя автоматично с името на получателя.",
  path: "gramoti",
  iconFile: "gramoti",
  properties: {
    kind: str("Вид, с главни букви. Например ГРАМОТА, СЕРТИФИКАТ, ДИПЛОМА.", 40),
    recipient: str("Получател (за единична грамота).", 80),
    reason: str("За какво се връчва. Може да съдържа „{име}“.", 400),
    org: str("Организация — училище, клуб, фирма.", 80),
    place: str("Населено място.", 60),
    date: str("Дата.", 60),
    signer: str("Кой подписва. Например „Директор“.", 60),
    series: str("Серия: по едно име на ред — прави отделна грамота на страница.", 4000),
    seal: bool("Кръгъл печат до подписа."),
    ribbon: bool("Наградна лента-розетка."),
  },
  schema: z.object({
    kind: z.string().max(40).optional(),
    recipient: z.string().max(80).optional(),
    reason: z.string().max(400).optional(),
    org: z.string().max(80).optional(),
    place: z.string().max(60).optional(),
    date: z.string().max(60).optional(),
    signer: z.string().max(60).optional(),
    series: z.string().max(4000).optional(),
    seal: z.boolean().optional(),
    ribbon: z.boolean().optional(),
  }),
  toState: (a) => ({ ...a }),
  summary: (a) => {
    const n = a.series?.split("\n").filter((l) => l.trim()).length;
    return n ? `${a.kind ?? "ГРАМОТА"} — серия от ${n} броя.` : `${a.kind ?? "ГРАМОТА"} за ${a.recipient ?? "(без име)"}.`;
  },
});

const pokani = design({
  name: "napravi_pokana",
  title: "Покана или картичка",
  description: "Прави покана за рожден ден, кръщене, сватба или юбилей — 2 на лист А4 — и връща линк.",
  path: "pokani",
  iconFile: "pokani",
  properties: {
    emoji: str("Емоджи отгоре. Например 🎉 или 🎂.", 8),
    heading: str("Заглавие. Например „Каним те на рожден ден!“", 80),
    who: str("За кого е поводът. Например „Мартин става на 7 години“.", 80),
    what: str("Какъв е поводът.", 80),
    date: str("Дата.", 60),
    time: str("Час.", 40),
    place: str("Място.", 120),
    note: str("Бележка отдолу. Например „Очакваме те за игри и торта!“", 200),
    series: str("Серия: по едно име на гост на ред.", 4000),
    foldLine: bool("Линия за сгъване (двустранна картичка)."),
  },
  schema: z.object({
    emoji: z.string().max(8).optional(),
    heading: z.string().max(80).optional(),
    who: z.string().max(80).optional(),
    what: z.string().max(80).optional(),
    date: z.string().max(60).optional(),
    time: z.string().max(40).optional(),
    place: z.string().max(120).optional(),
    note: z.string().max(200).optional(),
    series: z.string().max(4000).optional(),
    foldLine: z.boolean().optional(),
  }),
  toState: (a) => ({ ...a }),
  summary: (a) => `Покана „${a.heading ?? ""}“${a.date ? ` за ${a.date}` : ""} — 2 на лист А4.`,
});

const tabelki = design({
  name: "napravi_tabelka",
  title: "Табелка или надпис",
  description:
    "Прави табелка за печат — „Отворено/Затворено“, работно време, надпис за врата — и връща линк.",
  path: "tabelki",
  iconFile: "tabelki",
  properties: {
    emoji: str("Емоджи или знак. Например 🕐.", 8),
    title: str("Главен надпис. Например „ОТВОРЕНО“.", 60),
    subtitle: str("Пояснение отдолу. Например „Пон–Пет 9:00 – 18:00“.", 120),
    landscape: bool("Хоризонтално разположение на листа."),
    foldLine: bool("Линия за сгъване — за настолна табелка."),
  },
  required: ["title"],
  schema: z.object({
    emoji: z.string().max(8).optional(),
    title: z.string().min(1).max(60),
    subtitle: z.string().max(120).optional(),
    landscape: z.boolean().optional(),
    foldLine: z.boolean().optional(),
  }),
  toState: (a) => ({ ...a }),
  summary: (a) => `Табелка „${a.title}“ на лист А4.`,
});

const wifi = design({
  name: "napravi_wifi_stiker",
  title: "WiFi стикер с QR код",
  description:
    "Прави стикер с QR код за WiFi — гостът сканира и телефонът се свързва сам, без да въвежда парола. " +
    "ВАЖНО: паролата се кодира в самия линк и НЕ се запазва никъде при нас, но линкът я съдържа — " +
    "кажи на потребителя да не го публикува и да не го препраща.",
  path: "wifi",
  iconFile: "wifi",
  properties: {
    title: str("Надпис отгоре. Например „WiFi за гости“.", 40),
    ssid: str("Име на мрежата (SSID) — точно както се изписва.", 64),
    password: str("Парола за мрежата. Празно при отворена мрежа.", 64),
    auth: oneOf("Защита: WPA (обичайното), WEP (старо) или nopass (отворена мрежа).", ["WPA", "WEP", "nopass"]),
    hidden: bool("Мрежата е скрита (не се излъчва)."),
    note: str("Бележка отдолу.", 120),
    perSheet: num("Колко стикера на лист А4 (1–12).", 1, 12),
  },
  required: ["ssid"],
  schema: z.object({
    title: z.string().max(40).optional(),
    ssid: z.string().min(1).max(64),
    password: z.string().max(64).optional(),
    auth: z.enum(["WPA", "WEP", "nopass"]).optional(),
    hidden: z.boolean().optional(),
    note: z.string().max(120).optional(),
    perSheet: z.number().int().min(1).max(12).optional(),
  }),
  toState: (a) => ({ ...a }),
  // Предупреждението е в САМИЯ резултат, не само в описанието: дали моделът
  // ще преразкаже описанието, не е гарантирано, а резултатът винаги стига до
  // потребителя.
  summary: (a) =>
    `WiFi стикер за мрежата „${a.ssid}“ — ${a.perSheet ?? 4} на лист А4.` +
    (a.password
      ? " ВНИМАНИЕ: паролата е вътре в този линк и в историята на разговора — не го публикувай и не го препращай."
      : ""),
});

const badzhove = design({
  name: "napravi_badzhove",
  title: "Баджове за събитие",
  description:
    "Прави баджове (name tags) за конференция, семинар или сватба и връща линк. " +
    "Силата му е серийната изработка: подай целия списък гости в guests — по един ред на човек, " +
    "във формат „Име | роля | фирма“ (ролята и фирмата са по желание).",
  path: "badzhove",
  iconFile: "vizitki",
  properties: {
    eventName: str("Име на събитието — стои на лентата отгоре на всеки бадж.", 60),
    guests: str("Списък гости, по един на ред: „Име | роля | фирма“.", 6000),
    size: oneOf("Размер: standard (90 × 55 mm) или large (100 × 70 mm).", ["standard", "large"]),
    qrUrl: str("Общ QR код за всички баджове (например програмата на събитието).", 300),
  },
  required: ["eventName", "guests"],
  schema: z.object({
    eventName: z.string().min(1).max(60),
    guests: z.string().min(1).max(6000),
    size: z.enum(["standard", "large"]).optional(),
    qrUrl: z.string().max(300).optional(),
  }),
  toState: (a) => {
    const { guests, ...rest } = a;
    return { ...rest, series: guests };
  },
  summary: (a) =>
    `Баджове за „${a.eventName}“ — ${a.guests.split("\n").filter((l) => l.trim()).length} гости.`,
});

const obyava = design({
  name: "napravi_obyava",
  title: "Обява с откъсващи се телефончета",
  description:
    "Прави класическа обява с ресни за откъсване — долу има ленти с телефона, които минувачите късат. " +
    "За уроци, квартира, услуги, продажба.",
  path: "obyava",
  iconFile: "tabelki",
  properties: {
    title: str("Заглавие на обявата. Например „Уроци по математика“.", 120),
    body: str("Текст — какво предлагаш, условия, цена.", 600),
    contact: str("Телефон или контакт — той се повтаря на всяка ресна.", 40),
    tabs: num("Брой ресни на лист (6–14).", 6, 14),
  },
  required: ["title", "contact"],
  schema: z.object({
    title: z.string().min(1).max(120),
    body: z.string().max(600).optional(),
    contact: z.string().min(1).max(40),
    tabs: z.number().int().min(6).max(14).optional(),
  }),
  toState: (a) => ({ ...a }),
  summary: (a) => `Обява „${a.title}“ с ${a.tabs ?? 10} откъсващи се телефончета.`,
});

const vaucheri = design({
  name: "napravi_vaucheri",
  title: "Подаръчни ваучери и талони",
  description:
    "Прави серия подаръчни ваучери или талони за отстъпка и връща линк. " +
    "Всеки ваучер получава УНИКАЛЕН пореден код от serialPrefix + номер (например MECHTA-001), " +
    "за да се следят при осребряване.",
  path: "vaucheri",
  iconFile: "pokani",
  properties: {
    business: str("Име на бизнеса.", 60),
    value: str("Стойност — кратко и едро. Например „−20%“ или „Подарък“.", 20),
    desc: str("За какво важи. Например „отстъпка за всяка услуга“.", 80),
    validUntil: str("Срок на валидност. Например „валиден до 31.12.2026 г.“", 60),
    serialPrefix: str("Префикс на кода. Например MECHTA.", 20),
    serialStart: num("От кой номер започва броенето.", 0, 999999),
    count: num("Колко ваучера да се направят (1–60).", 1, 60),
    qrUrl: str("Общ QR код (например към страница за осребряване).", 300),
  },
  required: ["business", "value"],
  schema: z.object({
    business: z.string().min(1).max(60),
    value: z.string().min(1).max(20),
    desc: z.string().max(80).optional(),
    validUntil: z.string().max(60).optional(),
    serialPrefix: z.string().max(20).optional(),
    serialStart: z.number().int().min(0).max(999999).optional(),
    count: z.number().int().min(1).max(60).optional(),
    qrUrl: z.string().max(300).optional(),
  }),
  toState: (a) => ({ ...a }),
  summary: (a) => `${a.count ?? 8} ваучера „${a.value}“ за ${a.business}, с уникални кодове.`,
});

const kalendar = design({
  name: "napravi_kalendar",
  title: "Календар за печат",
  description:
    "Прави месечен календар за печат с официалните български празници (включително подвижните около " +
    "Великден) и връща линк. Един лист А4 на месец. ВНИМАНИЕ: месецът се подава като 1–12 (1 = януари).",
  path: "kalendar",
  iconFile: "gramoti",
  properties: {
    year: num("Година.", 2020, 2099),
    month: num("Месец: 1 = януари … 12 = декември.", 1, 12),
    showHolidays: bool("Отбелязва официалните български празници."),
  },
  required: ["year", "month"],
  schema: z.object({
    year: z.number().int().min(2020).max(2099),
    month: z.number().int().min(1).max(12),
    showHolidays: z.boolean().optional(),
  }),
  // Студиото брои месеците от 0 (както Date). Навън излагаме човешкото 1–12,
  // защото модел, който вижда „month: 9“, почти винаги има предвид септември.
  toState: (a) => ({ year: a.year, month: a.month - 1, showHolidays: a.showHolidays }),
  summary: (a) => `Календар за ${String(a.month).padStart(2, "0")}/${a.year} на лист А4.`,
});

const menu = design({
  name: "napravi_menu",
  title: "Меню и ценоразпис",
  description:
    "Прави меню или ценоразпис за печат на А4 и връща линк. " +
    "ФОРМАТ на body (задължително спази): раздел на нов ред с „## Име на раздела“, " +
    "после всеки продукт на нов ред като „Име | цена“. Пример:\n" +
    "## Кафе\\nЕспресо | 2.00\\nКапучино | 2.80\\n\\n## Сладко\\nПалачинка | 5.00",
  path: "menu",
  iconFile: "etiketi",
  properties: {
    title: str("Име на заведението.", 60),
    subtitle: str("Подзаглавие. Например „Меню“ или „Ценоразпис“.", 60),
    body: str("Раздели с „## Име“ и продукти с „Име | цена“, всеки на нов ред.", 4000),
    currency: str("Валута. Например „лв.“ или „€“.", 6),
  },
  required: ["title", "body"],
  schema: z.object({
    title: z.string().min(1).max(60),
    subtitle: z.string().max(60).optional(),
    body: z.string().min(1).max(4000),
    currency: z.string().max(6).optional(),
  }),
  toState: (a) => ({ ...a }),
  summary: (a) =>
    `Меню за ${a.title} — ${a.body.split("\n").filter((l) => l.trim().startsWith("##")).length} раздела.`,
});

// ── search и fetch (съвместимост с проучването на ChatGPT) ───────────────────
// Схемата е фиксирана от OpenAI: `search` приема {query} и връща
// {results:[{id,title,url}]}; `fetch` приема {id} и връща
// {id,title,text,url,metadata}. И двете ВИНАГИ дублират JSON-а и в текстов блок.

/** Връща JSON-а И като текстов блок — OpenAI иска точно това дублиране. */
function withJsonText(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

const search: ToolDef = {
  name: "search",
  title: "Търсене в инструментите на Мастилко",
  icons: icon("pechat"),
  description:
    "Търси сред 14-те инструмента за печат на Мастилко (етикети, визитки, CV, писма, грамоти, покани, " +
    "табелки, WiFi стикери, баджове, обяви, ваучери, календари, менюта, снимки за документи). " +
    "Връща списък с идентификатор, заглавие и адрес. Ползвай fetch за пълното описание.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", description: "Какво търси потребителят, на български." } },
    required: ["query"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" }, title: { type: "string" }, url: { type: "string" } },
          required: ["id", "title", "url"],
        },
      },
    },
    required: ["results"],
  },
  run(raw) {
    const parsed = z.object({ query: z.string().max(400) }).strict().safeParse(raw ?? {});
    if (!parsed.success) throw new ToolInputError("search иска текстово поле „query“.");
    const results = searchCatalog(parsed.data.query).map((e) => ({ id: e.id, title: e.title, url: e.url }));
    return withJsonText({ results });
  },
};

const fetchTool: ToolDef = {
  name: "fetch",
  title: "Пълно описание на инструмент",
  icons: icon("pechat"),
  description:
    "Връща пълното описание на един инструмент на Мастилко по идентификатора му от search " +
    "(например „etiketi“, „cv“, „wifi“).",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Идентификаторът, върнат от search." } },
    required: ["id"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      text: { type: "string" },
      url: { type: "string" },
      metadata: { type: "object" },
    },
    required: ["id", "title", "text", "url"],
  },
  run(raw) {
    const parsed = z.object({ id: z.string().max(80) }).strict().safeParse(raw ?? {});
    if (!parsed.success) throw new ToolInputError("fetch иска текстово поле „id“.");
    const e = catalogById(parsed.data.id);
    if (!e) {
      throw new ToolInputError(
        `Няма инструмент с идентификатор „${parsed.data.id}“. Възможните са: ${CATALOG.map((c) => c.id).join(", ")}.`,
      );
    }
    return withJsonText({
      id: e.id,
      title: e.title,
      text: e.text,
      url: e.url,
      metadata: { aliases: e.aliases.join(" · "), language: "bg", price: "безплатно" },
    });
  },
};

export const TOOLS: ToolDef[] = [
  search,
  fetchTool,
  etiketi,
  vizitki,
  cv,
  pismo,
  gramoti,
  pokani,
  tabelki,
  wifi,
  badzhove,
  obyava,
  vaucheri,
  kalendar,
  menu,
];

export function toolByName(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
