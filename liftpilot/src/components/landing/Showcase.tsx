// The product showcase, after the template's "product-ui" frame: one tab per step from the survey to the documents, each
// panel the frame of the workspace around what LiftPilot made for the sample installation — the plan, the section beside
// the shaft in 3D, every check of the machine it proposes as the engine computes it now, the simulation, the pages of
// the documents — with the sample's own figures beside it and the step's text under it. Drawings stay white paper.
// Server component (ShowcaseTabs is the client part).
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { EMBLEM } from '@/lib/brand';
import { makeFmt } from '@/lib/present/tr';
import Icon, { type IconName } from '@/components/Icon';
import ShowcaseTabs, { type ShowcaseTab } from './ShowcaseTabs';
import { LANDING_DRAWINGS } from './drawings';
import { LANDING_DOCS } from './docs';
import type { Sample, SampleStop } from './example';

/** The steps, by the id of their panel, with their icon. */
const STEPS: ReadonlyArray<readonly [string, IconName]> = [
  ['rilievo', 'floor-plan'], ['progetto', 'blueprint'], ['argano', 'calculator-check'], ['simulazione', 'rotate-3d'], ['documenti', 'file-stack'],
];
/** The pages of the sample's documents, with the key of each caption: the first sheet of the drawings and the report's
 *  first page large, the machine room's sheet and a page of the checks small beside them. */
const DOCS = [['lp-doc-tavola', 'docTavola'], ['lp-doc-relazione', 'docRelazione'], ['lp-doc-locale', 'docLocale'], ['lp-doc-verifiche', 'docVerifiche']] as const;

type Fact = readonly [string, string];

interface Props {
  sample: Sample;
  stop: SampleStop;
  intlLocale: string;
}

export default async function Showcase({ sample, stop, intlLocale }: Props) {
  const [t, tl] = await Promise.all([getTranslations('landing'), getTranslations('lift')]);
  const fmt = makeFmt(intlLocale), m = sample.machine;
  const names = STEPS.map((_, n) => t(`step${n + 1}Title`));
  const plan = LANDING_DRAWINGS['lp-plan'], section = LANDING_DRAWINGS['lp-section'];

  // a frame without facts gives the canvas the column of the properties too (the documents); `note` goes under the frame
  const frame = (k: number, body: ReactNode, facts: readonly Fact[], check?: string, note?: string): ReactNode => (
    <>
      <div className="product-ui">
        <div className="ui-top">
          <span className="ui-brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- prebuilt sizes (scripts/brand-assets.py) */}
            <img src={EMBLEM.src} srcSet={EMBLEM.srcSet} width={22} height={22} alt="" loading="lazy" decoding="async" />
            LiftPilot <small>/ {names[k]}</small>
          </span>
          <span className="ui-status">{t('heroEngine', { engine: sample.engine })}</span>
        </div>
        <div className={facts.length ? 'ui-inner' : 'ui-inner wide'}>
          <ol className="ui-side" aria-hidden="true">
            {names.map((name, i) => <li key={name} className={i === k ? 'on' : undefined}><span>{String(i + 1).padStart(2, '0')}</span>{name}</li>)}
          </ol>
          <div className="ui-canvas">{body}</div>
          {facts.length ? (
            <div className="ui-props">
              <p className="ui-props-title">{t('prodSample')}</p>
              <dl>{facts.map(([l, v]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}</dl>
              {check ? <p className="ui-check"><Icon name="check-circle" size={16} />{check}</p> : null}
            </div>
          ) : null}
        </div>
        <div className="ui-bottom"><span>{t('prodSample')}</span><span>DXF · DWG · PDF</span></div>
      </div>
      <div className="ui-caption">
        <h3>{t(`fl${k}H`)}</h3>
        <p>{t(`fl${k}T`)}</p>
        {note ? <p className="ui-note"><Icon name="check-circle" size={16} />{note}</p> : null}
      </div>
    </>
  );

  const paper = (name: keyof typeof LANDING_DRAWINGS, alt: string, cls: string): ReactNode => (
    <figure className={`ui-paper ${cls}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a vector drawing made by scripts/landing-drawings.ts */}
      <img src={`/img/${name}.svg`} width={LANDING_DRAWINGS[name].w} height={LANDING_DRAWINGS[name].h} alt={alt} loading="lazy" decoding="async" />
      <span className="ui-scale">1:{LANDING_DRAWINGS[name].scale}</span>
    </figure>
  );

  const panels: ReactNode[] = [
    frame(0, paper('lp-plan', t('planLabel'), 'plan'), [[t('pScale'), `1:${plan.scale}`], [t('pFormats'), 'DXF · DWG']]),
    frame(1, (
      <div className="ui-pair">
        {paper('lp-section', t('sectionLabel'), 'section')}
        <figure className="ui-shot tall">
          {/* eslint-disable-next-line @next/next/no-img-element -- a frame of the 3D simulation */}
          <img src="/img/lp-3d-shaft.webp" width={400} height={800} alt={t('show3dShaft')} loading="lazy" decoding="async" />
        </figure>
      </div>
    ), [[t('pScale'), `1:${section.scale}`], [t('pLoad'), m.Q], [t('pSpeed'), m.v], [t('pTravel'), m.H]]),
    frame(2, (
      <div className="ui-ledger" role="region" aria-labelledby="lp-ledger-title" tabIndex={0}>
        <table>
          <caption id="lp-ledger-title">{t('ledgerTitle', { count: sample.checks.length })}</caption>
          <thead><tr><th scope="col">{t('ledgerCheck')}</th><th scope="col">{t('ledgerValue')} / {t('ledgerLimit')}</th><th scope="col">{t('ledgerResult')}</th></tr></thead>
          <tbody>
            {sample.checks.map((c) => (
              <tr key={c.id}>
                <th scope="row">{c.label}</th>
                <td><span className="v">{c.value}</span> <span className="lim">{c.limit}</span></td>
                <td><span className={`status-pill ${c.status}`}>{c.statusText}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ), [[t('pSheave'), m.D], [t('pRopes'), m.ropes], [t('pRatio'), m.ratio], [t('pMotor'), m.power]], sample.verdict),
    frame(3, (
      <div className="ui-pair wide">
        <figure className="ui-shot">
          {/* eslint-disable-next-line @next/next/no-img-element -- a frame of the 3D simulation */}
          <img src="/img/lp-3d-car.webp" srcSet="/img/lp-3d-car-800.webp 800w, /img/lp-3d-car.webp 1280w" sizes="(min-width: 1100px) 360px, 90vw"
            width={1280} height={860} alt={t('show3dCar')} loading="lazy" decoding="async" />
          <figcaption>{t('simTitle')}</figcaption>
        </figure>
        <figure className="ui-shot">
          {/* eslint-disable-next-line @next/next/no-img-element -- a frame of the 3D simulation */}
          <img src="/img/lp-3d-room.webp" srcSet="/img/lp-3d-room-800.webp 800w, /img/lp-3d-room.webp 1280w" sizes="(min-width: 1100px) 360px, 90vw"
            width={1280} height={860} alt={t('show3dRoom')} loading="lazy" decoding="async" />
          <figcaption>{t('m3Title')}</figcaption>
        </figure>
      </div>
    ), [[t('pDecel'), `${fmt(stop.accel, 2)} m/s²`], [t('pStop'), `${fmt(stop.stop * 100, 0)} cm`], [t('pLoad'), m.Q], [t('pSpeed'), m.v]],
    tl('sum_brake_ok', { a: fmt(stop.accel, 2), util: fmt(stop.util, 2), d0: fmt(stop.stop * 100, 0) })),
    frame(4, (
      <ol className="ui-desk">
        {DOCS.map(([name, key], i) => {
          const d = LANDING_DOCS[name];
          return (
            <li key={name} className={i < 2 ? 'lead' : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element -- pages of the sample's documents made by scripts/landing-docs.ts */}
              <img src={`/img/${name}.webp`} width={d.w} height={d.h} alt={t(key, d.args)} loading="lazy" decoding="async" />
            </li>
          );
        })}
      </ol>
    ), [], undefined, t('docsNote')),
  ];

  const tabs: ShowcaseTab[] = STEPS.map(([id, icon], n) => ({ id, icon, label: names[n] ?? id }));
  const intro = (
    <>
      <p className="eyebrow">{t('prodEyebrow')}</p>
      <h2 id="prodotto-h"><span>{t('prodTitle1')}</span> <span>{t('prodTitle2')}</span> <em>{t('prodTitle3')}</em></h2>
      <p className="showcase-lead">{t('prodLead')}</p>
    </>
  );
  return (
    <section id="prodotto" className="lp-section product-showcase" aria-labelledby="prodotto-h">
      <div className="lp-wrap">
        <ShowcaseTabs tabs={tabs} label={t('floorsLabel')} intro={intro} panels={panels} />
      </div>
    </section>
  );
}
