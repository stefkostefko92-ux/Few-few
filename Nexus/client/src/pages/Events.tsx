import React, { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

/**
 * Seasonal Events — four UTC windows per year. While a season is
 * active, kills against the target family pay points; points redeem
 * at the season vendor for cosmetics and a tier-9 trophy.
 */
export default function Events(): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const [state, setState] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setState(await api.get('/events/')); }
    catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function claim(slug: string) {
    if (busy) return;
    setBusy(true);
    try {
      await api.post('/events/claim', { slug });
      toast(t('events.redeemed'), 'success');
      await load();
      refresh();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  if (!state) return <div className="page"><div className="muted">{t('events.loading')}</div></div>;

  if (!state.active) {
    return (
      <div className="page events-page">
        <header className="page-header">
          <h1>{t('events.title')}</h1>
        </header>
        <div className="card">
          <h2>{t('events.betweenTitle')}</h2>
          <p className="muted">
            <Trans
              i18nKey="events.nextSeason"
              values={{ name: state.next_season.name, date: state.next_season.starts }}
              components={{ b: <strong /> }}
            />
          </p>
          <p className="muted">
            {t('events.fourWindows')}
          </p>
        </div>
      </div>
    );
  }

  const s = state.season;
  return (
    <div className="page events-page">
      <header className="page-header">
        <h1>{s.name}</h1>
        <span className="muted">{s.window.start} → {s.window.end} UTC</span>
      </header>

      <section className="card">
        <p className="event-flavor">"{s.flavor}"</p>
        <div className="event-points">
          <span className="muted">{t('events.seasonPoints')}</span>
          <strong className="event-points-num">{state.points.toLocaleString()}</strong>
        </div>
        <div className="muted text-sm">
          {t('events.earnPoints', { families: s.point_families.join(' / ') })}
        </div>
      </section>

      <section className="card">
        <h2>{t('events.vendorTitle')}</h2>
        <div className="event-rewards">
          {state.rewards.map((r: any) => (
            <div key={r.slug} className={`event-reward ${r.owned ? 'owned' : ''}`}>
              <div className="event-reward-head">
                <span className="tag">{r.kind}</span>
                <span className="event-reward-cost">{t('events.pts', { n: r.cost.toLocaleString() })}</span>
              </div>
              <div className="event-reward-name">{r.name}</div>
              <div className="muted text-sm event-reward-flavor">{r.flavor}</div>
              <button
                className="btn btn-primary"
                disabled={busy || r.owned || state.points < r.cost}
                onClick={() => claim(r.slug)}
              >
                {r.owned ? t('events.owned') : (state.points < r.cost ? t('events.needMore', { n: (r.cost - state.points).toLocaleString() }) : t('events.redeem'))}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
