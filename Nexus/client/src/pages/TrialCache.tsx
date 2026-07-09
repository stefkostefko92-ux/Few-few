import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Sprite from '../components/Sprite';

interface Offering {
  slug: string;
  name: string;
  description: string;
  cost: number;
  category: 'gear' | 'consumable' | 'cosmetic';
  effect: any;
  once: boolean;
  already_owned: boolean;
}

const ICON_BY_SLUG: Record<string, string> = {
  forge_guarantee: 'icon-anvil',
  mythic_strength: 'potion-red',
  mythic_dexterity: 'potion-green',
  mythic_intelligence: 'potion-blue',
  trial_helm: 'helm-t5',
  trial_armor: 'armor-t5',
  trial_blade: 'sword-t5',
};

export default function TrialCache(): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const [tokens, setTokens] = useState(0);
  const [guarantees, setGuarantees] = useState(0);
  const [offerings, setOfferings] = useState<Offering[]>([]);

  async function load() {
    try {
      const r = await api.get('/trial-cache');
      setTokens(r.tokens || 0);
      setGuarantees(r.forge_guarantees || 0);
      setOfferings(r.offerings || []);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);

  async function buy(o: Offering) {
    try {
      const r = await api.post('/trial-cache/buy', { slug: o.slug });
      toast(t('trialCache.acquired', { name: r.name }), 'success');
      await Promise.all([load(), refresh()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  const groups: Record<string, Offering[]> = {};
  for (const o of offerings) {
    (groups[o.category] = groups[o.category] || []).push(o);
  }

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('trialCache.title')}</h2>
            <div className="panel-subtitle">
              {t('trialCache.subtitle')}
            </div>
          </div>
          <div className="flex gap-sm">
            <span className="tag" style={{ background: 'rgba(255,232,138,.12)', color: 'var(--gold-1)', fontFamily: 'var(--font-mono)' }}>
              {t('trialCache.tokens', { n: tokens })}
            </span>
            {guarantees > 0 && (
              <span className="tag" style={{ background: 'rgba(106,167,255,.12)', color: 'var(--azure-1)', fontFamily: 'var(--font-mono)' }}>
                {t('trialCache.wards', { n: guarantees })}
              </span>
            )}
          </div>
        </div>
      </div>

      {Object.entries(groups).map(([cat, items]) => (
        <div key={cat} className="panel">
          <div className="panel-title" style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--text-3)', marginBottom: 12 }}>
            {t(`trialCache.category.${cat}`, { defaultValue: cat })}
          </div>
          <div className="grid-cards">
            {items.map((o) => {
              const affordable = tokens >= o.cost;
              const sold = o.once && o.already_owned;
              return (
                <div key={o.slug} className="card" style={{ padding: 16, opacity: sold ? 0.55 : 1 }}>
                  <div className="flex" style={{ gap: 14, alignItems: 'flex-start' }}>
                    <div style={{ width: 64, height: 64, display: 'grid', placeItems: 'center', background: 'radial-gradient(circle, rgba(255,232,138,.12), transparent 65%)', borderRadius: 10 }}>
                      <Sprite name={ICON_BY_SLUG[o.slug] || 'icon-portal'} tone={o.category === 'gear' ? 'weapon' : 'potion'} size={52} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{o.name}</strong>
                      <div className="muted text-sm" style={{ marginTop: 4 }}>{o.description}</div>
                    </div>
                  </div>
                  <div className="flex between" style={{ marginTop: 14 }}>
                    <span className="tag" style={{ background: 'rgba(255,232,138,.15)', color: 'var(--gold-1)', fontFamily: 'var(--font-mono)' }}>
                      ⬢ {o.cost}
                    </span>
                    <button className="btn btn-primary" disabled={!affordable || sold} onClick={() => buy(o)}>
                      {sold ? t('trialCache.owned') : affordable ? t('trialCache.redeem') : t('trialCache.needMore', { n: o.cost - tokens })}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
