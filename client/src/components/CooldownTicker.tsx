import React, { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';

/**
 * Live cooldown ticker — sits at the top of every in-app page.
 *
 * Shows every action that is still on cooldown with a live countdown.
 * Re-renders once per second via a tiny local `now` clock; the cooldown
 * timestamps themselves are loaded into the global store on every
 * `/character/me` refresh, so any successful action (which triggers a
 * refresh) propagates here without per-page wiring.
 *
 * Refreshes the character (and therefore cooldowns) automatically when
 * the soonest cooldown elapses, so the bar disappears the moment the
 * action becomes available again — no manual reload needed.
 */

const LABEL: Record<string, string> = {
  hunt: 'Hunting',
  camp: 'Camp',
  tower: 'Tower of Trials',
  dungeon: 'Dungeons',
  quest: 'Quests',
  arena: 'Arena',
};

const COLOR: Record<string, string> = {
  hunt:    '#ff7468',
  camp:    '#ffb159',
  tower:   '#c294ff',
  dungeon: '#e85a4f',
  quest:   '#6aa7ff',
  arena:   '#d6a13d',
};

function fmt(ms: number): string {
  if (ms <= 0) return 'ready';
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function CooldownTicker(): React.ReactElement | null {
  const cooldowns = useStore((s) => s.cooldowns);
  const character = useStore((s) => s.character);
  const refresh = useStore((s) => s.refreshCharacter);
  const toast = useStore((s) => s.toast);
  const [now, setNow] = useState(Date.now());
  const [skipping, setSkipping] = useState(false);

  // Audit (animation MEDIUM #12): the old ticker fired a setInterval
  // unconditionally — every second the parent re-rendered even when
  // no cooldowns were active. Now the tick only runs while at least
  // one cooldown is in the future, and the interval shuts off the
  // moment everything is ready.
  const hasActive = Object.values(cooldowns || {}).some((v) => typeof v === 'number' && v > now);
  useEffect(() => {
    if (!hasActive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasActive]);

  // When the soonest cooldown elapses, pull fresh data so the bar clears
  // (and any matching "ready" toast the user expects from a successful
  // refresh fires through the existing path).
  const soonest = Math.min(
    ...Object.values(cooldowns || {})
      .map((v) => (v && v > now ? v : Infinity)),
  );
  useEffect(() => {
    if (!isFinite(soonest)) return;
    const delay = Math.max(150, soonest - Date.now());
    const id = setTimeout(() => { refresh(); }, delay);
    return () => clearTimeout(id);
  }, [soonest, refresh]);

  if (!character) return null;
  const active = Object.entries(cooldowns || {})
    .filter(([, ts]) => typeof ts === 'number' && ts > now)
    .sort((a, b) => (a[1] as number) - (b[1] as number));
  if (active.length === 0) return null;

  const gems = (character as any).gems || 0;
  // Mirror the server price (routes/character.ts /skip-cooldowns): one gem
  // per minute of total remaining cooldown, min 1, capped at 50. Showing a
  // flat "1💎" under-quoted the real cost and let players click a skip they
  // could not afford (the server then 429'd).
  const totalRemainingMs = active.reduce((s, [, ts]) => s + Math.max(0, (ts as number) - now), 0);
  const gemCost = Math.min(50, Math.max(1, Math.ceil(totalRemainingMs / 60_000)));
  async function skip() {
    if (skipping || gems < gemCost) return;
    setSkipping(true);
    try {
      const r = await api.post('/character/skip-cooldowns', {});
      const spent = r.gem_cost ?? gemCost;
      toast(`Cleared ${r.cleared} cooldown${r.cleared === 1 ? '' : 's'} for ${spent} gem${spent === 1 ? '' : 's'}.`, 'success');
      await refresh();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setSkipping(false); }
  }

  return (
    <div className="cooldown-ticker" role="status" aria-live="polite">
      <div className="cooldown-ticker-label">On cooldown</div>
      <div className="cooldown-ticker-list">
        {active.map(([kind, ts]) => {
          const remaining = (ts as number) - now;
          return (
            <div key={kind} className="cooldown-chip" style={{ borderColor: COLOR[kind] }}>
              <span className="cooldown-dot" style={{ background: COLOR[kind] }} />
              <span className="cooldown-name">{LABEL[kind] || kind}</span>
              <span className="cooldown-time">{fmt(remaining)}</span>
            </div>
          );
        })}
      </div>
      <button
        className="cooldown-skip"
        onClick={skip}
        disabled={skipping || gems < gemCost}
        title={gems < gemCost ? `Need ${gemCost} gem${gemCost === 1 ? '' : 's'}` : `Spend ${gemCost} gem${gemCost === 1 ? '' : 's'} to clear every cooldown`}
      >
        ⏱ Skip · {gemCost}💎
      </button>
    </div>
  );
}
