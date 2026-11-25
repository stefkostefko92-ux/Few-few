import { hasKey, translator, type Locale } from '../i18n.js';
import { roleCan, type MemberRole } from '../auth/roles.js';
import { feature as featureOf, type FeatureCode } from '../features.js';
import { HELP_FAQ_COUNT, HELP_SECTIONS, type HelpSection } from './sections.js';

/**
 * Съдържанието на помощта (SPEC 89–91) от `locales/<език>/help.json` по списъка в sections.ts: публичната
 * страница взема всичко, „Помощ“ и PDF наръчникът — според организациите на човека.
 */
export interface HelpEntry {
  id: string;
  title: string;
  intro: string;
  steps: string[];
  tips: string[];
  /** Функцията не е в плана на нито една от организациите на човека — показва се с бележка. */
  notInPlan: boolean;
}

/** Поредните ключове `<префикс>.1`, `.2`… до първия липсващ. */
function numbered(locale: Locale, prefix: string): string[] {
  const t = translator(locale);
  const out: string[] = [];
  for (let n = 1; hasKey(locale, `${prefix}.${n}`); n += 1) out.push(t(`${prefix}.${n}`));
  return out;
}

function entry(locale: Locale, section: HelpSection, notInPlan: boolean): HelpEntry {
  const t = translator(locale);
  const key = `help.sections.${section.id}`;
  return {
    id: section.id,
    title: t(`${key}.title`),
    intro: t(`${key}.intro`),
    steps: numbered(locale, `${key}.steps`),
    tips: numbered(locale, `${key}.tips`),
    notInPlan,
  };
}

/** Всички раздели — публичната страница „Как работи“. */
export function publicHelp(locale: Locale): HelpEntry[] {
  return HELP_SECTIONS.map((section) => entry(locale, section, false));
}

export function helpFaq(locale: Locale): Array<{ q: string; a: string }> {
  const t = translator(locale);
  return Array.from({ length: HELP_FAQ_COUNT }, (_, i) => ({
    q: t(`help.faq.${i + 1}.q`),
    a: t(`help.faq.${i + 1}.a`),
  }));
}

/** Организация на вписания човек (пряко членство) — видът, ролята и функциите по плана ѝ. */
export interface HelpOrg {
  kind: 'COMPANY' | 'ACCOUNTING_FIRM';
  role: MemberRole;
  features: ReadonlySet<FeatureCode>;
}

function fits(section: HelpSection, org: HelpOrg): boolean {
  if (section.audience === 'company' && org.kind !== 'COMPANY') return false;
  if (section.audience === 'firm' && org.kind !== 'ACCOUNTING_FIRM') return false;
  if (section.ownerOnly && org.role !== 'OWNER') return false;
  return section.capability === null || roleCan(org.role, section.capability);
}

/**
 * „Помощ“ и наръчникът: раздел, който човекът вижда поне в една организация; без функцията в плана на
 * никоя от тях — с бележка. Мастърът вижда всичко. Предстоящото (`planned`) никога не е „налично“.
 */
export function helpFor(locale: Locale, viewer: { orgs: HelpOrg[]; master: boolean }): HelpEntry[] {
  return HELP_SECTIONS.filter(
    (section) => viewer.master || viewer.orgs.some((org) => fits(section, org)),
  ).map((section) => {
    const code = section.feature;
    const live = code === null || featureOf(code).status === 'live';
    const inPlan =
      code === null ||
      viewer.master ||
      viewer.orgs.some((org) => fits(section, org) && org.features.has(code));
    return entry(locale, section, !live || !inPlan);
  });
}

/** Кодовете на функциите, от които зависи помощта — за еднократната проверка на плановете. */
export const HELP_FEATURES: readonly FeatureCode[] = [
  ...new Set(HELP_SECTIONS.flatMap((s) => (s.feature ? [s.feature] : []))),
];
