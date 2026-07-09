import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Sprite from '../components/Sprite';

interface Bounty {
  id: string;
  monster_slug: string;
  monster_name: string;
  region: string;
  count_required: number;
  count_done: number;
  tier: 'easy' | 'standard' | 'brutal';
  reward: { gold: number; xp: number; trophy: number };
  claimed: boolean;
}

const TIER_COLOR: Record<string, string> = {
  easy: '#6ad8a4',
  standard: '#6aa7ff',
  brutal: '#e85a4f',
};

function pickMonsterSprite(slug: string): string {
  // Map common monster slug prefixes to our sprite set.
  if (/wolf|hound|cur/i.test(slug)) return 'monster-wolf';
  if (/goblin|imp/i.test(slug)) return 'monster-goblin';
  if (/spider|scorpion|crawler/i.test(slug)) return 'monster-spider';
  if (/skeleton|undead|skel/i.test(slug)) return 'monster-skeleton';
  if (/orc|brute|warlord/i.test(slug)) return 'monster-orc';
  if (/bat|wraith/i.test(slug)) return 'monster-bat';
  if (/dragon|wyrm|drake/i.test(slug)) return 'monster-dragon';
  if (/hydra|serpent/i.test(slug)) return 'monster-hydra';
  if (/ghost|spectre|wisp/i.test(slug)) return 'monster-ghost';
  if (/myco|mushroom|spore/i.test(slug)) return 'monster-mushroom';
  return 'monster-skull';
}

export default function Bounties(): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const showLevelUp = useStore((s) => s.showLevelUp);
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [refreshAt, setRefreshAt] = useState<number>(0);
  const [now, setNow] = useState(Date.now());

  async function load() {
    try {
      const r = await api.get('/bounties');
      setBounties(r.bounties || []);
      setRefreshAt(r.refresh_at || 0);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function claim(b: Bounty) {
    try {
      const r = await api.post('/bounties/claim', { id: b.id });
      const trophyStr = r.trophy ? t('bounties.trophySuffix', { n: r.trophy }) : '';
      toast(t('bounties.claimToast', { gold: r.gold, xp: r.xp, trophy: trophyStr }), 'success');
      if (r.levelUp) showLevelUp(r.levelUp);
      await Promise.all([load(), refresh()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  const remaining = Math.max(0, refreshAt - now);
  const rh = Math.floor(remaining / 3_600_000);
  const rm = Math.floor((remaining % 3_600_000) / 60_000);

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('bounties.title')}</h2>
            <div className="panel-subtitle">
              {t('bounties.subtitle')} {t('bounties.resetsIn')} <span style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-mono)' }}>{t('bounties.time', { h: rh, m: rm })}</span>.
            </div>
          </div>
        </div>
      </div>

      <div className="grid-cards">
        {bounties.length === 0 && <div className="muted">{t('bounties.loading')}</div>}
        {bounties.map((b) => {
          const pct = Math.min(100, (b.count_done / b.count_required) * 100);
          const ready = b.count_done >= b.count_required;
          const color = TIER_COLOR[b.tier];
          return (
            <div key={b.id} className={`card rarity-border-${b.tier === 'brutal' ? 'rare' : b.tier === 'standard' ? 'uncommon' : 'common'}`} style={{ padding: 18 }}>
              <div className="flex" style={{ gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 56, height: 56, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.03)', borderRadius: 10 }}>
                  <Sprite name={pickMonsterSprite(b.monster_slug)} tone="monster" size={44} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="flex between" style={{ alignItems: 'baseline' }}>
                    <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)', fontSize: 18 }}>{b.monster_name}</strong>
                    <span className="tag" style={{ background: `${color}22`, color, fontSize: 10 }}>{t(`bounties.tier.${b.tier}`)}</span>
                  </div>
                  <div className="muted text-sm" style={{ marginTop: 4, textTransform: 'capitalize' }}>{b.region.replace(/_/g, ' ')}</div>
                </div>
              </div>

              <div style={{ marginTop: 14 }} className="bar">
                <div className="bar-fill xp" style={{ width: `${pct}%`, background: color, transition: 'width .5s ease' }} />
              </div>
              <div className="flex between" style={{ marginTop: 6 }}>
                <span className="muted text-sm">{t('bounties.kills')}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: ready ? 'var(--emerald-1)' : 'var(--text-2)' }}>
                  {b.count_done} / {b.count_required}
                </span>
              </div>

              <div className="flex gap-sm" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                <span className="tag gold">{t('bounties.goldTag', { n: b.reward.gold })}</span>
                <span className="tag emerald">{t('bounties.xpTag', { n: b.reward.xp })}</span>
                <span className="tag" style={{ background: 'rgba(232,90,79,.15)', color: 'var(--crimson-1)' }}>{t('bounties.trophyTag', { n: b.reward.trophy })}</span>
              </div>

              <button
                className="btn btn-primary"
                disabled={!ready || b.claimed}
                onClick={() => claim(b)}
                style={{ width: '100%', marginTop: 14 }}
              >
                {b.claimed ? t('bounties.claimed') : ready ? t('bounties.claimReward') : t('bounties.huntMore', { n: b.count_required - b.count_done })}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
