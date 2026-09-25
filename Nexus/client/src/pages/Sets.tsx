import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Sprite, { spriteForItem } from '../components/Sprite';
import type { SetTarget } from '../components/items3d/SetViewer3DModal';
import '../styles/sets.css';

const SetViewer3DModal = lazy(() => import('../components/items3d/SetViewer3DModal'));

interface SetBonus {
  hp_bonus?: number; mp_bonus?: number; str_bonus?: number; dex_bonus?: number;
  con_bonus?: number; int_bonus?: number; wis_bonus?: number; cha_bonus?: number;
  defense_bonus?: number; atk_bonus?: number; crit_bonus?: number; dodge_bonus?: number;
}
interface SetPieceDTO { slug: string; name: string; category: string; sub_type?: string; tier: number; rarity?: string; missing?: boolean }
interface SetDTO { slug: string; name: string; tier: number; rarity: string; class_focus: string | null; lore: string; pieces: SetPieceDTO[]; bonus_2: SetBonus | null; bonus_4: SetBonus | null; bonus_6: SetBonus | null }

function bonusLine(b: SetBonus | null): string {
  if (!b) return '';
  return Object.entries(b).filter(([, v]) => v).map(([k, v]) => `${k.replace('_bonus', '').toUpperCase()} +${v}`).join(' · ');
}

export default function Sets(): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const [sets, setSets] = useState<SetDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<SetTarget | null>(null);

  useEffect(() => {
    api.get('/sets').then((r) => setSets(r.sets || [])).catch((e) => toast(e.message, 'error')).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sets-page">
      <h1>{t('sets.title')}</h1>
      <p className="sets-sub">{t('sets.subtitle')}</p>
      {loading && <div className="sets-loading">{t('items3d.loading')}</div>}
      <div className="sets-grid">
        {sets.map((s) => (
          <div key={s.slug} className={`set-card rarity-${s.rarity}`}>
            <div className="set-card-head">
              <div className="set-card-name">{s.name}</div>
              <div className="set-card-tier">{t('items3d.tier', { tier: s.tier })}</div>
            </div>
            <div className="set-card-pieces">
              {s.pieces.map((p) => (
                <Sprite key={p.slug} {...spriteForItem({ ...p, slug: p.slug })} size={40} title={p.name} />
              ))}
            </div>
            <div className="set-card-bonuses">
              {s.bonus_2 && <div>2: {bonusLine(s.bonus_2)}</div>}
              {s.bonus_4 && <div>4: {bonusLine(s.bonus_4)}</div>}
              {s.bonus_6 && <div>6: {bonusLine(s.bonus_6)}</div>}
            </div>
            <p className="set-card-lore">{s.lore}</p>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setViewer({ kind: 'set', slug: s.slug, name: s.name, tier: s.tier, pieces: s.pieces })}
            >
              {t('sets.showcase')}
            </button>
          </div>
        ))}
      </div>
      {viewer && (
        <Suspense fallback={null}>
          <SetViewer3DModal target={viewer} onClose={() => setViewer(null)} />
        </Suspense>
      )}
    </div>
  );
}
