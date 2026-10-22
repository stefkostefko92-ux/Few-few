// Pure CMS helpers shared by the public site and the admin editor. No I/O here,
// so every rule is unit-testable (see __tests__/cms.test.ts).

/** Page sections that the admin can reorder and switch on/off. The hero and its
 *  strip of facts are deliberately excluded: they always open the page. */
export const SECTION_KEYS = [
  "about", "alphabet", "school", "teachers", "courses", "dance", "facebook", "gallery", "documents", "faq", "contact", "cta",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export const isSectionKey = (k: string): k is SectionKey => (SECTION_KEYS as readonly string[]).includes(k);

/** Illustrated brand icons an editor may assign to a card. Restricting the
 *  choice to this list keeps the value out of a free-form image path. */
export const BRAND_ICONS = [
  "presence", "distance", "hybrid", "kids", "adults", "culture",
  "shield-check", "graduation-cap", "person", "location-pin",
  "phone", "envelope", "media-image", "facebook-circle",
] as const;
export const isBrandIcon = (v: unknown): v is string =>
  typeof v === "string" && (BRAND_ICONS as readonly string[]).includes(v);

type Alt = { it: string; bg: string; en: string };

/** Photos shipped with the site, each with its ONE canonical description in the
 *  three languages. Shown in the admin picker next to the user's own uploads,
 *  and picking one fills its description in automatically — so swapping a photo
 *  can't leave screen readers announcing what the previous one showed. */
export const BUNDLED_MEDIA: { url: string; label: string; alt: Alt }[] = [
  {
    url: "/assets/img/photos/ballerini-in-costume.webp", label: "Танцьори в носии",
    alt: {
      it: "Ballerini in costume tradizionale bulgaro durante un'esibizione",
      bg: "Танцьори в традиционни български носии по време на изпълнение",
      en: "Dancers in traditional Bulgarian costume during a performance",
    },
  },
  {
    url: "/assets/img/photos/comunita-in-costume.webp", label: "Общността в носии",
    alt: {
      it: "La comunità della scuola riunita in costumi tradizionali bulgari",
      bg: "Общността на училището, събрана в традиционни български носии",
      en: "The school community gathered in traditional Bulgarian costumes",
    },
  },
  {
    url: "/assets/img/photos/docenti.webp", label: "Учителките",
    alt: {
      it: "Le insegnanti della scuola con i fiori, davanti alle lettere dell'alfabeto cirillico",
      bg: "Учителките от училището с цветя пред буквите на кирилицата",
      en: "The school's teachers holding flowers in front of Cyrillic letters",
    },
  },
  {
    url: "/assets/img/photos/gruppo-veselie.webp", label: "Група „Веселие“",
    alt: {
      it: "Il gruppo di danza Veselie con la bandiera bulgara",
      bg: "Танцова група „Веселие“ с българското знаме",
      en: "The Veselie dance group with the Bulgarian flag",
    },
  },
  {
    url: "/assets/img/photos/horo.webp", label: "Хоро",
    alt: {
      it: "Il gruppo Veselie balla l'horo tenendosi per mano",
      bg: "Група „Веселие“ играе хоро, хванати за ръце",
      en: "The Veselie group dancing the horo hand in hand",
    },
  },
  {
    url: "/assets/img/photos/festa-della-scuola.webp", label: "Празник на училището",
    alt: {
      it: "Bambini e famiglie della scuola in festa all'aperto con la bandiera bulgara",
      bg: "Деца и семейства от училището на празник на открито с българското знаме",
      en: "Children and families of the school celebrating outdoors with the Bulgarian flag",
    },
  },
  {
    url: "/assets/img/photos/bandiera-fortezza.webp", label: "Знаме над крепост",
    alt: {
      it: "La bandiera bulgara sventola tra le mura di una fortezza medievale",
      bg: "Българското знаме се вее между стените на средновековна крепост",
      en: "The Bulgarian flag flying between the walls of a medieval fortress",
    },
  },
  {
    url: "/assets/img/photos/rose-damascena.webp", label: "Маслодайна роза",
    alt: { it: "Primo piano di una rosa damascena", bg: "Маслодайна роза в близък план", en: "Close-up of a Damask rose" },
  },
  {
    url: "/assets/img/photos/community.webp", label: "Общността (стара снимка)",
    alt: {
      it: "La comunità della scuola riunita in costumi tradizionali bulgari",
      bg: "Общността на училището, събрана в традиционни български носии",
      en: "The school community gathered in traditional Bulgarian costumes",
    },
  },
  { url: "/assets/img/brand/logo.webp", label: "Лого", alt: { it: "Logo Qui Bulgaria", bg: "Лого на Qui Bulgaria", en: "Qui Bulgaria logo" } },
];

/** Canonical description of a bundled photo, or undefined for an upload. */
export const bundledAlt = (url: string): Alt | undefined => BUNDLED_MEDIA.find((m) => m.url === url)?.alt;

/** The description field that belongs to a picture field, if it has one. */
export const altKeyFor = (imageKey: string): string | undefined =>
  imageKey === "image" ? "imageAlt" : imageKey === "src" ? "alt" : undefined;

/** Keys whose value is the same in every language: pictures, icons, numbers,
 *  links and contact details. The editor writes them to all three locales at
 *  once, so changing a photo in the Italian tab can't leave the Bulgarian and
 *  English pages showing the old one. */
const SHARED = new Set([
  "icon", "phone", "phoneHref", "email", "facebookUrl", "facebookPageHref", "mapUrl",
  "latitude", "longitude", "foundingDate", "postalCode", "country", "updated",
  // the alphabet: the letter, its transliteration and the Bulgarian word
  "letter", "latin", "word", "audio",
  // a document (statute, newspaper issue) is one file for every language
  "file",
]);
export const isImageKey = (k: string) => k === "src" || k === "logo" || /^(image|photo)$/i.test(k) || /(Image|Photo)$/.test(k);
export const isSharedKey = (k: string) => SHARED.has(k) || isImageKey(k);

/** Same "kind" of JSON value — used so a stored value of the wrong type (e.g.
 *  an old string where the schema now wants a list) never reaches a renderer. */
function sameKind(def: unknown, val: unknown): boolean {
  if (val === undefined || val === null) return false;
  if (Array.isArray(def)) return Array.isArray(val);
  return typeof def === typeof val && !Array.isArray(val);
}

/**
 * Merge a stored section over its defaults. The defaults define the schema:
 *  - every default key is present in the result (new fields appear automatically);
 *  - a stored value wins only when it has the same kind as the default;
 *  - stored keys that are no longer in the schema are dropped;
 *  - an emptied picture falls back to the default instead of leaving a hole.
 */
export function mergeSection(def: Record<string, unknown>, stored: unknown): Record<string, unknown> {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { ...def };
  const s = stored as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, dv] of Object.entries(def)) {
    const sv = s[k];
    if (isImageKey(k) && sv === "") out[k] = dv;
    else if (Array.isArray(dv) && Array.isArray(sv) && isPlainObject(dv[0])) out[k] = sv.map((item) => mergeItem(dv[0] as Record<string, unknown>, item));
    else out[k] = sameKind(dv, sv) ? sv : dv;
  }
  return out;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A list item saved before a field was added (e.g. the icon of an „About“
 *  feature) gets that field too, so the editor can show it. The template is the
 *  first default item: a shared field (icon, photo) takes its value, a text field
 *  starts empty — never another item's wording. */
function mergeItem(tpl: Record<string, unknown>, item: unknown): Record<string, unknown> {
  if (!isPlainObject(item)) return { ...tpl };
  const out: Record<string, unknown> = {};
  for (const [k, dv] of Object.entries(tpl)) {
    const sv = item[k];
    if (sameKind(dv, sv)) out[k] = sv;
    else if (isSharedKey(k) || Array.isArray(dv)) out[k] = Array.isArray(dv) ? [] : dv;
    else out[k] = typeof dv === "string" ? "" : dv;
  }
  return out;
}

/** Only images served by this site itself. An external URL would hand every
 *  visitor's IP to a third party (a GDPR problem) and `//host` is protocol-
 *  relative, so both are refused. */
export function safeImage(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const s = v.trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("..")) return fallback;
  return s;
}

/** Outbound links an editor can set (Facebook, map). Anything that isn't plain
 *  http(s) — notably `javascript:` — is neutralised, since it would run on click. */
export function safeHref(v: unknown, fallback = "#"): string {
  if (typeof v !== "string") return fallback;
  const s = v.trim();
  return /^https?:\/\//i.test(s) ? s : fallback;
}

const BRAND_KEYWORD = "Carbon Stealth";

/** Editor keywords, trimmed and de-duplicated. The repository rule — every site
 *  carries at least five keywords and one is always "Carbon Stealth" — is
 *  enforced here, so an admin edit can neither drop the attribution nor thin
 *  the list below five (it is topped up from `fallback`). */
export function finalKeywords(list: string[], fallback: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (k: string) => {
    const v = k.trim();
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  };
  list.forEach(add);
  for (const f of fallback) { if (out.length >= 5) break; add(f); }
  if (!seen.has(BRAND_KEYWORD.toLowerCase())) out.push(BRAND_KEYWORD);
  return out;
}

// ---- Audio (pronunciation of the alphabet words) ---------------------------
export const AUDIO_EXT = ["mp3", "m4a", "ogg", "webm", "wav"] as const;
/** Field holding a sound file; like a picture, the same in every language. */
export const isAudioKey = (k: string) => k === "audio";
/** Only sound files uploaded to this site (no external URLs, no traversal). */
export function safeAudio(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (!(s.startsWith("/uploads/") || s.startsWith("/assets/audio/")) || s.includes("..") || s.includes("//")) return "";
  return new RegExp(`\\.(${AUDIO_EXT.join("|")})$`, "i").test(s) ? s : "";
}

// ---- Documents (PDF: statute, forms, the school newspaper) -----------------
/** Field holding a PDF; like a picture, the same in every language. */
export const isFileKey = (k: string) => k === "file";
/** A PDF of this site (uploaded or bundled), or a plain https link to one —
 *  e.g. an issue still on the school's previous website. Nothing else. */
export function safeFile(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  if (!(s.startsWith("/uploads/") || s.startsWith("/assets/docs/")) || s.includes("..") || s.includes("//")) return "";
  return /\.pdf$/i.test(s) ? s : "";
}

// ---- Items not yet translated -----------------------------------------------
// The editor adds a list item to all three languages at once, empty in the two
// it wasn't written in. Hiding such an item made new content look lost („пише,
// че е на сайта, но не се показва“). Instead it shows in the language it was
// written in until someone translates it.

/** No text of its own in this language: every text field empty (pictures,
 *  icons and other shared fields don't count). */
export function isBlankItem(v: unknown): boolean {
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.every(isBlankItem);
  if (!isPlainObject(v)) return true;
  return Object.entries(v).every(([k, x]) => isSharedKey(k) || isBlankItem(x));
}

const copyText = (into: Record<string, unknown>, from: Record<string, unknown>) => {
  for (const k of Object.keys(into)) {
    if (isSharedKey(k)) continue;
    const src = from[k];
    if (typeof src === "string" || Array.isArray(src)) into[k] = structuredClone(src);
  }
};

function fillArray(arr: unknown[], others: unknown[][]): unknown[] {
  return arr.map((v, i) => {
    const alt = others.map((o) => o?.[i]).filter((x) => x !== undefined && !isBlankItem(x));
    if (typeof v === "string") return v.trim() === "" && typeof alt[0] === "string" ? alt[0] : v;
    if (!isPlainObject(v)) return v;
    const out: Record<string, unknown> = { ...v };
    if (isBlankItem(v) && isPlainObject(alt[0])) {
      copyText(out, alt[0]);
      return out;
    }
    // A translated item may still hold a newly added bullet or paragraph.
    for (const [k, x] of Object.entries(out)) {
      if (Array.isArray(x)) out[k] = fillArray(x, others.map((o) => (isPlainObject(o?.[i]) ? (o[i] as Record<string, unknown>)[k] as unknown[] : [])));
    }
    return out;
  });
}

/** Every list in `doc` (one language), with untranslated items filled from the
 *  first other language that has them. Plain fields are left alone: emptying
 *  one is how an editor hides it. */
export function fillUntranslated(doc: Record<string, unknown>, others: Record<string, unknown>[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...doc };
  for (const [k, v] of Object.entries(doc)) {
    if (Array.isArray(v)) out[k] = fillArray(v, others.map((o) => (Array.isArray(o[k]) ? (o[k] as unknown[]) : [])));
  }
  return out;
}

/** Keys whose lists are per-language on purpose (search keywords). */
export const NO_FALLBACK = new Set(["seo", "ui"]);
