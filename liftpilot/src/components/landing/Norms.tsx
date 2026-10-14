// The standards the software is built on, after the template's standards block: the documents of the Italian profile
// (src/calc/norme.ts PROFILO) with what each one covers, the note on the register and the ⚠ values, beside the
// template's blueprint of a lift in its frame with a mono stamp (an illustration, not to scale), level with the title
// and kept in view beside the list on wide screens. Server component.
import { getTranslations } from 'next-intl/server';
import { PROFILO } from '@/calc/norme';

/** The blueprint (public/img/premium, scripts/premium-images.py): line work on transparency, square, in AVIF and WebP. */
const BLUEPRINT = {
  avif: '/img/premium/elevator-blueprint-450.avif 450w, /img/premium/elevator-blueprint-900.avif 900w',
  webp: '/img/premium/elevator-blueprint-450.webp 450w, /img/premium/elevator-blueprint-900.webp 900w',
  // the frame is at most 500 px wide (home.css), the column's width under it
  sizes: '(min-width: 560px) 500px, calc(100vw - 40px)',
} as const;

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
            <source type="image/avif" srcSet={BLUEPRINT.avif} sizes={BLUEPRINT.sizes} />
            <img src="/img/premium/elevator-blueprint-450.webp" srcSet={BLUEPRINT.webp} sizes={BLUEPRINT.sizes} width={450} height={450} alt=""
              loading="lazy" decoding="async" />
          </picture>
          <p className="drawing-stamp" aria-hidden="true">LIFTPILOT <b>{t('heroProfile', { profile: PROFILO.id })}</b> <small>{t('normsStamp')}</small></p>
        </figure>
      </div>
    </section>
  );
}
