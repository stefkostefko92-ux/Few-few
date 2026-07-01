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
  z.object({ id: z.string(), type: z.literal("divider") }),
  z.object({ id: z.string(), type: z.literal("spacer"), size: z.enum(["sm", "md", "lg"]) }),
]);

export const blocksSchema = z.array(blockSchema).max(200);

export function parseBlocks(input: unknown): Block[] {
  const res = blocksSchema.safeParse(input);
  return res.success ? (res.data as Block[]) : [];
}

// --- Фабрика за нов блок (стойности по подразбиране) ---

let counter = 0;
export function newBlockId(): string {
  counter += 1;
  return `b${counter}-${counter * 2654435761 % 100000}`;
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
  divider: "Разделител",
  spacer: "Разстояние",
};

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
  // Връзки [етикет](url) — url вече е escaped; валидираме схемата.
  let html = escaped.replace(
    /\[([^\]]{1,200})\]\((https?:&#x2F;&#x2F;[^)\s]+|https?:\/\/[^)\s]+)\)/g,
    (_m, label: string, url: string) => {
      const clean = url.replace(/&#x2F;/g, "/").replace(/&amp;/g, "&");
      const href = safeLinkHref(clean);
      if (!href) return label;
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer nofollow" class="underline">${label}</a>`;
    },
  );
  html = html
    .replace(/\*\*([^*]{1,400})\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]{1,400})_/g, "<em>$1</em>")
    .replace(/\n/g, "<br />");
  return html;
}
