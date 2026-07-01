import { z } from "zod";

// Блокове на вградения конструктор на страници. Плосък списък от блокове;
// всеки блок има id, type и props. Валидира се при запис (Zod). Текстът се
// рендира безопасно (първо escape, после лек markdown) — виж renderInline.

export type Align = "left" | "center" | "right";
export type SpacerSize = "sm" | "md" | "lg";

export type Block =
  | { id: string; type: "heading"; level: 1 | 2 | 3; text: string; align: Align }
  | { id: string; type: "text"; text: string; align: Align }
  | { id: string; type: "image"; url: string; alt: string; align: Align; rounded: boolean }
  | { id: string; type: "button"; label: string; href: string; align: Align; variant: "primary" | "ghost" }
  | { id: string; type: "hero"; title: string; subtitle: string; align: Align; buttonLabel: string; buttonHref: string }
  | { id: string; type: "gallery"; images: { url: string; alt: string }[] }
  | { id: string; type: "columns"; left: string; right: string }
  | { id: string; type: "faq"; items: { q: string; a: string }[] }
  | { id: string; type: "testimonials"; items: { quote: string; author: string; role: string }[] }
  | { id: string; type: "pricing"; plans: { name: string; price: string; period: string; features: string[]; href: string }[] }
  | { id: string; type: "video"; url: string }
  | { id: string; type: "map"; url: string }
  | { id: string; type: "form"; title: string; buttonLabel: string; successMessage: string }
  | { id: string; type: "divider" }
  | { id: string; type: "spacer"; size: SpacerSize };

export type BlockType = Block["type"];

// --- Zod валидация (граница при запис) ---

const align = z.enum(["left", "center", "right"]);
const httpOrEmpty = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => {
    if (u === "") return true;
    try {
      return /^https?:$/.test(new URL(u).protocol);
    } catch {
      return false;
    }
  }, "Само http(s) адреси.");

const blockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("heading"), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), text: z.string().max(300), align }),
  z.object({ id: z.string(), type: z.literal("text"), text: z.string().max(8000), align }),
  z.object({ id: z.string(), type: z.literal("image"), url: httpOrEmpty, alt: z.string().max(300), align, rounded: z.boolean() }),
  z.object({ id: z.string(), type: z.literal("button"), label: z.string().max(120), href: httpOrEmpty, align, variant: z.enum(["primary", "ghost"]) }),
  z.object({ id: z.string(), type: z.literal("hero"), title: z.string().max(200), subtitle: z.string().max(400), align, buttonLabel: z.string().max(120), buttonHref: httpOrEmpty }),
  z.object({ id: z.string(), type: z.literal("gallery"), images: z.array(z.object({ url: httpOrEmpty, alt: z.string().max(300) })).max(24) }),
  z.object({ id: z.string(), type: z.literal("columns"), left: z.string().max(4000), right: z.string().max(4000) }),
  z.object({ id: z.string(), type: z.literal("faq"), items: z.array(z.object({ q: z.string().max(300), a: z.string().max(2000) })).max(30) }),
  z.object({ id: z.string(), type: z.literal("testimonials"), items: z.array(z.object({ quote: z.string().max(600), author: z.string().max(120), role: z.string().max(120) })).max(20) }),
  z.object({ id: z.string(), type: z.literal("pricing"), plans: z.array(z.object({ name: z.string().max(80), price: z.string().max(40), period: z.string().max(40), features: z.array(z.string().max(160)).max(15), href: httpOrEmpty })).max(6) }),
  z.object({ id: z.string(), type: z.literal("video"), url: httpOrEmpty }),
  z.object({ id: z.string(), type: z.literal("map"), url: httpOrEmpty }),
  z.object({ id: z.string(), type: z.literal("form"), title: z.string().max(160), buttonLabel: z.string().max(80), successMessage: z.string().max(300) }),
  z.object({ id: z.string(), type: z.literal("divider") }),
  z.object({ id: z.string(), type: z.literal("spacer"), size: z.enum(["sm", "md", "lg"]) }),
]);

export const blocksSchema = z.array(blockSchema).max(200);

export function parseBlocks(input: unknown): Block[] {
  const res = blocksSchema.safeParse(input);
  return res.success ? (res.data as Block[]) : [];
}

// --- Фабрика за нов блок (стойности по подразбиране) ---

export function newBlockId(): string {
  // Уникален и стабилен при рестарт/няколко инстанции (без сблъсъци на React key).
  return `b-${globalThis.crypto.randomUUID()}`;
}

export function makeBlock(type: BlockType): Block {
  const id = newBlockId();
  switch (type) {
    case "heading":
      return { id, type, level: 2, text: "Ново заглавие", align: "left" };
    case "text":
      return { id, type, text: "Нов текст. Ползвайте **удебелен**, _курсив_ и [връзки](https://example.com).", align: "left" };
    case "image":
      return { id, type, url: "", alt: "", align: "center", rounded: false };
    case "button":
      return { id, type, label: "Бутон", href: "", align: "left", variant: "primary" };
    case "hero":
      return { id, type, title: "Добре дошли", subtitle: "Кратко подзаглавие тук.", align: "center", buttonLabel: "Научете повече", buttonHref: "" };
    case "gallery":
      return { id, type, images: [] };
    case "columns":
      return { id, type, left: "Лява колона. **Удебелен** и _курсив_ текст.", right: "Дясна колона. Опишете услуга или предимство." };
    case "faq":
      return { id, type, items: [{ q: "Често задаван въпрос?", a: "Кратък ясен отговор." }] };
    case "testimonials":
      return { id, type, items: [{ quote: "Страхотна услуга и внимание към детайла.", author: "Иван Петров", role: "Клиент" }] };
    case "pricing":
      return { id, type, plans: [{ name: "Стандартен", price: "20 лв.", period: "/месец", features: ["Функция едно", "Функция две"], href: "" }] };
    case "video":
      return { id, type, url: "" };
    case "map":
      return { id, type, url: "" };
    case "form":
      return { id, type, title: "Свържете се с нас", buttonLabel: "Изпрати", successMessage: "Благодарим! Ще се свържем с вас скоро." };
    case "divider":
      return { id, type };
    case "spacer":
      return { id, type, size: "md" };
  }
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Заглавие",
  text: "Текст",
  image: "Снимка",
  button: "Бутон",
  hero: "Хиро секция",
  gallery: "Галерия",
  columns: "Две колони",
  faq: "Въпроси (FAQ)",
  testimonials: "Отзиви",
  pricing: "Цени",
  video: "Видео",
  map: "Карта",
  form: "Форма за контакт",
  divider: "Разделител",
  spacer: "Разстояние",
};

// Извлича безопасен embed адрес за видео (само YouTube/Vimeo). null → не рендира.
export function videoEmbedSrc(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id && /^[\w-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (/^[\w-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d{6,12}$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    /* невалиден URL */
  }
  return null;
}

// Валиден embed адрес за карта — само OpenStreetMap „Споделяне → HTML“ iframe
// (https://www.openstreetmap.org/export/embed.html?bbox=…&marker=…). Приемаме
// само този хост и път, за да няма чужди cookies/тракери и счупени карти.
export function mapEmbedSrc(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "openstreetmap.org" && u.pathname === "/export/embed.html") {
      return u.href;
    }
  } catch {
    /* невалиден URL */
  }
  return null;
}

// --- Безопасно рендиране на текст ---
// Първо escape на целия текст, после прилагаме само нашите тагове от лек
// markdown. Така потребителски HTML никога не се изпълнява (няма XSS).

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeLinkHref(raw: string): string | null {
  try {
    const u = new URL(raw);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

// Връща безопасен HTML низ (за dangerouslySetInnerHTML) от лек markdown.
export function renderInline(text: string): string {
  const escaped = escapeHtml(text);

  // Първо изваждаме връзките в плейсхолдъри (без markdown знаци), за да не ги
  // засегнат emphasis-регексите по-долу (иначе `_` в target="_blank" се чупи).
  const links: string[] = [];
  let html = escaped.replace(
    /\[([^\]]{1,200})\]\((https?:&#x2F;&#x2F;[^)\s]+|https?:\/\/[^)\s]+)\)/g,
    (_m, label: string, url: string) => {
      const clean = url.replace(/&#x2F;/g, "/").replace(/&amp;/g, "&");
      const href = safeLinkHref(clean);
      if (!href) return label;
      const i = links.length;
      links.push(
        `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer nofollow" class="underline">${label}</a>`,
      );
      return ` L${i} `;
    },
  );

  html = html
    .replace(/\*\*([^*]{1,400})\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]{1,400})_/g, "<em>$1</em>")
    .replace(/\n/g, "<br />");

  // Връщаме връзките на мястото на плейсхолдърите.
  html = html.replace(/ L(\d+) /g, (_m, i: string) => links[Number(i)] ?? "");
  return html;
}
