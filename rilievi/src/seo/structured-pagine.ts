import { PREZZI_UPDATED, SEGNALAZIONI_UPDATED } from '../company.js';
import { config } from '../config.js';
import { jsonForScript } from '../http/json-script.js';
import type { Translator } from '../i18n.js';
import { HOME_PATH } from './paths.js';
import { breadcrumb, IN_LANGUAGE, organization, website } from './structured-data.js';

/** Въпросите на `/prezzi` в реда им — FAQPage и екранът са едни и същи думи. */
export const FAQ_PREZZI = [
  'costo',
  'prova',
  'rinnovo',
  'scadenza',
  'iva',
  'persone',
  'rimborso',
] as const;

export interface OffertaPubblica {
  nome: string;
  prezzoCent: number;
  mesi: number;
}

const euro = (cent: number): string => (cent / 100).toFixed(2);

/**
 * JSON-LD на `/prezzi`: страницата (speakable — водещият абзац и отговорите), пътят до нея, въпросите и —
 * само когато има планове за продажба — по една оферта на план, без ДДС. Цена не се измисля.
 */
export function prezziStructuredData(
  t: Translator,
  canonical: string,
  offerte: readonly OffertaPubblica[],
): string {
  const base = config().PUBLIC_BASE_URL;
  return jsonForScript({
    '@context': 'https://schema.org',
    '@graph': [
      organization(t, base),
      website(base),
      {
        '@type': 'WebPage',
        '@id': `${canonical}#page`,
        url: canonical,
        name: t('prezzi.meta.title'),
        description: t('prezzi.meta.description'),
        inLanguage: IN_LANGUAGE,
        isPartOf: { '@id': `${base}/#website` },
        about: { '@id': `${base}/#app` },
        dateModified: PREZZI_UPDATED,
        breadcrumb: { '@id': `${canonical}#breadcrumb` },
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['.legale-pagina__lead', '.faq__a'],
        },
      },
      breadcrumb(canonical, [
        { name: 'Rilievi Impianti', url: `${base}${HOME_PATH}` },
        { name: t('prezzi.nav'), url: canonical },
      ]),
      ...(offerte.length
        ? [
            {
              '@type': 'SoftwareApplication',
              '@id': `${base}/#app`,
              name: 'Rilievi Impianti',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              offers: offerte.map((o) => ({
                '@type': 'Offer',
                name: o.nome,
                url: canonical,
                price: euro(o.prezzoCent),
                priceCurrency: 'EUR',
                availability: 'https://schema.org/InStock',
                category: 'subscription',
                eligibleCustomerType: 'https://schema.org/Business',
                priceSpecification: {
                  '@type': 'UnitPriceSpecification',
                  price: euro(o.prezzoCent),
                  priceCurrency: 'EUR',
                  valueAddedTaxIncluded: false,
                  billingDuration: o.mesi,
                  unitCode: 'MON',
                },
              })),
            },
          ]
        : []),
      {
        '@type': 'FAQPage',
        '@id': `${canonical}#faq`,
        inLanguage: IN_LANGUAGE,
        mainEntity: FAQ_PREZZI.map((id) => ({
          '@type': 'Question',
          name: t(`prezzi.faq.voci.${id}.q`),
          acceptedAnswer: { '@type': 'Answer', text: t(`prezzi.faq.voci.${id}.a`) },
        })),
      },
    ],
  });
}

/** JSON-LD на `/segnalazioni`: страницата, пътят до нея и точката за контакт (чл. 11–12 Рег. (ЕС) 2022/2065). */
export function segnalazioniStructuredData(
  t: Translator,
  canonical: string,
  contactEmail: string,
): string {
  const base = config().PUBLIC_BASE_URL;
  return jsonForScript({
    '@context': 'https://schema.org',
    '@graph': [
      organization(t, base),
      website(base),
      {
        '@type': 'WebPage',
        '@id': `${canonical}#page`,
        url: canonical,
        name: t('segnalazioni.meta.title'),
        description: t('segnalazioni.meta.description'),
        inLanguage: IN_LANGUAGE,
        isPartOf: { '@id': `${base}/#website` },
        dateModified: SEGNALAZIONI_UPDATED,
        breadcrumb: { '@id': `${canonical}#breadcrumb` },
        mainEntity: {
          '@type': 'ContactPoint',
          contactType: t('segnalazioni.contatto.titolo'),
          email: contactEmail,
          availableLanguage: ['it', 'bg', 'en'],
        },
      },
      breadcrumb(canonical, [
        { name: 'Rilievi Impianti', url: `${base}${HOME_PATH}` },
        { name: t('segnalazioni.nav'), url: canonical },
      ]),
    ],
  });
}
