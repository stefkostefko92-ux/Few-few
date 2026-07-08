// Единен източник на истината за издателя, контактите и правните данни.
// Ползва се от импресума, футъра, политиките и структурираните данни (JSON-LD),
// за да не се разминават никъде. Данните са на Carbon Stealth VCC (издателят на
// Мастилко) — взети от https://carbonstealth.eu.

export const SITE_URL = "https://mastilko-bg.com";

/** Издателят / търговецът зад Мастилко. */
export const PUBLISHER = {
  legalName: "Carbon Stealth VCC",
  url: "https://carbonstealth.eu",
  /** ЕИК (Булстат) — както е публикуван на carbonstealth.eu. */
  eik: "208725180",
  /** ДДС № (ЕИК с представка BG). */
  vat: "BG208725180",
  /** Имейл за правни/поверителност запитвания (избран от собственика). */
  email: "privacy@carbonstealth.eu",
  /** Общ бизнес имейл (публичен на carbonstealth.eu). */
  emailGeneral: "info@carbonstealth.eu",
  /** Телефон за България. */
  phone: "+359 877 414 874",
  phoneIntl: "+39 379 296 9699",
  address: {
    street: "ул. „Самуил“ № 3",
    locality: "Бобов дол",
    region: "Кюстендил",
    postalCode: "2670",
    country: "България",
    countryCode: "BG",
  },
  /** GPS на гр. Бобов дол (за LocalBusiness). */
  geo: { lat: 42.3592, lng: 23.0006 },
  hours: "Понеделник – петък 09:00–18:00, събота 10:00–14:00, неделя — почивен ден",
} as const;

/** Едноредов пощенски адрес за импресума. */
export const ADDRESS_ONE_LINE =
  `${PUBLISHER.address.street}, гр. ${PUBLISHER.address.locality} ${PUBLISHER.address.postalCode}, обл. ${PUBLISHER.address.region}, ${PUBLISHER.address.country}`;

/** @id котви за JSON-LD графа. */
export const ID = {
  org: "https://carbonstealth.eu/#org",
  localBusiness: "https://carbonstealth.eu/#localbusiness",
  site: `${SITE_URL}/#site`,
} as const;

/** schema.org PostalAddress за издателя. */
export const POSTAL_ADDRESS = {
  "@type": "PostalAddress",
  streetAddress: PUBLISHER.address.street,
  addressLocality: PUBLISHER.address.locality,
  addressRegion: PUBLISHER.address.region,
  postalCode: PUBLISHER.address.postalCode,
  addressCountry: PUBLISHER.address.countryCode,
} as const;
