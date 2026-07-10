import { z } from "zod";

// Внасяне от Визитка (vizitka-bg.com): потребителят идва с еднократен токен;
// Мастилко изтегля публичните данни на визитката от API-то и напълва редактора.
// Адресът на Визитка е конфигуруем (за локална разработка/друга среда).
export const VIZITKA_URL = (
  process.env.NEXT_PUBLIC_VIZITKA_URL || "https://vizitka-bg.com"
).replace(/\/+$/, "");

export const vizitkaApiUrl = (token: string) =>
  `${VIZITKA_URL}/api/print/${encodeURIComponent(token)}`;

// „Направи я жива визитка" (Мастилко → Визитка): праща данните на дизайна към
// регистрацията на Визитка, за да напълни новата (скрита) визитка. Само текстови
// полета в URL-а; Визитка НЕ попълва имейл (privacy-by-default).
export function vizitkaRegisterUrl(card: {
  name?: string;
  role?: string;
  company?: string;
  phone?: string;
  website?: string;
  type?: string;
}): string {
  const q = new URLSearchParams({ from: "mastilko" });
  const put = (k: string, v?: string) => {
    const s = (v ?? "").trim().slice(0, 200);
    if (s) q.set(k, s);
  };
  put("name", card.name);
  put("role", card.role);
  put("company", card.company);
  put("phone", card.phone);
  put("website", card.website);
  if (card.type === "company") q.set("type", "company");
  return `${VIZITKA_URL}/register?${q.toString()}`;
}

// Отговорът от Визитка (buildPrintPayload). Валидираме недоверен вход защитно.
const str = z.string().optional();
export const VizitkaPayloadSchema = z
  .object({
    source: str,
    display_name: str,
    headline: str,
    company: str,
    phone: str,
    email: str,
    website: str,
    bio: str,
    card_url: str,
    photo_url: z.string().nullable().optional(),
    style: z
      .object({ theme: str, accent: str, avatar_shape: str, font: str })
      .partial()
      .optional(),
  })
  .passthrough();

export type VizitkaPayload = z.infer<typeof VizitkaPayloadSchema>;

/** Частично състояние на визитния редактор (CardStudio). */
export interface CardPatch {
  name: string;
  role: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  slogan: string;
  qr: boolean;
  logo: string;
  customColors?: boolean;
  cacc?: string;
  font?: string;
}

const clip = (v: unknown, n = 60) => String(v ?? "").trim().slice(0, n);
const stripProto = (v: string) => v.replace(/^https?:\/\//, "");
const HEX = /^#[0-9a-fA-F]{6}$/;

// Шрифтовете на Визитка → най-близкия шрифт в Мастилко (system → по подразбиране).
const FONT_MAP: Record<string, string> = {
  serif: "lora",
  rounded: "nunito",
  mono: "jetbrains",
};

// Превръща отговора от Визитка в патч за CardStudio. Чиста функция (за тестове).
export function mapVizitkaToCard(raw: unknown): CardPatch {
  const p = VizitkaPayloadSchema.parse(raw);
  const website = clip(stripProto((p.website || p.card_url || "").trim()));

  const patch: CardPatch = {
    name: clip(p.display_name),
    role: clip(p.headline),
    company: clip(p.company),
    phone: clip(p.phone),
    email: clip(p.email),
    website,
    slogan: clip(p.bio),
    qr: true, // имаме контактите → включваме vCard QR по подразбиране
    logo: typeof p.photo_url === "string" ? p.photo_url.slice(0, 500000) : "",
  };

  const accent = p.style?.accent ?? "";
  if (HEX.test(accent)) {
    patch.customColors = true;
    patch.cacc = accent.toLowerCase();
  }
  const font = FONT_MAP[p.style?.font ?? ""];
  if (font) patch.font = font;

  return patch;
}
