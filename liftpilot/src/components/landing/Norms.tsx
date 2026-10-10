// The standards the software is built on, after the template's standards block: the documents of the Italian profile
// (src/calc/norme.ts PROFILO) with what each one covers, the note on the register and the ⚠ values, beside the
// template's blueprint of a lift in its frame with a mono stamp (an illustration, not to scale). Server component.
import { getTranslations } from 'next-intl/server';
import { PROFILO } from '@/calc/norme';

export default async function Norms() {
  const t = await getTranslations('landing');
  return (
    <section id="norme" className="lp-section standards-section" aria-labelledby="norme-h">
      <div className="lp-wrap standards-grid">
        <div className="standards-copy">
          <p className="eyebrow">{t('normsEyebrow')}</p>
          <h2 id="norme-h"><span>{t('normsTitleA')}</span> <em>{t('normsTitleB')}</em></h2>
          <p className="standards-lead">{t('normsLead')}</p>
          <ul className="standard-list">
            {PROFILO.documenti.map((d) => (
              <li key={d.sigla}>
                <span className="std-mark" aria-hidden="true">✓</span>
                <span><strong>{d.sigla}</strong> <span className="std-scope">{d.ambito}</span></span>
              </li>
            ))}
          </ul>
          <p className="standards-note">{t('normsNote', { profile: PROFILO.id })}</p>
        </div>
        <figure className="standard-drawing">
          <figcaption className="drawing-meta"><span>{t('normsArt')}</span><span>{PROFILO.id}</span></figcaption>
          <picture>
            <source media="(min-width: 720px)" srcSet="/img/premium/elevator-blueprint-900.webp" />
            <img src="/img/premium/elevator-blueprint-450.webp" width={450} height={450} alt="" loading="lazy" decoding="async" />
          </picture>
          <p className="drawing-stamp" aria-hidden="true">LIFTPILOT <b>{t('heroProfile', { profile: PROFILO.id })}</b> <small>{t('normsStamp')}</small></p>
        </figure>
      </div>
    </section>
  );
}
