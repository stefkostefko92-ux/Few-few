// Промените от панела (/admin) върху съдържанието в репото. Сървърът валидира всичко (zod) и превръща
// текста в екраниран HTML ПРЕДИ да запише JSON-а; тук само се прилага. Изпълнява се веднъж за процес
// (build.mjs), затова мутирането на модулите е безопасно.

import { CONTACT } from "./config.mjs";
import { SERVIZI, BY_KEY } from "./content/servizi.mjs";
import { GUIDE } from "./pages/guida.mjs";
import { FAQ_HOME } from "./pages/home.mjs";
import { TERMINI } from "./pages/risorse.mjs";
import { guida } from "./routes.mjs";

const CAMPI_SERVIZIO = ["title", "description", "keywords", "h1", "lead", "menu", "nome", "perChi", "comprende", "fasi", "consegne", "limiti", "faq"];
const CAMPI_GUIDA = ["menu", "title", "description", "keywords", "h1", "lead", "sezioni", "faq", "fonti", "correlati", "howto", "published", "modified"];

function pick(src, campi) {
  return Object.fromEntries(campi.filter((k) => src[k] !== undefined).map((k) => [k, src[k]]));
}

export function applyOverrides(ov) {
  if (!ov || typeof ov !== "object") return;
  if (ov.site) {
    if (ov.site.telefono) {
      CONTACT.phone = ov.site.telefono;
      CONTACT.phoneHref = `tel:${ov.site.telefono.replace(/[^\d+]/g, "")}`;
      CONTACT.phoneSchema = ov.site.telefono.trim().replace(/\s+/g, "-");
    }
    if (ov.site.email) CONTACT.email = ov.site.email;
    if (Array.isArray(ov.site.orari)) CONTACT.hours = ov.site.orari;
  }
  for (const [key, dati] of Object.entries(ov.servizi ?? {})) {
    if (BY_KEY[key]) Object.assign(BY_KEY[key], pick(dati, CAMPI_SERVIZIO));
  }
  for (const [slug, dati] of Object.entries(ov.guide ?? {})) {
    const i = GUIDE.findIndex((g) => g.slug === slug);
    if (dati.nascosta) {
      if (i >= 0) GUIDE.splice(i, 1);
      continue;
    }
    if (i >= 0) Object.assign(GUIDE[i], pick(dati, CAMPI_GUIDA));
    else GUIDE.push({ correlati: [], fonti: [], sezioni: [], ...pick(dati, CAMPI_GUIDA), slug, path: guida(slug) });
  }
  if (Array.isArray(ov.faqHome) && ov.faqHome.length) FAQ_HOME.splice(0, FAQ_HOME.length, ...ov.faqHome);
  if (Array.isArray(ov.glossario) && ov.glossario.length) TERMINI.splice(0, TERMINI.length, ...ov.glossario);
}

/** Стойностите от репото — за формите в панела (полетата с HTML остават HTML; панелът ги показва като текст). */
export function dumpContent() {
  return {
    site: { telefono: CONTACT.phone, email: CONTACT.email, orari: CONTACT.hours },
    servizi: Object.fromEntries(SERVIZI.map((s) => [s.key, { ...pick(s, CAMPI_SERVIZIO), nome: s.nome, path: s.path }])),
    guide: Object.fromEntries(GUIDE.map((g) => [g.slug, { ...pick(g, CAMPI_GUIDA), slug: g.slug, path: g.path }])),
    faqHome: FAQ_HOME,
    glossario: TERMINI,
  };
}
