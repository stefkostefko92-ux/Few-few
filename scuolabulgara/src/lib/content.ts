import { prisma } from "./db";
import type { Dict, Locale } from "./i18n";
import { DEFAULT_CONTENT, defaultFor } from "./defaults";
import { NO_FALLBACK, SECTION_KEYS, fillUntranslated, isSectionKey, mergeSection, type SectionKey } from "./cms";
import { upgradeStored } from "./content-upgrade";

let seedChecked = false;

// Idempotently ensure the content table is populated. Runs once per process
// (so production self-seeds on first hit without needing the tsx dev tool).
export async function ensureSeeded(): Promise<void> {
  if (seedChecked) return;
  try {
    const existing = await prisma.content.findMany({ select: { key: true, label: true, group: true, it: true, bg: true, en: true } });
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
      } else if (cur.label !== row.label || cur.group !== row.group) {
        // Keep the system label/group in sync. `order` is NOT touched: once a row
        // exists the editor owns it, so a redeploy never undoes their reordering.
        await prisma.content.update({ where: { key: row.key }, data: { label: row.label, group: row.group } });
      }
      // Rows saved under an older version of the site: untouched old defaults
      // move to the new ones, edited text is kept in the new shape.
      if (cur) {
        const data: Partial<Record<Locale, string>> = {};
        for (const l of ["it", "bg", "en"] as const) {
          let parsed: unknown;
          try { parsed = JSON.parse(cur[l] || "{}"); } catch { continue; }
          const up = upgradeStored(row.key, l, parsed, row[l]);
          if (up.changed) data[l] = JSON.stringify(up.value);
        }
        if (Object.keys(data).length) await prisma.content.update({ where: { key: row.key }, data });
      }
    }
    seedChecked = true;
  } catch {
    // DB not reachable yet — try again on the next call.
  }
}

type Row = { key: string; it: string; bg: string; en: string; enabled: boolean; order: number };

function parseLocale(row: Row | undefined, locale: Locale): unknown {
  if (!row) return undefined;
  try {
    return JSON.parse(row[locale] || row.en || "{}");
  } catch {
    return undefined;
  }
}

/** A stored row in one language, merged over its defaults; list items not yet
 *  translated into it show in the language they were written in (Italian
 *  first, then Bulgarian, then English). */
function resolve(key: string, row: Row | undefined, locale: Locale): Record<string, unknown> {
  const doc = mergeSection(defaultFor(key, locale), parseLocale(row, locale));
  if (!row || NO_FALLBACK.has(key)) return doc;
  const others = (["it", "bg", "en"] as const).filter((l) => l !== locale);
  return fillUntranslated(doc, others.map((l) => mergeSection(defaultFor(key, l), parseLocale(row, l))));
}

/** One section, merged over its defaults for a locale (lightweight pages). */
export async function getOne<K extends ContentKey>(locale: Locale, key: K): Promise<ContentMap[K]> {
  await ensureSeeded();
  let row: Row | undefined;
  try {
    row = (await prisma.content.findUnique({ where: { key } })) ?? undefined;
  } catch {
    // fall through to defaults
  }
  return resolve(key, row, locale) as ContentMap[K];
}

export type Site = {
  get: <K extends ContentKey>(key: K) => ContentMap[K];
  enabled: (key: string) => boolean;
  /** Reorderable sections, in the editor's order, already filtered to enabled ones. */
  sections: SectionKey[];
  /** Interface-wording overrides for this locale. */
  ui: Dict;
};

/** Everything the public page needs, from a single query. Falls back to the
 *  bundled defaults when the database isn't reachable, so the site always renders. */
export async function loadSite(locale: Locale): Promise<Site> {
  let rows: Row[] = [];
  try {
    await ensureSeeded();
    rows = await prisma.content.findMany();
  } catch {
    // DB not ready yet → bundled defaults.
  }
  const byKey = new Map(rows.map((r) => [r.key, r] as const));

  const get = <K extends ContentKey>(key: K) => resolve(key, byKey.get(key), locale) as ContentMap[K];
  const enabled = (key: string) => byKey.get(key)?.enabled ?? true;

  const orderOf = (k: SectionKey) =>
    byKey.get(k)?.order ?? DEFAULT_CONTENT.find((r) => r.key === k)?.order ?? 99;
  const sections = [...SECTION_KEYS]
    .sort((a, b) => orderOf(a) - orderOf(b) || SECTION_KEYS.indexOf(a) - SECTION_KEYS.indexOf(b))
    .filter((k) => enabled(k));

  const uiRaw = get("ui") as Record<string, unknown>;
  const ui: Dict = Object.fromEntries(
    Object.entries(uiRaw).filter((e): e is [string, string] => typeof e[1] === "string"),
  );

  return { get, enabled, sections, ui };
}

export { isSectionKey };

// ---- Shapes of each section's JSON (same keys across locales) ----
type Pictured = { image: string; imageAlt: string };

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
  logo: string;
};

export type Highlight = { text: string };
export type Hero = Pictured & {
  badge: string;
  title: string;
  lead: string;
  highlights: Highlight[];
};

export type Simple = { title: string; lead?: string; body?: string };

export type Feature = { title: string; text: string };
export type About = Simple & Pictured & { body: string; motto: string; features: Feature[] };

export type Letter = { letter: string; latin: string; word: string; meaning: string; audio: string };
export type Alphabet = { title: string; lead: string; letters: Letter[] };

export type Card = { icon: string; title: string; text: string; bullets: string[] };
export type Cards = Simple & { items: Card[] };
export type School = Cards & Pictured & { body: string; quote: string; quoteCite: string };

export type ScheduleRow = { day: string; time: string; place: string };
export type Dance = Simple & Pictured & {
  body: string;
  scheduleTitle: string;
  schedule: ScheduleRow[];
  groupNote: string;
  story: string;
  instructorPhoto: string;
  instructorName: string;
  instructorRole: string;
  instructorBio: string;
  cta: string;
};

export type Teacher = { photo: string; fullName: string; role: string };
export type Teachers = Simple & { items: Teacher[] };

export type DocFile = { title: string; text: string; file: string };
export type Issue = DocFile & { coverImage: string };
export type Documents = Simple & { items: DocFile[]; issuesTitle: string; issues: Issue[] };

export type GalleryPhoto = { src: string; caption: string; alt: string };
export type Gallery = Simple & { photos: GalleryPhoto[] };

export type Facebook = Simple & { points: string[] };

export type Contact = Simple & { topics: string[] };

export type Cta = { title: string; body: string; primary: string; secondary: string };

export type FaqItem = { q: string; a: string };
export type Faq = { title: string; items: FaqItem[] };

export type Seo = { title: string; description: string; keywords: string[]; shareImage: string; cardTitle: string; cardText: string };

export type Org = {
  name: string;
  alternateName: string;
  streetAddress: string;
  postalCode: string;
  locality: string;
  region: string;
  country: string;
  latitude: string;
  longitude: string;
  foundingDate: string;
};

export type LegalSectionDoc = { h: string; p: string[]; list: string[] };
export type LegalDocContent = { title: string; intro: string; updated: string; sections: LegalSectionDoc[] };

export type ContentMap = {
  settings: Settings;
  hero: Hero;
  about: About;
  school: School;
  teachers: Teachers;
  alphabet: Alphabet;
  courses: Cards;
  dance: Dance;
  facebook: Facebook;
  gallery: Gallery;
  documents: Documents;
  faq: Faq;
  contact: Contact;
  cta: Cta;
  seo: Seo;
  org: Org;
  ui: Dict;
  legal_privacy: LegalDocContent;
  legal_cookie: LegalDocContent;
  legal_termini: LegalDocContent;
};

export type ContentKey = keyof ContentMap;
