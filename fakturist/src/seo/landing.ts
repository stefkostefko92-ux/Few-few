import { hasKey, type Locale, type Translate } from '../i18n.js';
import type { PublicPlan } from '../billing/public-plans.js';

/**
 * Страниците за рекламите и търсачките (собственикът, 23.11.2026): един общ изглед (`views/site/landing.ejs`),
 * съдържанието е в речника — `site.<id>.sections.<n>` с `title`, `p1…`, `list.<n>` или `steps.<n>` (стъпките
 * стават и HowTo в JSON-LD). Числата от плановете (лимитът на безплатния, кои планове включват SAF-T) идват
 * от базата — цените и лимитите се сменят от панела и страницата не бива да ги помни.
 */
export const LANDING_IDS = ['freeInvoicing', 'proforma', 'vatLedgers', 'saft'] as const;
export type LandingId = (typeof LANDING_IDS)[number];

export const isLanding = (id: string): id is LandingId =>
  (LANDING_IDS as readonly string[]).includes(id);

export interface LandingSection {
  id: string;
  title: string;
  paragraphs: string[];
  list: string[];
  steps: string[];
  /** Връзка в текста към друга страница на витрината (`sections.<n>.link.page` + `.text`). */
  link: { page: string; text: string } | null;
}

/** Стойностите, които текстовете ползват като `{limit}` и `{safTPlans}`. */
export function landingParams(
  locale: Locale,
  t: Translate,
  plans: PublicPlan[],
): Record<string, string> {
  const free = plans.find((plan) => plan.audience === 'company' && plan.priceMonthlyCents === 0);
  const name = (plan: PublicPlan) => (locale === 'bg' ? plan.nameBg : plan.nameEn);
  // Без безплатен план (скрит, или плановете не се заредиха) — нито число, нито „без лимит“: обещание, което
  // базата не потвърждава, е заблуждаваща реклама (Кодаджията, 25.11.2026).
  const limit = !free
    ? t('site.landing.limitUnknown')
    : free.monthlyDocumentSoftLimit != null
      ? String(free.monthlyDocumentSoftLimit)
      : t('site.landing.unlimited');
  return {
    limit,
    safTPlans:
      plans
        .filter((plan) => plan.features.includes('saf-t'))
        .map(name)
        .join(', ') || t('site.landing.paidPlans'),
  };
}

function numbered(locale: Locale, t: Translate, key: string, params: Record<string, string>) {
  const items: string[] = [];
  for (let n = 1; hasKey(locale, `${key}.${n}`); n += 1) items.push(t(`${key}.${n}`, params));
  return items;
}

export function landingSections(
  locale: Locale,
  t: Translate,
  id: LandingId,
  params: Record<string, string>,
): LandingSection[] {
  const sections: LandingSection[] = [];
  for (let n = 1; hasKey(locale, `site.${id}.sections.${n}.title`); n += 1) {
    const key = `site.${id}.sections.${n}`;
    const paragraphs: string[] = [];
    for (let p = 1; hasKey(locale, `${key}.p${p}`); p += 1)
      paragraphs.push(t(`${key}.p${p}`, params));
    sections.push({
      id: `s${n}`,
      title: t(`${key}.title`, params),
      paragraphs,
      list: numbered(locale, t, `${key}.list`, params),
      steps: numbered(locale, t, `${key}.steps`, params),
      link: hasKey(locale, `${key}.link.page`)
        ? { page: t(`${key}.link.page`), text: t(`${key}.link.text`, params) }
        : null,
    });
  }
  return sections;
}
