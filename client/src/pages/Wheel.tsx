import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

interface Segment { kind: string; label: string }

const COLORS = ['#d6a13d', '#1f8b54', '#2b58c4', '#6f3fb6', '#b6261b', '#1f8b54', '#d6a13d', '#ffb159'];

export default function Wheel(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const showUnlocks = useStore((s) => s.showUnlocks);
  const [canSpin, setCanSpin] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  async function load() {
    const r = await api.get('/wheel');
    setCanSpin(r.canSpin);
    setSegments(r.segments);
  }
  useEffect(() => { load(); }, []);

  async function spin() {
    if (!canSpin || spinning) return;
    setSpinning(true);
    try {
      const r = await api.post('/wheel/spin');
      // Find the segment index by matching kind & label (server uses internal weighted draw)
      const idx = segments.findIndex((s) => s.kind === r.kind && s.label === r.label);
      const target = idx >= 0 ? idx : 0;
      const sweep = 360 / segments.length;
      // Land in the middle of the target segment + many full rotations
      const finalRotation = 360 * 6 + (360 - (target * sweep) - sweep / 2);
      setRotation(finalRotation);
      await new Promise((res) => setTimeout(res, 4200));
      toast(`${r.label}: ${describeReward(r)}`, 'success');
      if (r.levelUp) toast(`Level Up! → ${r.levelUp.toLevel}`, 'success');
      showUnlocks(r.unlocked);
      setLastResult(r);
      setCanSpin(false);
      await refresh();
    } catch (e: any) {
      toast(e.message, 'error');
      setSpinning(false);
    } finally {
      setTimeout(() => setSpinning(false), 4300);
    }
  }

  const segSweep = 360 / Math.max(1, segments.length);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Wheel of Fortune</h2>
          <div className="panel-subtitle">{canSpin ? 'One spin awaits, hero.' : 'Come back tomorrow for another spin.'}</div>
        </div>
      </div>
      <div className="wheel-stage">
        <div className="wheel-pointer" />
        <div className="wheel" ref={wheelRef} style={{ transform: `rotate(${rotation}deg)` }}>
          {segments.map((seg, i) => (
            <div
              key={i}
              className="wheel-segment"
              style={{
                background: `conic-gradient(${COLORS[i % COLORS.length]} 0 ${segSweep}deg, transparent ${segSweep}deg 360deg)`,
                transform: `rotate(${i * segSweep}deg)`,
              }}
            />
          ))}
          {segments.map((seg, i) => (
            <div
              key={`label-${i}`}
              className="wheel-label"
              style={{
                transform: `rotate(${i * segSweep + segSweep / 2}deg) translateY(-110px) rotate(${-(i * segSweep + segSweep / 2)}deg)`,
              }}
            >
              <span>{iconFor(seg.kind)}</span>
              <span style={{ fontSize: 10 }}>{seg.label.split(' ').slice(0, 2).join(' ')}</span>
            </div>
          ))}
          <div className="wheel-hub">Spin</div>
        </div>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
          <button className="btn btn-primary" disabled={!canSpin || spinning} onClick={spin}>
            {spinning ? 'Spinning…' : canSpin ? 'Spin the Wheel' : 'Locked Until Tomorrow'}
          </button>
        </div>
        {lastResult && (
          <div className="card" style={{ marginTop: 16, textAlign: 'center' }}>
            <strong style={{ color: 'var(--gold-1)' }}>{lastResult.label}</strong>
            <div className="muted">{describeReward(lastResult)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function iconFor(kind: string) {
  if (kind === 'gold' || kind === 'jackpot') return '💰';
  if (kind === 'xp') return '✨';
  if (kind === 'potion') return '🧪';
  if (kind === 'energy') return '⚡';
  if (kind === 'item') return '💍';
  return '🎁';
}

function describeReward(r: any): string {
  const parts: string[] = [];
  if (r.goldDelta > 0) parts.push(`+${r.goldDelta} gold`);
  if (r.xpDelta > 0) parts.push(`+${r.xpDelta} XP`);
  if (r.energyDelta > 0) parts.push(`+${r.energyDelta} energy`);
  if (r.itemSlug) parts.push(`Item: ${r.itemSlug.replace(/_/g, ' ')}`);
  return parts.join('  ·  ');
}
