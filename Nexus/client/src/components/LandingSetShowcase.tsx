import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { openSetViewer3D } from './items3d/viewerStore';

interface PreviewPiece { slug: string; name: string; category: string; sub_type?: string; tier: number; rarity?: string; missing?: boolean }
interface PreviewSet { slug: string; name: string; tier: number; rarity: string; class_focus: string | null; pieces: PreviewPiece[] }

/**
 * Втората 3D точка на лендинга — „завърти рицаря" вместо поредната плоска
 * карта. Използва СЪЩИЯ 3D преглед, който вече играчите виждат в /app/sets
 * (openSetViewer3D → <ItemViewer3DHost/>, глобално монтиран в App.tsx) —
 * нищо ново по WebGL пътя, само публични данни (server/src/routes/
 * publicSets.ts, без auth, само игрово съдържание). Мързеливо: fetch-ът
 * тръгва едва когато секцията влезе в viewport (IntersectionObserver);
 * самият 3D рендер тръгва едва при клик (openSetViewer3D), както навсякъде
 * другаде в играта.
 */
export default function LandingSetShowcase(): React.ReactElement {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [sets, setSets] = useState<PreviewSet[] | null>(null);
  const [active, setActive] = useState(0);
  const [loadStarted, setLoadStarted] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setLoadStarted(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { setLoadStarted(true); io.disconnect(); }
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!loadStarted) return;
    api.get<{ sets: PreviewSet[] }>('/public/sets/preview')
      .then((r) => setSets(r.sets || []))
      .catch(() => setSets([]));
  }, [loadStarted]);

  const current = sets && sets.length ? sets[active % sets.length] : null;

  return (
    <div className="sets-showcase" ref={rootRef} data-reveal>
      <div className="sets-showcase-head">
        <h3 className="sets-showcase-title">{t('landing.setsShowcaseTitle')}</h3>
        <p className="sets-showcase-lead">{t('landing.setsShowcaseLead')}</p>
      </div>
      {!sets && <div className="sets-showcase-loading">{t('landing.setsShowcaseLoading')}</div>}
      {sets && sets.length > 0 && (
        <div className="sets-showcase-body">
          <div className="sets-showcase-tabs" role="tablist">
            {sets.map((s, i) => (
              <button
                key={s.slug}
                type="button"
                role="tab"
                aria-selected={i === active}
                className={`sets-showcase-tab${i === active ? ' active' : ''}`}
                onClick={() => setActive(i)}
              >
                {s.name}
              </button>
            ))}
          </div>
          {current && (
            <div className="sets-showcase-panel">
              <div className="sets-showcase-panel-name">{current.name}</div>
              <div className="sets-showcase-panel-tier">{t('items3d.tier', { tier: current.tier })}</div>
              <button
                type="button"
                className="btn btn-primary sets-showcase-cta"
                onClick={() => openSetViewer3D({ kind: 'set', slug: current.slug, name: current.name, tier: current.tier, pieces: current.pieces })}
              >
                {t('landing.setsShowcaseCta')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
