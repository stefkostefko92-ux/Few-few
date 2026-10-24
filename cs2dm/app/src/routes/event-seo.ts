import { formatMultiplier, isActive, type PublicEvent } from '../events.js';
import { LOCALE_TAG, type Locale, type Translator } from '../i18n.js';
import { absolute, pagePath, type JsonLdNode } from '../seo.js';

/**
 * Събитията на началната страница (CONTRACT §12): изгледът и JSON-LD `Event` — за предстоящите и
 * текущото. Онлайн събитие: място = страницата на сървъра (VirtualLocation), безплатно.
 */
export function decimalSeparator(locale: Locale): string {
  return (
    new Intl.NumberFormat(LOCALE_TAG[locale]).formatToParts(1.5).find((p) => p.type === 'decimal')
      ?.value ?? '.'
  );
}

export interface EventView extends PublicEvent {
  title: string;
  active: boolean;
  multiplier: string | null;
}

export function eventViews(events: PublicEvent[], locale: Locale, now: Date): EventView[] {
  const separator = decimalSeparator(locale);
  return events.map((event) => ({
    ...event,
    title: event.titles[locale],
    active: isActive(event, now),
    multiplier: event.xpTenths > 10 ? formatMultiplier(event.xpTenths, separator) : null,
  }));
}

export function eventNodes(events: EventView[], locale: Locale, t: Translator): JsonLdNode[] {
  const home = absolute(pagePath(locale, 'home'));
  return events.map((event) => ({
    '@type': 'Event',
    '@id': `${home}#event-${event.id}`,
    name: event.title,
    description: t(`home.events.ld.${event.kind}`, {
      multiplier: event.multiplier ?? '×1',
      mode: event.modeName ?? '—',
    }),
    startDate: event.startsAt.toISOString(),
    endDate: event.endsAt.toISOString(),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: { '@type': 'VirtualLocation', url: home },
    organizer: { '@id': absolute('/#organization') },
    image: absolute('/static/og.png'),
    isAccessibleForFree: true,
    inLanguage: locale,
  }));
}
