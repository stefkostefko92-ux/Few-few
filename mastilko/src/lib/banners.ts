import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";

// Банерите се пазят в проста JSON база на сървъра (без истинска БД). Данните
// живеят в MASTILKO_DATA_DIR (по подразбиране <cwd>/data), който на сървъра е
// извън read-only корена и се пренася при деплой заедно с .env.

// Линк: празно, вътрешен път, http(s) или mailto — НЕ javascript: (XSS).
const linkOk = (v: string) =>
  v === "" || /^(https?:\/\/|\/|mailto:)/i.test(v);
// Изображение: само ВЪТРЕШЕН път (/…) — външен URL би пратил IP на посетителя
// към чужд домейн без съгласие (правен одит 2026-07). Външни → чак с consent.
const internalImg = (v: string) => v === "" || /^\/[^/]/.test(v);
// Цвят: само hex, за да няма url()/трекинг през style.
const colorRe = /^#[0-9a-fA-F]{3,8}$/;

export const BannerSchema = z.object({
  id: z.string(),
  title: z.string().max(80).default(""),
  text: z.string().max(200).default(""),
  cta: z.string().max(40).default(""),
  href: z.string().max(300).default("").refine(linkOk, "Невалиден линк"),
  /** По желание: изображение (пълноширок банер). Само вътрешен път (/…). */
  image: z.string().max(300).default("").refine(internalImg, "Изображението трябва да е вътрешен път (/banners/…)"),
  imageAlt: z.string().max(120).default(""),
  bg: z.string().max(20).default("#DE9A32").refine((v) => colorRe.test(v), "Невалиден цвят"),
  fg: z.string().max(20).default("#3A2E28").refine((v) => colorRe.test(v), "Невалиден цвят"),
  /** Къде се показва: всички страници или само началната. */
  placement: z.enum(["all", "home"]).default("all"),
  active: z.boolean().default(true),
  order: z.number().int().default(0),
});
export type Banner = z.infer<typeof BannerSchema>;

const FileSchema = z.array(BannerSchema);

// Банер по подразбиране (докато админът не запише свой) — реклама на Carbon
// Stealth. Показва се веднага след деплой; сменя се/маха от /admin.
const DEFAULT_BANNERS: Banner[] = [
  {
    id: "carbon-stealth",
    title: "",
    text: "",
    cta: "",
    href: "https://carbonstealth.eu",
    image: "/banners/carbon-stealth.png",
    imageAlt: "Carbon Stealth — уеб разработка, ERP системи, SEO оптимизация. Посетете carbonstealth.eu",
    bg: "#0b0f14",
    fg: "#ffffff",
    placement: "all",
    active: true,
    order: 0,
  },
];

function dataDir(): string {
  return process.env.MASTILKO_DATA_DIR || path.join(process.cwd(), "data");
}
function bannersFile(): string {
  return path.join(dataDir(), "banners.json");
}

export async function readBanners(): Promise<Banner[]> {
  try {
    const raw = await fs.readFile(bannersFile(), "utf8");
    const parsed = FileSchema.safeParse(JSON.parse(raw));
    // Невалиден/повреден файл → падаме на подразбиране, не на празно.
    if (!parsed.success) return DEFAULT_BANNERS;
    return parsed.data.sort((a, b) => a.order - b.order);
  } catch {
    // Липсващ файл (още не е пипан админът) → банерът по подразбиране.
    return DEFAULT_BANNERS;
  }
}

/** Само активните, за публично показване, точно за това разположение. */
export async function activeBanners(placement: "all" | "home"): Promise<Banner[]> {
  const all = await readBanners();
  return all.filter((b) => b.active && b.placement === placement);
}

export async function writeBanners(list: Banner[]): Promise<void> {
  const dir = dataDir();
  await fs.mkdir(dir, { recursive: true });
  // Атомичен запис: временен файл + rename, за да не се чете половин JSON.
  const tmp = path.join(dir, `banners.${process.pid}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(list, null, 2), "utf8");
  await fs.rename(tmp, bannersFile());
}
