// Чисто ядро на AI асистента за текст (без мрежа/ключове) — за да е тестваемо и
// да се ползва и от клиента (етикети на бутоните). Мрежовата част е в assist.ts.

export type AssistAction =
  | "improve"
  | "shorten"
  | "expand"
  | "professional"
  | "friendly"
  | "translate-en"
  | "translate-bg"
  | "alt";

export const ASSIST_ACTIONS: { action: AssistAction; label: string; hint: string }[] = [
  { action: "improve", label: "✨ Подобри", hint: "По-ясно и гладко" },
  { action: "shorten", label: "Скъси", hint: "По-кратко" },
  { action: "expand", label: "Разшири", hint: "Повече детайли" },
  { action: "professional", label: "Официално", hint: "Делови тон" },
  { action: "friendly", label: "Приятелски", hint: "Топъл тон" },
  { action: "translate-en", label: "EN", hint: "Преведи на английски" },
  { action: "translate-bg", label: "BG", hint: "Преведи на български" },
];

const INSTRUCTIONS: Record<AssistAction, string> = {
  improve: "Подобри текста: направи го по-ясен, гладък и добре структуриран, без да сменяш смисъла или езика.",
  shorten: "Съкрати текста до най-същественото, без да губиш ключовата информация. Запази езика.",
  expand: "Разшири текста с 1–2 смислени изречения повече детайл, по същата тема и език.",
  professional: "Пренапиши текста в делови, официален тон, подходящ за институция или бизнес. Запази езика.",
  friendly: "Пренапиши текста в топъл, приятелски, достъпен тон. Запази езика.",
  "translate-en": "Преведи текста на естествен английски. Върни само превода.",
  "translate-bg": "Преведи текста на естествен български. Върни само превода.",
  alt: "Върни кратко описание (alt текст) на български, до 120 знака, което обяснява какво се вижда. Само описанието.",
};

export function assistSystemPrompt(action: AssistAction): string {
  return [
    "Ти си редактор на съдържание за уебсайтове.",
    INSTRUCTIONS[action],
    "Позволен е само лек markdown: **удебелен**, _курсив_, [текст](https://...).",
    "Върни САМО крайния текст — без кавички около него, без обяснения, без ограждане в кодов блок.",
  ].join(" ");
}

// Почиства отговора на модела от честите обвивки (кодов блок, водещи кавички).
export function cleanAssistOutput(raw: string): string {
  let t = raw.trim();
  // Махни ограждащ ``` … ``` блок.
  const fence = t.match(/^```[a-z]*\n?([\s\S]*?)\n?```$/i);
  if (fence) t = fence[1].trim();
  // Махни водещи/затварящи прави или типографски кавички около целия текст.
  if (t.length >= 2 && /^["“„']/.test(t) && /["”“']$/.test(t)) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

// Детерминиран резерв, когато няма AI ключ. Прави каквото може без модел; за
// операции, изискващи модел (превод/подобрение), връща оригинала непокътнат.
export function rulesFallback(action: AssistAction, text: string): string {
  const t = text.trim();
  if (action === "shorten") {
    // Първо изречение като кратка версия.
    const first = t.split(/(?<=[.!?])\s/)[0];
    return first || t;
  }
  if (action === "alt") {
    return t.replace(/\s+/g, " ").slice(0, 120);
  }
  // improve/expand/professional/friendly/translate — без модел не променяме.
  return t;
}
