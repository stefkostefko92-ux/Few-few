// The landing page's proof of the drawings: the plan at the main floor and section A-A that the engine draws for the
// sample shaft of 1600 × 1750 mm, the same views as the drawing set's, on white paper. The SVG files are made by
// scripts/landing-drawings.ts with the screens' renderer (static files: the page stays light). Server component.
import { getTranslations } from 'next-intl/server';
import { LANDING_DRAWINGS } from './drawings';

const VIEWS = [['lp-plan', 'planLabel', 'showPlan'], ['lp-section', 'sectionLabel', 'showSection']] as const;

export default async function DrawingShowcase() {
  const t = await getTranslations('landing');
  return (
    <div className="sheets">
      {VIEWS.map(([name, label, caption]) => {
        const d = LANDING_DRAWINGS[name];
        return (
          <figure key={name} className="sheet">
            <div className="sheet-paper">
              {/* eslint-disable-next-line @next/next/no-img-element -- a vector drawing, nothing for the image optimiser to do */}
              <img src={`/img/${name}.svg`} width={d.w} height={d.h} alt={t(label)} loading="lazy" decoding="async" />
            </div>
            <figcaption>{t(caption)} <span className="scale">1:{d.scale}</span></figcaption>
          </figure>
        );
      })}
    </div>
  );
}
