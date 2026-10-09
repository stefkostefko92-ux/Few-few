import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

/**
 * Mythic+ Dungeons — endless tier-scaled re-runs of scripted dungeons.
 * Each tier scales monster stats by 12%; every tenth tier guarantees
 * a loot-pool drop. Five consecutive fails pity-unlock the next tier.
 */
export default function MythicPlus(): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const [state, setState] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setState(await api.get('/mythic-plus/')); }
    catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function enter(slug: string, tier: number) {
    if (busy) return;
    setBusy(true);
    try {
      await api.post('/mythic-plus/enter', { slug, tier });
      toast(t('mythicPlus.enteredToast', { name: slug, tier }), 'success');
      await load();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function strike(slug: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post('/mythic-plus/strike', { slug });
      if (r.success) {
        if (r.next_stage >= r.total_stages) toast(t('mythicPlus.finalStageCleared'), 'success');
        else toast(t('mythicPlus.stageClearedToast', { stage: r.next_stage, total: r.total_stages }), 'success');
      } else {
        toast(r.pity_unlocked ? t('mythicPlus.pityUnlock') : t('mythicPlus.wiped'), 'info');
      }
      await load();
      refresh();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function claim(slug: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post('/mythic-plus/claim', { slug });
      const drop = r.milestoneDrop ? t('mythicPlus.dropSuffix', { name: r.milestoneDrop }) : '';
      toast(t('mythicPlus.claimToast', { tier: r.tier, gold: r.gold, xp: r.xp, drop }), 'success');
      await load();
      refresh();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  if (!state) return <div className="page"><div className="muted">{t('mythicPlus.loading')}</div></div>;

  return (
    <div className="page mythic-plus-page">
      <header className="page-header">
        <h1>{t('mythicPlus.title')}</h1>
        <span className="muted">{t('mythicPlus.scaling', { pct: state.tier_scale_pct })}</span>
      </header>

      <p className="muted" style={{ marginBottom: 18 }}>
        {t('mythicPlus.description')}
      </p>

      {/* Без изчистено скриптовано подземие списъкът е празен — страницата изглеждаше счупена. */}
      {state.dungeons.length === 0 && (
        <div className="panel empty-state">
          <div className="empty-state-title">{t('mythicPlus.emptyTitle')}</div>
          <p className="muted">{t('mythicPlus.emptyBody')}</p>
          <Link to="/app/dungeons" className="btn btn-primary">{t('mythicPlus.emptyCta')}</Link>
        </div>
      )}

      <div className="dungeon-grid">
        {state.dungeons.map((d: any) => {
          // run_active идва от сървъра (run_started_at) — оцелява при
          // презареждане и се нулира при загуба, без локално състояние.
          const inProgress = !!d.run_active;
          const cleared = inProgress && d.current_stage >= d.stages;
          return (
            <div key={d.slug} className="card dungeon-card">
              <h3>{d.name}</h3>
              <div className="muted text-sm">{d.region} · {t('mythicPlus.lv', { n: d.level_req })}</div>
              <div className="mythic-stats">
                <div><div className="muted text-sm">{t('mythicPlus.bestTier')}</div><div className="num">{d.best_tier}</div></div>
                <div><div className="muted text-sm">{t('mythicPlus.stages')}</div><div className="num">{d.stages}</div></div>
                {d.consecutive_fails > 0 && (
                  <div><div className="muted text-sm">{t('mythicPlus.fails')}</div><div className="num">{d.consecutive_fails} / 5</div></div>
                )}
              </div>
              {inProgress && (
                <div className="mythic-progress">
                  <strong>{t('mythicPlus.inProgressTier', { tier: d.current_tier })}</strong>
                  <div className="muted text-sm">{t('mythicPlus.stageProgress', { stage: d.current_stage, total: d.stages })}</div>
                </div>
              )}
              {!inProgress && (
                <div className="mythic-tier-buttons">
                  {[d.best_tier, d.best_tier + 1].map((tier) => (
                    tier > 0 && (
                      <button key={tier} className="btn btn-sm" disabled={busy} onClick={() => enter(d.slug, tier)}>
                        {t('mythicPlus.enterTier', { tier })}
                      </button>
                    )
                  ))}
                  {/* При best_tier 0 списъкът по-горе вече дава „ниво 1“ — без дубликат. */}
                </div>
              )}
              {inProgress && !cleared && (
                <button className="btn btn-primary" disabled={busy} onClick={() => strike(d.slug)}>
                  {t('mythicPlus.strikeNext')}
                </button>
              )}
              {cleared && (
                <button className="btn btn-primary" disabled={busy} onClick={() => claim(d.slug)}>
                  {t('mythicPlus.claimReward')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
