import { indexingAllowed, publicBaseUrl } from '@/lib/env';
import { PROFILO } from '@/calc/norme';
import it from '../../../messages/it.json';
import { ANSWER } from '@/lib/answers';

export const dynamic = 'force-dynamic';

const FEATURES = [1, 2, 3, 4] as const;
const STEPS = [0, 1, 2, 3, 4] as const;

// llms.txt: what the site is and where the key pages are, for AI crawlers; not found while indexing is off, as robots.txt
// and the sitemap. In Italian, the only language of the site, with the very words of its pages (messages/it.json); a
// title and its paragraph joined by a dash, as each paragraph starts with a capital (no colon before it).
export function GET(): Response {
  if (!indexingAllowed()) return new Response(ANSWER.notFound, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const base = publicBaseUrl(), l = it.landing;
  const body = [
    '# LiftPilot',
    '',
    `> ${l.metaDescription} ${l.answer} ${l.normsEyebrow} ${PROFILO.id}: ${PROFILO.documenti.map((d) => d.sigla).join('; ')}.`,
    '',
    `## ${l.navFeatures}`,
    ...FEATURES.map((n) => `- ${l[`feat${n}T`]} — ${l[`feat${n}P`]}`),
    '',
    `## ${l.floorsLabel}`,
    ...STEPS.map((n) => `- ${l[`fl${n}H`]} — ${l[`fl${n}T`]}`),
    '',
    it.common.footerNote,
    '',
    '## Pagine',
    `- [LiftPilot](${base}/it): ${l.metaDescription}`,
    `- [${it.register.title}](${base}/it/register): ${it.register.metaDescription}`,
    `- [${it.pricing.title}](${base}/it/pricing): ${it.pricing.metaDescription}`,
    `- [${it.legal.title}](${base}/it/privacy): ${it.legal.metaDescription}`,
    `- [${it.dataPage.title}](${base}/it/data): ${it.dataPage.metaDescription}`,
    '',
    '## Editore',
    '- [Carbon Stealth VCC](https://carbonstealth.eu)',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
