import { ESPORTAZIONE_UPDATED } from '../company.js';
import { config } from '../config.js';
import type { Translator } from '../i18n.js';
import { jsonForScript } from '../http/json-script.js';
import { HOME_PATH } from './paths.js';
import { breadcrumb, IN_LANGUAGE, organization, website } from './structured-data.js';

/** Въпросите на страницата `/esportazione` в реда им — FAQPage и екранът са едни и същи думи. */
export const FAQ_ESPORTAZIONE = ['tutti', 'costo', 'durante', 'dopo', 'aprire'] as const;

/** Стъпките на смяната на доставчика — HowTo, дума по дума от екрана. */
export const PASSI_CAMBIO = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;

/** Мерките срещу достъпа на държави извън ЕС (чл. 28 Data Act) — в реда им на екрана. */
export const MISURE_GIURISDIZIONE = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'] as const;

/**
 * JSON-LD на `/esportazione`: страницата (speakable — водещият абзац и отговорите), пътят до нея, стъпките
 * на смяната (HowTo) и въпросите (FAQPage).
 */
export function esportazioneStructuredData(t: Translator, canonical: string): string {
  const base = config().PUBLIC_BASE_URL;
  const passi = PASSI_CAMBIO.map((id) => t(`esportazione.pagina.cambio.passi.${id}`));
  return jsonForScript({
    '@context': 'https://schema.org',
    '@graph': [
      organization(t, base),
      website(base),
      {
        '@type': 'WebPage',
        '@id': `${canonical}#page`,
        url: canonical,
        name: t('esportazione.pagina.meta.title'),
        description: t('esportazione.pagina.meta.description'),
        inLanguage: IN_LANGUAGE,
        isPartOf: { '@id': `${base}/#website` },
        about: { '@id': `${base}/#app` },
        dateModified: ESPORTAZIONE_UPDATED,
        breadcrumb: { '@id': `${canonical}#breadcrumb` },
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['.legale-pagina__lead', '.faq__a'],
        },
      },
      breadcrumb(canonical, [
        { name: 'Rilievi Impianti', url: `${base}${HOME_PATH}` },
        { name: t('esportazione.pagina.nav'), url: canonical },
      ]),
      {
        '@type': 'HowTo',
        '@id': `${canonical}#cambio`,
        name: t('esportazione.pagina.cambio.titolo'),
        inLanguage: IN_LANGUAGE,
        step: passi.map((text, i) => ({
          '@type': 'HowToStep',
          position: i + 1,
          text,
          url: `${canonical}#cambio`,
        })),
      },
      {
        '@type': 'FAQPage',
        '@id': `${canonical}#faq`,
        inLanguage: IN_LANGUAGE,
        mainEntity: FAQ_ESPORTAZIONE.map((id) => ({
          '@type': 'Question',
          name: t(`esportazione.pagina.faq.voci.${id}.q`),
          acceptedAnswer: {
            '@type': 'Answer',
            text: t(`esportazione.pagina.faq.voci.${id}.a`),
          },
        })),
      },
    ],
  });
}
