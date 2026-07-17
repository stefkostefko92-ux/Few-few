import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { BestiaryEntry } from '../lib/types';
import { spriteFor } from '../combat/sprites';

interface RegionProgress {
  region: string; total: number; killed: number;
  complete: boolean; claimed: boolean; reward_gold: number; reward_gems: number;
}

export default function Bestiary(): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const [list, setList] = useState<BestiaryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [discovered, setDiscovered] = useState(0);
  const [regionProgress, setRegionProgress] = useState<RegionProgress[]>([]);
  const [filter, setFilter] = useState<string>('all');

  function load() {
    api.get('/bestiary').then((r) => {
      setList(r.bestiary); setTotal(r.total); setDiscovered(r.discovered);
      setRegionProgress(r.regions || []);
    });
  }
  useEffect(() => { load(); }, []);

  async function claim(region: string) {
    try {
      const r = await api.post('/bestiary/claim', { region });
      toast(t('bestiary.claimedToast', { gold: r.gold, gems: r.gems, defaultValue: 'Collection reward: +{{gold}}g, +{{gems}} gems!' }), 'success');
      load();
      refresh();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  const regions = Array.from(new Set(list.map((m) => m.region)));
  const filtered = filter === 'all' ? list : list.filter((m) => m.region === filter);

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('bestiary.title')}</h2>
            <div className="panel-subtitle">{t('bestiary.subtitle', { discovered, total })}</div>
          </div>
          <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
            <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : ''}`} onClick={() => setFilter('all')}>{t('bestiary.all')}</button>
            {regions.map((r) => (
              <button key={r} className={`btn btn-sm ${filter === r ? 'btn-primary' : ''}`} onClick={() => setFilter(r)}>
                {prettyRegion(r)}
              </button>
            ))}
          </div>
        </div>
        {/* Колекции по региони: прогрес + еднократна награда при пълен регион. */}
        {regionProgress.length > 0 && (
          <div className="grid-cards" style={{ marginBottom: 16 }}>
            {regionProgress.map((rp) => (
              <div key={rp.region} className="card" style={rp.complete && !rp.claimed ? { borderColor: 'var(--gold-3)', background: 'rgba(214,161,61,.06)' } : undefined}>
                <div className="flex between" style={{ alignItems: 'center' }}>
                  <strong>{prettyRegion(rp.region)}</strong>
                  <span className="muted text-sm">{rp.killed}/{rp.total}</span>
                </div>
                <div className="bar" style={{ height: 8, margin: '8px 0' }}>
                  <div className="bar-fill xp" style={{ width: `${(rp.killed / Math.max(1, rp.total)) * 100}%` }} />
                </div>
                <div className="flex between" style={{ alignItems: 'center' }}>
                  <span className="muted text-sm">💰 {rp.reward_gold.toLocaleString()}g · 💎 {rp.reward_gems}</span>
                  {rp.claimed ? (
                    <span className="tag" style={{ color: 'var(--green-1, #6ad8a4)' }}>{t('bestiary.claimed', { defaultValue: 'Claimed ✓' })}</span>
                  ) : rp.complete ? (
                    <button className="btn btn-primary btn-sm" onClick={() => claim(rp.region)}>{t('bestiary.claim', { defaultValue: 'Claim' })}</button>
                  ) : (
                    <span className="muted text-sm">{t('bestiary.slayAll', { defaultValue: 'Slay them all' })}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="bar" style={{ height: 12, marginBottom: 16 }}>
          <div className="bar-fill xp" style={{ width: `${(discovered / Math.max(1, total)) * 100}%` }} />
        </div>
        <div className="grid-cards">
          {filtered.map((m) => (
            <div key={m.slug} className="card">
              <div style={{ position: 'relative', height: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                <div style={{
                  transform: 'scale(.45) translateY(20%)',
                  filter: m.discovered ? undefined : 'brightness(0)',
                  opacity: m.discovered ? 1 : 0.6,
                }}>
                  {spriteFor(m.sprite)}
                </div>
              </div>
              <strong style={{ color: m.discovered ? 'var(--gold-1)' : 'var(--text-3)' }}>{m.name}</strong>
              <div className="muted text-sm" style={{ textTransform: 'capitalize' }}>
                {m.discovered ? `${m.family} · ${prettyRegion(m.region)}` : `${prettyRegion(m.region)} · ${t('bestiary.lv', { n: m.level })}`}
              </div>
              {m.discovered && (
                <>
                  <div className="flex gap-sm" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                    <span className="tag">{t('bestiary.lv', { n: m.level })}</span>
                    <span className="tag">HP {m.hp}</span>
                    <span className="tag">ATK {m.atk_min}-{m.atk_max}</span>
                    <span className="tag">DEF {m.defense}</span>
                  </div>
                  <div className="muted text-sm" style={{ marginTop: 8 }}>
                    {t('bestiary.kills')} <span className="gold">{m.kills}</span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function prettyRegion(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
