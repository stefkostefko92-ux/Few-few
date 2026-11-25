// @ts-check
// Издателят на сайта — ЕДИНСТВЕН източник за бележките, footer-а и Organization в JSON-LD.
// Данните живеят в config.json → titolare (виж CLAUDE.md „Реквизити на титуляря“); тук само се четат и
// се превеждат в schema.org. Видимият контакт във footer-а е същият като в схемата (NAP).
import { readFileSync } from 'node:fs';

/** @typedef {import('./models.js').Titolare} Titolare */

/** @returns {Titolare} */
function leggi() {
  try {
    const cfg = JSON.parse(readFileSync(new URL('../../config.json', import.meta.url), 'utf8'));
    return cfg && typeof cfg.titolare === 'object' && cfg.titolare ? cfg.titolare : {};
  } catch {
    return {};
  }
}

/** @type {Readonly<Titolare>} */
export const TITOLARE = Object.freeze(leggi());

/** Първият телефон е италианският (сайтът е за Италия); останалите — на дружеството. */
export function telefoni(t = TITOLARE) {
  return Array.isArray(t.telefoni) ? t.telefoni.filter((x) => typeof x === 'string' && x.trim() !== '') : [];
}

/** `tel:` по RFC 3966 — без интервали. */
export const telHref = (/** @type {string} */ n) => `tel:${n.replace(/[^\d+]/g, '')}`;

/**
 * Organization на проекта (`#org`) с контакт; правните данни (legalName, vatID, адрес) са на
 * дружеството-майка — проектът не е отделно юридическо лице.
 * @param {string} su siteUrl без наклонена черта накрая
 * @param {Titolare} [t]
 * @returns {Record<string, any>}
 */
export function orgJsonLd(su, t = TITOLARE) {
  const tel = telefoni(t);
  /** @type {Record<string, any>} */
  const parent = { '@type': 'Organization', '@id': 'https://carbonstealth.eu/#organization', name: t.nome || 'Carbon Stealth VCC', url: 'https://carbonstealth.eu' };
  if (t.nomeLegale) parent.legalName = t.nomeLegale;
  if (t.partitaIva) parent.vatID = t.partitaIva;
  if (t.eik) parent.taxID = t.eik;
  if (t.via && t.cap && t.citta && t.paese) {
    parent.address = { '@type': 'PostalAddress', streetAddress: t.via, postalCode: t.cap, addressLocality: t.citta, addressCountry: t.paese };
  }
  if (t.email) parent.email = t.email;
  if (tel[1]) parent.telephone = tel[1];
  /** @type {Record<string, any>} */
  const org = {
    '@type': 'Organization',
    '@id': `${su}/#org`,
    name: 'Ospedali Trasparenti',
    url: `${su}/`,
    logo: `${su}/logo.png`,
    description: 'Progetto di trasparenza civica sui conti e gli appalti degli ospedali pubblici italiani.',
  };
  if (t.email) org.email = t.email;
  if (tel[0]) org.telephone = tel[0];
  if (t.email) {
    org.contactPoint = { '@type': 'ContactPoint', contactType: 'redazione e rettifiche', email: t.email, url: `${su}/note-legali.html#contatti`, availableLanguage: ['it', 'en', 'bg'] };
    if (tel[0]) org.contactPoint.telephone = tel[0];
  }
  org.parentOrganization = parent;
  org.publishingPrinciples = `${su}/metodologia.html`;
  return org;
}
