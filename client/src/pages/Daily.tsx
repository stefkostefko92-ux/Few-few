import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

interface DailyData {
  streak: number;
  longest_streak: number;
  canClaim: boolean;
  streakOnClaim: number;
  nextReward: { day: number; gold: number; xp: number; item?: string };
}

interface DailyQuest {
  slug: string;
  title: string;
  region: string;
  level_req: number;
  xp_reward: number;
  gold_reward: number;
  bonus_xp: number;
  bonus_gold: number;
  completed: boolean;
}

export default function Daily(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const showUnlocks = useStore((s) => s.showUnlocks);
  const [data, setData] = useState<DailyData | null>(null);
  const [quests, setQuests] = useState<DailyQuest[]>([]);
  const [resetAt, setResetAt] = useState(0);
  const [wheelInfo, setWheelInfo] = useState<{ canSpin: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [d, q, w] = await Promise.all([
      api.get('/daily'),
      api.get('/daily/quests'),
      api.get('/wheel'),
    ]);
    setData(d);
    setQuests(q.quests);
    setResetAt(q.resetAt);
    setWheelInfo(w);
  }

  useEffect(() => { load(); }, []);

  async function claim() {
    setBusy(true);
    try {
      const r = await api.post('/daily/claim');
      toast(`+${r.reward.gold} gold, +${r.reward.xp} XP. Streak: ${r.streak}`, 'success');
      if (r.levelUp) toast(`Level Up! → ${r.levelUp.toLevel}`, 'success');
      showUnlocks(r.unlocked);
      await Promise.all([load(), refresh()]);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function claimQuest(slug: string) {
    try {
      const r = await api.post('/daily/quests/claim', { questSlug: slug });
      toast(`Daily bonus: +${r.bonusGold}g, +${r.bonusXp} XP`, 'success');
      showUnlocks(r.unlocked);
      await Promise.all([load(), refresh()]);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  if (!data) return <div className="muted">Loading…</div>;

  const hours = Math.max(0, Math.floor((resetAt - Date.now()) / 3_600_000));
  const minutes = Math.max(0, Math.floor(((resetAt - Date.now()) % 3_600_000) / 60_000));

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Daily Tribute</h2>
            <div className="panel-subtitle">
              Resets in <strong>{hours}h {minutes}m</strong>. Don't break the streak.
            </div>
          </div>
          <div className="tag gold" style={{ fontSize: 14 }}>🔥 {data.streak}-day streak</div>
        </div>
        <div className="streak-row">
          {[1,2,3,4,5,6,7].map((d) => {
            const dayInCycle = ((data.streak) % 7) + (data.canClaim ? 0 : 1);
            const isCurrent = data.canClaim && (((data.streak) % 7) + 1) === d;
            const isClaimed = !data.canClaim && (((data.streak - 1) % 7) + 1) >= d;
            return (
              <div key={d} className={`streak-cell ${isCurrent ? 'current' : ''} ${isClaimed ? 'claimed' : ''}`}>
                <div className="streak-day">Day {d}</div>
                <div style={{ fontSize: 22 }}>{d === 7 ? '🎁' : '💰'}</div>
                <div className="text-sm gold">+{rewardForDay(d).gold}g</div>
                <div className="text-sm muted">+{rewardForDay(d).xp} xp</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={claim} disabled={!data.canClaim || busy}>
            {data.canClaim ? `Claim Day ${data.streakOnClaim} reward` : 'Already claimed today'}
          </button>
          <span className="muted" style={{ marginLeft: 12 }}>Longest streak: {data.longest_streak}</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Daily Quests</h2>
            <div className="panel-subtitle">Complete these quests today for <strong>2× rewards</strong>.</div>
          </div>
        </div>
        <div className="grid-cards">
          {quests.map((q) => (
            <div key={q.slug} className="card">
              <div className="flex between">
                <div>
                  <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{q.title}</strong>
                  <div className="muted text-sm" style={{ textTransform: 'capitalize' }}>
                    {q.region.replace(/_/g, ' ')} · Lv {q.level_req}
                  </div>
                </div>
                {q.completed && <span className="tag emerald">claimed</span>}
              </div>
              <div className="flex gap-sm" style={{ marginTop: 10 }}>
                <span className="tag gold">+{q.bonus_xp} XP</span>
                <span className="tag gold">+{q.bonus_gold}g</span>
              </div>
              <div className="flex gap-sm" style={{ marginTop: 12 }}>
                <Link to="/app/quests" className="btn btn-sm">Go to Quest</Link>
                <button className="btn btn-sm btn-primary" disabled={q.completed} onClick={() => claimQuest(q.slug)}>
                  Claim Bonus
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Wheel of Fortune</h2>
            <div className="panel-subtitle">One spin per day. Coin, XP, potions, or the royal jackpot.</div>
          </div>
          <Link to="/app/wheel" className="btn btn-primary">{wheelInfo?.canSpin ? 'Spin Now' : 'Visit Wheel'}</Link>
        </div>
      </div>
    </div>
  );
}

function rewardForDay(d: number): { gold: number; xp: number } {
  const m = { 1:{g:25,x:15}, 2:{g:40,x:25}, 3:{g:60,x:40}, 4:{g:90,x:60}, 5:{g:130,x:80}, 6:{g:180,x:110}, 7:{g:250,x:150} } as any;
  return { gold: m[d]?.g, xp: m[d]?.x };
}
