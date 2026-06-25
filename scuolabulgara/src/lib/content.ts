import { prisma } from "./db";
import type { Locale } from "./i18n";
import { DEFAULT_CONTENT, defaultFor } from "./defaults";

let seedChecked = false;

// Fetch a single section (merged with bundled defaults) for one locale.
// Used by lightweight pages (legal, sitemap) that only need a couple of keys.
export async function getOne(locale: Locale, key: string): Promise<Record<string, unknown>> {
  await ensureSeeded();
  try {
    const row = await prisma.content.findUnique({ where: { key } });
    if (row) {
      const parsed = JSON.parse((row as Record<string, string>)[locale] || row.en || "{}");
      if (parsed && Object.keys(parsed).length) return parsed;
    }
  } catch {
    // fall through to defaults
  }
  return defaultFor(key, locale);
}

// Idempotently ensure the content table is populated. Runs once per process
// (so production self-seeds on first hit without needing the tsx dev tool).
export async function ensureSeeded(): Promise<void> {
  if (seedChecked) return;
  try {
    const existing = (await prisma.content.findMany({
      select: { key: true, label: true, order: true },
    })) as { key: string; label: string; order: number }[];
    const byKey = new Map(existing.map((r) => [r.key, r] as const));
    for (const row of DEFAULT_CONTENT) {
      const cur = byKey.get(row.key);
      if (!cur) {
        await prisma.content.create({
          data: {
            key: row.key, group: row.group, label: row.label, order: row.order, enabled: true,
            it: JSON.stringify(row.it), bg: JSON.stringify(row.bg), en: JSON.stringify(row.en),
          },
        });
      } else if (cur.label !== row.label || cur.order !== row.order) {
        // Keep system metadata (label/order) in sync without touching editable content.
        await prisma.content.update({ where: { key: row.key }, data: { label: row.label, order: row.order, group: row.group } });
      }
    }
    seedChecked = true;
  } catch {
    // DB not reachable yet — try again on the next call.
  }
}

// ---- Shapes of each section's JSON (same keys across locales) ----
export type Settings = {
  brandName: string;
  brandSub: string;
  phone: string;
  phoneHref: string;
  email: string;
  address: string;
  facebookUrl: string;
  facebookPageHref: string;
  mapUrl: string;
};

export type Hero = {
  badge: string;
  titleA: string;
  titleAccent: string;
  titleB: string;
  lead: string;
  trust: string;
  stat: string;
  statLabel: string;
};

export type Simple = { eyebrow: string; title: string; lead?: string; body?: string };

export type Feature = { title: string; text: string };
export type About = Simple & { features: Feature[]; tag: string };

export type Card = { icon: string; title: string; text: string; bullets: string[] };
export type Cards = Simple & { items: Card[] };

export type ScheduleRow = { day: string; time: string; title: string; place: string };
export type Dance = Simple & {
  body: string;
  scheduleTitle: string;
  schedule: ScheduleRow[];
  groupNote: string;
  instructorName: string;
  instructorRole: string;
  cta: string;
};

export type Stat = { num: string; label: string };
export type Stats = { items: Stat[] };

export type GalleryTile = { kind: "image" | "green" | "red" | "ink"; src?: string; big?: string; script?: string; small?: string; alt?: string };
export type Gallery = Simple & { tiles: GalleryTile[] };

export type Facebook = Simple & { points: string[] };

export type Contact = Simple & { topics: string[] };

export type Cta = { title: string; body: string; primary: string; secondary: string };

export type ContentMap = {
  settings: Settings;
  hero: Hero;
  about: About;
  school: Cards & { quote: string; quoteCite: string };
  stats: Stats;
  courses: Cards;
  dance: Dance;
  facebook: Facebook;
  gallery: Gallery;
  contact: Contact;
  cta: Cta;
};

export type ContentKey = keyof ContentMap;
