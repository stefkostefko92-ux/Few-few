/**
 * Единен източник за издателя, контактите и правните реквизити. Ползва се от
 * импресума, подвала, политиките и JSON-LD — за да не се разминават никъде.
 * Данните са на Carbon Stealth VCC, както са публикувани на carbonstealth.eu.
 */

export const PUBLISHER = {
  legalName: 'Carbon Stealth VCC',
  url: 'https://carbonstealth.eu',
  /** ЕИК (Булстат), вписано в Търговския регистър при Агенцията по вписванията. */
  eik: '208725180',
  /** ДДС № (ЕИК с представка BG). */
  vat: 'BG208725180',
  email: 'info@carbonstealth.eu',
  /** Правни запитвания и упражняване на права по ОРЗД. */
  emailPrivacy: 'privacy@carbonstealth.eu',
  phone: '+359 877 414 874',
  address: {
    street: 'ул. „Самуил“ № 3',
    locality: 'Бобов дол',
    region: 'Кюстендил',
    postalCode: '2670',
    country: 'България',
  },
} as const;

export const ADDRESS_ONE_LINE = `${PUBLISHER.address.street}, гр. ${PUBLISHER.address.locality} ${PUBLISHER.address.postalCode}, обл. ${PUBLISHER.address.region}, ${PUBLISHER.address.country}`;

/**
 * Официалната покана към Discord общността. Живее ТУК, а не разпръсната по
 * страниците: поканите изтичат и се подменят, а един източник значи една
 * промяна. Не се бърка с `Server.discordUrl` — той е Discord-ът на ЧУЖД
 * сървър, подаден от собственика му, и затова носи `rel="ugc"`.
 */
export const DISCORD_INVITE = 'https://discord.gg/VP7XNZpCZh';

/** Езиците, на които обслужваме контактните точки по DSA чл. 11 и чл. 12. */
export const CONTACT_LANGUAGES_LABEL: Record<'bg' | 'en', string> = {
  bg: 'български и английски',
  en: 'Bulgarian and English',
};
