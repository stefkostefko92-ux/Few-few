import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";

// Банерите се пазят в проста JSON база на сървъра (без истинска БД). Данните
// живеят в MASTILKO_DATA_DIR (по подразбиране <cwd>/data), който на сървъра е
// извън read-only корена и се пренася при деплой заедно с .env.

export const BannerSchema = z.object({
  id: z.string(),
  title: z.string().max(80),
  text: z.string().max(200),
  cta: z.string().max(40).default(""),
  href: z.string().max(300).default(""),
  bg: z.string().max(20).default("#DE9A32"),
  fg: z.string().max(20).default("#3A2E28"),
  /** Къде се показва: всички страници или само началната. */
  placement: z.enum(["all", "home"]).default("all"),
  active: z.boolean().default(true),
  order: z.number().int().default(0),
});
export type Banner = z.infer<typeof BannerSchema>;

const FileSchema = z.array(BannerSchema);

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
    return parsed.success ? parsed.data.sort((a, b) => a.order - b.order) : [];
  } catch {
    // Липсващ файл / повреден JSON → няма банери (сайтът работи нормално).
    return [];
  }
}

/**
 * Активните банери за точно това разположение. „all“ = лентата под хедъра на
 * всяка страница; „home“ = само началната (в допълнение към „all“).
 */
export async function activeBanners(placement: "all" | "home"): Promise<Banner[]> {
  const all = await readBanners();
  return all.filter((b) => b.active && b.placement === placement);
}

export async function writeBanners(list: Banner[]): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(bannersFile(), JSON.stringify(list, null, 2), "utf8");
}
