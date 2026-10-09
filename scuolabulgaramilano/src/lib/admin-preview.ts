// Maps a content section key to the anchor on the public site, so the admin
// can jump straight to what they are editing.
const ANCHORS: Record<string, string> = {
  hero: "top",
  about: "chi-siamo",
  school: "scuola",
  courses: "corsi",
  dance: "danza",
  facebook: "facebook",
  contact: "contatti",
  cta: "contatti",
};

// Preview URL on the public site (Italian by default).
export function previewUrl(key: string, locale = "it"): string {
  const anchor = ANCHORS[key];
  return anchor ? `/${locale}#${anchor}` : `/${locale}`;
}
