import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import SiteHeader from './SiteHeader';
import Footer from './Footer';
import Icon, { type IconName } from './Icon';
import '@/app/public.css';

// The standards of the Italian profile (the norms' page, /app/norme, lists them with their scope)
const NORMS = ['UNI EN 81-20/50:2020', 'UNI 10411-1/-11:2024', 'DPR 162/1999'] as const;
const FEATURES: ReadonlyArray<{ icon: IconName; key: 'panelCalc' | 'panelDrawings' | 'panelSim' | 'panelReport' }> = [
  { icon: 'calculator-check', key: 'panelCalc' },
  { icon: 'file-dwg', key: 'panelDrawings' },
  { icon: 'cube', key: 'panelSim' },
  { icon: 'file-pdf', key: 'panelReport' },
];
const CUTAWAY = [480, 800, 1086] as const;
const set = (ext: string): string => CUTAWAY.map((w) => `/img/premium/elevator-cutaway-${w}.${ext} ${w}w`).join(', ');
// the picture shows only from 1280 px, in a column of at most 300 px (public.css)
const SIZES = '300px';
// the emblem at 40 px: the 64 px file for 1x and the 96 px one for 2x, so it is never stretched
const EMBLEM_40 = { src: '/img/liftpilot-emblem-64.webp', srcSet: '/img/liftpilot-emblem-64.webp 1x, /img/liftpilot-emblem-96.webp 2x' } as const;

// The frame of the sign-in and of the pages around it (registration, confirmation, forgotten and new password,
// invitation): the form on the left over the blueprint grid; from 1024 px the brand's panel on the right — the
// emblem, what LiftPilot makes, the standards and the rule that every result is a draft until a qualified technician
// signs it — and from 1280 px the template's elevator cutaway beside them (an illustration, labelled as such). On
// phones the panel keeps only its text, under the form; below 1280 px the picture is lazy and not displayed, so it is
// never fetched.
export default async function AuthPage({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  const t = await getTranslations('auth');
  return (
    <>
      <SiteHeader showLogin={false} />
      <main className="auth blueprint">
        <div className="auth-form">
          <h1>{title}</h1>
          <p className="lead">{lead}</p>
          {children}
        </div>
        <aside className="auth-art blueprint diag" aria-label={t('panelLabel')}>
          <div className="auth-art-head">
            {/* eslint-disable-next-line @next/next/no-img-element -- prebuilt WebP set (scripts/brand-assets.py) */}
            <img className="auth-emblem" src={EMBLEM_40.src} srcSet={EMBLEM_40.srcSet} width={40} height={40} alt="" decoding="async" />
            <p className="eyebrow">{t('panelEyebrow')}</p>
            <p className="auth-art-title">{t.rich('panelTitle', { em: (c) => <em>{c}</em> })}</p>
          </div>
          <ul className="auth-art-features">
            {FEATURES.map((f) => (
              <li key={f.key}><span className="icon-tile sm"><Icon name={f.icon} size={18} /></span>{t(f.key)}</li>
            ))}
          </ul>
          <figure className="auth-art-figure">
            {/* a prebuilt AVIF/WebP set (scripts/premium-images.py), not next/image */}
            <picture>
              <source type="image/avif" srcSet={set('avif')} sizes={SIZES} />
              <img src="/img/premium/elevator-cutaway-480.webp" srcSet={set('webp')} sizes={SIZES}
                width={1086} height={1448} alt={t('panelImgAlt')} loading="lazy" decoding="async" />
            </picture>
            <figcaption className="art-tag">{t('panelImgLabel')}</figcaption>
          </figure>
          <div className="auth-art-foot">
            <p className="eyebrow plain">{t('panelNorms')}</p>
            <ul className="norm-list">{NORMS.map((n) => <li key={n} className="badge">{n}</li>)}</ul>
            <p className="note">{t('panelHonesty')}</p>
          </div>
        </aside>
      </main>
      <Footer />
    </>
  );
}
