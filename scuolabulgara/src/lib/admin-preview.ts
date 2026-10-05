// Maps a content key to the place on the public site where it shows, so the
// admin can jump straight to what they are editing.
const ANCHORS: Record<string, string> = {
  hero: "top",
  about: "chi-siamo",
  stats: "numeri",
  school: "scuola",
  courses: "corsi",
  dance: "danza",
  facebook: "facebook",
  gallery: "galleria",
  faq: "faq",
  contact: "contatti",
  cta: "contatti",
};
const LEGAL_PAGES: Record<string, string> = {
  legal_privacy: "privacy",
  legal_cookie: "cookie",
  legal_termini: "termini",
};

// Preview URL on the public site (Italian by default).
export function previewUrl(key: string, locale = "it"): string {
  if (LEGAL_PAGES[key]) return `/${locale}/${LEGAL_PAGES[key]}`;
  const anchor = ANCHORS[key];
  return anchor ? `/${locale}#${anchor}` : `/${locale}`;
}
