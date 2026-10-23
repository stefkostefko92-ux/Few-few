// The questions, after the template's FAQ: the heading, a line and the way to write to the team on the left, the
// questions as <details> on the right (no script; every answer is in the page for search and for the speakable
// selector .faq-a). Server component.
import { getTranslations } from 'next-intl/server';
import { PROVIDER } from '@/lib/provider';
import Icon from '@/components/Icon';

export default async function Faq({ items }: { items: readonly { q: string; a: string }[] }) {
  const t = await getTranslations('landing');
  return (
    <section id="faq" className="lp-section faq-section" aria-labelledby="faq-h">
      <div className="lp-wrap faq-grid">
        <div className="faq-heading">
          <p className="eyebrow">{t('faqEyebrow')}</p>
          <h2 id="faq-h"><span>{t('faqTitleA')}</span> <em>{t('faqTitleB')}</em></h2>
          <p>{t('faqLead')}</p>
          <a className="text-cta" href={`mailto:${PROVIDER.email}`}>{t('faqContact')} <Icon name="arrow-up-right" size={18} /></a>
        </div>
        <div className="faq-list">
          {items.map((x) => (
            <details key={x.q}>
              <summary>
                <h3>{x.q}</h3>
                <Icon name="chevron-down" size={18} />
              </summary>
              <p className="faq-a">{x.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
