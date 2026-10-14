// The four things LiftPilot does, as the template's feature cards: the machine replacement, the whole lift design, the
// drawing sets with DXF and DWG, the report and the documents. The mono mark in each card's corner says what the card
// rests on (the standard, the formats). Server component.
import { getTranslations } from 'next-intl/server';
import Icon, { type IconName } from '@/components/Icon';

const CARDS: ReadonlyArray<readonly [number, IconName, string]> = [
  [1, 'pulley', 'UNI EN 81-50'],
  [2, 'building', 'UNI EN 81-20'],
  [3, 'file-dwg', 'DXF · DWG'],
  [4, 'file-pdf', 'PDF · DOCX'],
];

export default async function Features() {
  const t = await getTranslations('landing');
  return (
    <section id="funzionalita" className="lp-section features" aria-labelledby="funzionalita-h">
      <div className="lp-wrap">
        <div className="section-head">
          <div>
            <p className="eyebrow">{t('floorsLabel')}</p>
            <h2 id="funzionalita-h"><span>{t('featTitleA')}</span> <span>{t('featTitleB')}</span></h2>
          </div>
          <p>{t('featLead')}</p>
          <a className="text-cta" href="#prodotto">{t('featCta')} <Icon name="arrow-right" size={18} /></a>
        </div>
        <ul className="feature-grid">
          {CARDS.map(([n, icon, mark]) => (
            <li key={n} className="card feature-card">
              <span className="icon-tile"><Icon name={icon} size={22} /></span>
              <h3>{t(`feat${n}T`)}</h3>
              <p>{t(`feat${n}P`)}</p>
              <span className="card-index">{mark}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
