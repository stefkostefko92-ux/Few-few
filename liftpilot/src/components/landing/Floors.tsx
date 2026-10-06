// The way from the survey to the documents as the floors of a building, read from the ground up: each floor one step
// with what the software makes there for the sample installation — the plan, the section beside the shaft in 3D, the
// checks of the machine it proposes as the engine computes them, its emergency stop as the simulation runs it, the
// pages of its documents. The car operating panel beside them lights the floor being read. Server component (FloorNav
// and SimPreview are the client parts).
import { getTranslations } from 'next-intl/server';
import { makeFmt } from '@/lib/present/tr';
import { LANDING_DRAWINGS } from './drawings';
import { LANDING_DOCS } from './docs';
import FloorNav, { type Floor } from './FloorNav';
import SimPreview from './SimPreview';
import type { Example, SampleMachine, SampleStop } from './example';

/** The floors from the ground up, by the id of their section: the survey, the design, the machine, the simulation, the documents. */
export const FLOORS = ['rilievo', 'progetto', 'argano', 'simulazione', 'documenti'] as const;
/** The pages of the sample's documents, with the key of each caption. */
const DOCS = [['lp-doc-tavola', 'docTavola'], ['lp-doc-relazione', 'docRelazione'], ['lp-doc-locale', 'docLocale'], ['lp-doc-verifiche', 'docVerifiche']] as const;

function Sheet({ name, label, caption, scale }: { name: keyof typeof LANDING_DRAWINGS; label: string; caption: string; scale: number }) {
  const d = LANDING_DRAWINGS[name];
  return (
    <figure className="lp-sheet">
      <div className="lp-paper">
        {/* eslint-disable-next-line @next/next/no-img-element -- a vector drawing made by scripts/landing-drawings.ts */}
        <img src={`/img/${name}.svg`} width={d.w} height={d.h} alt={label} loading="lazy" decoding="async" />
        <span className="lp-scale">1:{scale}</span>
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function Frame({ src, set, w, h, alt, cls, sizes }: { src: string; set?: string; w: number; h: number; alt: string; cls: string; sizes: string }) {
  return (
    <figure className={`lp-frame ${cls}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- frames of the 3D simulation with their own sizes */}
      <img src={src} srcSet={set} sizes={sizes} width={w} height={h} alt={alt} loading="lazy" decoding="async" />
      <figcaption>{alt}</figcaption>
    </figure>
  );
}

interface Props {
  sample: Example & { machine: SampleMachine };
  stop: SampleStop;
  intlLocale: string;
}

export default async function Floors({ sample, stop, intlLocale }: Props) {
  const t = await getTranslations('landing'), tl = await getTranslations('lift'), fmt = makeFmt(intlLocale);
  const floors: Floor[] = FLOORS.map((id, n) => ({ id, n, name: t(`step${n + 1}Title`) }));
  const docs = DOCS.map(([name, key], k) => ({ name, k, caption: t(key, LANDING_DOCS[name].args), ...LANDING_DOCS[name] }));
  // the moments of the stop in the table under the charts: before the brake, its closing, halfway, the stop, after
  const iOn = Math.round((stop.brakeOn - stop.t0) / stop.dt), iStop = Math.round((stop.carStop - stop.t0) / stop.dt);
  const rows = [0, iOn, Math.round((iOn + iStop) / 2), iStop, stop.v.length - 1].map((i) => {
    const lim = stop.limit[i] ?? null;
    return { t: fmt(stop.t0 + i * stop.dt, 2), v: fmt(stop.v[i] ?? 0, 2), ratio: fmt(stop.ratio[i] ?? 0, 3), limit: lim === null ? '—' : fmt(lim, 3) };
  });
  const head = (n: number) => (
    <div className="lp-floor-text">
      <span className="lp-floor-n" aria-hidden="true">{n}</span>
      <h2 id={`${FLOORS[n]}-h`}>{t(`fl${n}H`)}</h2>
      <p>{t(`fl${n}T`)}</p>
    </div>
  );
  return (
    <div className="lp-wrap lp-floors">
      <div className="lp-rail">
        <FloorNav floors={floors} label={t('floorsLabel')} />
      </div>
      <div className="lp-floor-list">
        <section id={FLOORS[0]} className="lp-floor" aria-labelledby={`${FLOORS[0]}-h`}>
          {head(0)}
          <Sheet name="lp-plan" label={t('planLabel')} caption={t('showPlan')} scale={LANDING_DRAWINGS['lp-plan'].scale} />
        </section>

        <section id={FLOORS[1]} className="lp-floor" aria-labelledby={`${FLOORS[1]}-h`}>
          {head(1)}
          <div className="lp-pair">
            <Sheet name="lp-section" label={t('sectionLabel')} caption={t('showSection')} scale={LANDING_DRAWINGS['lp-section'].scale} />
            <Frame src="/img/lp-3d-shaft.webp" w={400} h={800} alt={t('show3dShaft')} cls="tall" sizes="(min-width: 1100px) 300px, 45vw" />
          </div>
        </section>

        <section id={FLOORS[2]} className="lp-floor" aria-labelledby={`${FLOORS[2]}-h`}>
          {head(2)}
          <div className="lp-ledger">
            <h3 id="lp-ledger-title">{t('ledgerTitle', { count: sample.checks.length })}</h3>
            <p className="lp-ledger-note">{t('ledgerNote', { engine: sample.engine, verdict: sample.verdict, ...sample.machine })}</p>
            {/* a region of its own: on a narrow screen it scrolls sideways, also from the keyboard */}
            <div className="lp-ledger-scroll" role="region" aria-labelledby="lp-ledger-title" tabIndex={0}>
              <table>
                <thead><tr><th scope="col">{t('ledgerCheck')}</th><th scope="col">{t('ledgerValue')}</th><th scope="col">{t('ledgerLimit')}</th><th scope="col">{t('ledgerResult')}</th></tr></thead>
                <tbody>
                  {sample.checks.map((c) => (
                    <tr key={c.id} className={`is-${c.status}`}>
                      <th scope="row">{c.label}</th>
                      <td>{c.value}</td>
                      <td>{c.limit}</td>
                      <td><span className="lp-pill">{c.statusText}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id={FLOORS[3]} className="lp-floor" aria-labelledby={`${FLOORS[3]}-h`}>
          {head(3)}
          <div className="lp-cinema">
            <figure className="lp-run">
              <figcaption className="lp-run-head">
                <h3>{t('simTitle')}</h3>
                <p>{tl('sum_brake_ok', { a: fmt(stop.accel, 2), util: fmt(stop.util, 2), d0: fmt(stop.stop * 100, 0) })}</p>
              </figcaption>
              <SimPreview t0={stop.t0} dt={stop.dt} v={stop.v} ratio={stop.ratio} limit={stop.limit} brakeOn={stop.brakeOn} carStop={stop.carStop}
                intlLocale={intlLocale} text={{ speed: tl('ch_v'), ratio: tl('ch_ratio'), limit: tl('ch_limit'), brake: t('simBrake'), stop: t('simStop'),
                  time: tl('time'), peak: t('simPeak', { peak: fmt(stop.peak, 3) }) }} />
              <details className="lp-run-data">
                <summary>{t('simData')}</summary>
                <div className="lp-run-scroll" role="region" aria-label={t('simData')} tabIndex={0}>
                  <table>
                    <thead><tr><th scope="col">{tl('time')} [s]</th><th scope="col">{tl('ch_v')} [m/s]</th><th scope="col">T1/T2</th><th scope="col">{tl('ch_limit')}</th></tr></thead>
                    <tbody>{rows.map((r) => <tr key={r.t}><td>{r.t}</td><td>{r.v}</td><td>{r.ratio}</td><td>{r.limit}</td></tr>)}</tbody>
                  </table>
                </div>
              </details>
            </figure>
            <div className="lp-cinema-frames">
              <Frame src="/img/lp-3d-car.webp" set="/img/lp-3d-car-800.webp 800w, /img/lp-3d-car.webp 1280w" w={1280} h={860} alt={t('show3dCar')} cls="wide"
                sizes="(min-width: 1100px) 340px, (min-width: 760px) 45vw, 100vw" />
              <Frame src="/img/lp-3d-room.webp" set="/img/lp-3d-room-800.webp 800w, /img/lp-3d-room.webp 1280w" w={1280} h={860} alt={t('show3dRoom')} cls="wide"
                sizes="(min-width: 1100px) 340px, (min-width: 760px) 45vw, 100vw" />
            </div>
          </div>
        </section>

        <section id={FLOORS[4]} className="lp-floor lp-floor-wide" aria-labelledby={`${FLOORS[4]}-h`}>
          {head(4)}
          <div className="lp-docs">
            <ol className="lp-desk">
              {docs.map((d) => (
                <li key={d.name}>
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element -- pages of the sample's documents made by scripts/landing-docs.ts */}
                    <img src={`/img/${d.name}.webp`} width={d.w} height={d.h} alt={d.caption} loading="lazy" decoding="async" />
                    <figcaption><span className="lp-desk-n" aria-hidden="true">{d.k + 1}</span>{d.caption}</figcaption>
                  </figure>
                </li>
              ))}
            </ol>
            <p className="lp-docs-note">{t('docsNote')}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
