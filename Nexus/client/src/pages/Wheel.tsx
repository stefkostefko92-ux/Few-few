import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

// Сегментите идват от сървъра (routes/wheel.ts) с РЕАЛНИЯ шанс и наградата за нивото.
// Преди: еднакви резени (джакпотът 1% изглеждаше като 12.5%) и отрязани надписи.
interface Segment { id: string; kind: string; label: string; chance: number; amount: number }
interface SpinResult { id?: string; kind: string; label: string; goldDelta: number; xpDelta: number; energyDelta: number; itemSlug?: string | null; levelUp?: { toLevel: number }; unlocked?: unknown }

type Translate = (key: string, opts?: Record<string, unknown>) => string;

// Тон по вид награда — злато, опит, отвара, енергия, предмет, джакпот.
const TONES: Record<string, [string, string]> = {
  gold_stash: ['#b9862c', '#7a5212'],
  heavy_purse: ['#d6a13d', '#8f6418'],
  insight: ['#5a4bb0', '#2e2468'],
  vision: ['#7b58d6', '#3f2a86'],
  potion: ['#b2333a', '#5e1418'],
  vigor: ['#1f8b54', '#0f4a2c'],
  ring: ['#8d99ac', '#3e4757'],
  jackpot: ['#ffe08a', '#c8901f'],
};
const tone = (id: string) => TONES[id] || TONES.gold_stash;
// Ред на рисуване: съседните резени сменят цвета (злато ↔ опит ↔ отвара…); джакпотът
// стои между тъмни резени, за да се вижда. Непознати id-та отиват накрая.
const DRAW_ORDER = ['gold_stash', 'insight', 'heavy_purse', 'potion', 'vision', 'jackpot', 'vigor', 'ring'];
const R = 100; // радиус на колелото във viewBox единици
const SPIN_MS = 4600;

/** Точка по окръжността; ъгъл в градуси от 12 часа по часовниковата стрелка. */
function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}

function wedgePath(a0: number, a1: number): string {
  const [x0, y0] = polar(R, a0);
  const [x1, y1] = polar(R, a1);
  return `M0 0 L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

export default function Wheel(): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refreshCharacter);
  const showUnlocks = useStore((s) => s.showUnlocks);
  const [canSpin, setCanSpin] = useState(false);
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const spinMs = reduced ? 700 : SPIN_MS;

  async function load() {
    setFailed(false);
    try {
      const r = await api.get<{ canSpin: boolean; segments: Segment[] }>('/wheel');
      setCanSpin(r.canSpin);
      setSegments(r.segments);
    } catch (e: any) {
      setFailed(true);
      toast(e.message, 'error');
    }
  }
  useEffect(() => { load(); }, []);

  // Ъглите следват реалните шансове; най-малкият резен е поне 4°, за да се вижда.
  const arcs = useMemo(() => {
    if (!segments?.length) return [];
    const rank = (id: string) => { const i = DRAW_ORDER.indexOf(id); return i < 0 ? DRAW_ORDER.length : i; };
    const ordered = [...segments].sort((a, b) => rank(a.id) - rank(b.id));
    const raw = ordered.map((s) => Math.max(4, s.chance * 360));
    const k = 360 / raw.reduce((a, b) => a + b, 0);
    let at = 0;
    return ordered.map((s, i) => {
      const a0 = at;
      at += raw[i] * k;
      return { seg: s, a0, a1: at, mid: (a0 + at) / 2 };
    });
  }, [segments]);

  async function spin() {
    if (!canSpin || spinning || !arcs.length) return;
    setSpinning(true);
    setResult(null);
    try {
      const r = await api.post<SpinResult>('/wheel/spin');
      const hit = arcs.find((a) => (r.id ? a.seg.id === r.id : a.seg.kind === r.kind && a.seg.label === r.label)) ?? arcs[0];
      // Лек случаен отклон вътре в резена — иначе стрелката винаги спира точно в средата.
      const jitter = (Math.random() - 0.5) * (hit.a1 - hit.a0) * 0.6;
      setRotation((cur) => cur - (cur % 360) + 360 * (reduced ? 1 : 6) + (360 - hit.mid - jitter));
      await new Promise((res) => setTimeout(res, spinMs));
      setResult(r);
      toast(`${segName(r.id, r.label, t)}: ${describeReward(r, t)}`, 'success');
      if (r.levelUp) toast(t('wheel.levelUpToast', { level: r.levelUp.toLevel }), 'success');
      showUnlocks(r.unlocked as any);
      setCanSpin(false);
      await refresh();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSpinning(false);
    }
  }

  return (
    <div className="panel wheel-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{t('wheel.title')}</h2>
          <div className="panel-subtitle">{canSpin ? t('wheel.subtitleCanSpin') : t('wheel.subtitleComeBack')}</div>
        </div>
      </div>

      {failed && (
        <div className="wheel-error">
          <button className="btn" onClick={load}>{t('common.retry', { defaultValue: 'Retry' })}</button>
        </div>
      )}

      {segments && (
        <div className="wheel-layout">
          <div className="wheel-stage">
            <svg className="wheel-svg" viewBox="-118 -124 236 242" role="img" aria-label={t('wheel.title')}>
              <defs>
                {arcs.map(({ seg }) => (
                  <radialGradient key={seg.id} id={`wg-${seg.id}`} cx="0" cy="0" r={R} gradientUnits="userSpaceOnUse">
                    <stop offset="0.18" stopColor={tone(seg.id)[1]} />
                    <stop offset="1" stopColor={tone(seg.id)[0]} />
                  </radialGradient>
                ))}
                <linearGradient id="wg-rim" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#f6dc93" />
                  <stop offset="0.5" stopColor="#b4842c" />
                  <stop offset="1" stopColor="#6f4c12" />
                </linearGradient>
                <radialGradient id="wg-hub" cx="0.5" cy="0.35" r="0.7">
                  <stop offset="0" stopColor="#fbe7a6" />
                  <stop offset="1" stopColor="#a8761f" />
                </radialGradient>
              </defs>

              <circle r={R + 10} fill="url(#wg-rim)" />
              <circle r={R + 4} fill="#0b0a0d" />
              <g className="wheel-rotor" style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${spinMs}ms` }}>
                {arcs.map(({ seg, a0, a1, mid }) => {
                  const wide = a1 - a0 >= 26;
                  const [ix, iy] = polar(R * 0.85, mid);
                  // Надписът лежи по радиуса; на лявата половина се обръща, за да не е с главата надолу.
                  const flip = mid > 180;
                  return (
                    <g key={seg.id}>
                      <path d={wedgePath(a0, a1)} fill={`url(#wg-${seg.id})`} stroke="rgba(0,0,0,.55)" strokeWidth="0.8" />
                      <g transform={`translate(${ix.toFixed(2)} ${iy.toFixed(2)}) rotate(${mid.toFixed(2)})`}>
                        <Glyph kind={seg.id} />
                      </g>
                      {wide && (
                        <text
                          className="wheel-seg-label"
                          transform={`rotate(${mid.toFixed(2)}) translate(0 ${-R * 0.52}) rotate(${flip ? 90 : -90})`}
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          {t(`wheel.short.${seg.id}`, { defaultValue: segName(seg.id, seg.label, t) })}
                        </text>
                      )}
                    </g>
                  );
                })}
                {arcs.map(({ seg, a0 }) => {
                  const [x, y] = polar(R + 0.5, a0);
                  return <circle key={`peg-${seg.id}`} cx={x.toFixed(2)} cy={y.toFixed(2)} r="2.6" fill="#f3d27d" stroke="#5a3d0c" strokeWidth="0.8" />;
                })}
              </g>
              <circle r={R} fill="none" stroke="rgba(0,0,0,.6)" strokeWidth="1.5" />
              <path className="wheel-pointer" d="M0 -96 L-9 -122 L9 -122 Z" />
              <g className={`wheel-hub${canSpin && !spinning ? ' ready' : ''}`} onClick={spin} aria-hidden>
                <circle r="22" fill="url(#wg-hub)" stroke="#3a2708" strokeWidth="2" />
                <circle r="17" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="0.8" />
                <text textAnchor="middle" dominantBaseline="central" className="wheel-hub-text">{t('wheel.hub')}</text>
              </g>
            </svg>
            <button className="btn btn-primary btn-lg wheel-spin" disabled={!canSpin || spinning} onClick={spin}>
              {spinning ? t('wheel.spinning') : canSpin ? t('wheel.spinButton') : t('wheel.locked')}
            </button>
            {result && (
              <div className="wheel-result" role="status">
                <strong>{segName(result.id, result.label, t)}</strong>
                <span>{describeReward(result, t)}</span>
              </div>
            )}
          </div>

          <div className="wheel-odds">
            <div className="wheel-odds-title">{t('wheel.oddsTitle')}</div>
            <ul>
              {[...arcs].sort((a, b) => b.seg.chance - a.seg.chance).map(({ seg }) => (
                <li key={seg.id} className={result?.id === seg.id ? 'hit' : undefined}>
                  <span className="wheel-swatch" style={{ background: `linear-gradient(135deg, ${tone(seg.id)[0]}, ${tone(seg.id)[1]})` }} />
                  <span className="wheel-odds-name">{segName(seg.id, seg.label, t)}</span>
                  <span className="wheel-odds-reward">{previewReward(seg, t)}</span>
                  <span className="wheel-odds-chance">{formatChance(seg.chance)}</span>
                </li>
              ))}
            </ul>
            <p className="wheel-odds-note">{t('wheel.oddsNote')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Малки векторни знаци вместо емоджи — четат се еднакво на всяка платформа. */
function Glyph({ kind }: { kind: string }): React.ReactElement {
  const s = { fill: 'none', stroke: '#fff7df', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'insight':
    case 'vision':
      return <path {...s} d="M0 -6 L1.8 -1.8 L6 0 L1.8 1.8 L0 6 L-1.8 1.8 L-6 0 L-1.8 -1.8 Z" />;
    case 'potion':
      return <path {...s} d="M-2 -6 H2 M-1.5 -6 V-2.5 L-5 3.5 Q-5.5 6 -3 6 H3 Q5.5 6 5 3.5 L1.5 -2.5 V-6" />;
    case 'vigor':
      return <path {...s} d="M1.5 -6.5 L-3.5 0.5 H0.5 L-1.5 6.5 L3.5 -0.5 H-0.5 Z" />;
    case 'ring':
      return <g {...s}><circle cy="1.5" r="4.2" /><path d="M-2 -3.6 L0 -6.5 L2 -3.6" /></g>;
    case 'jackpot':
      return <path {...s} stroke="#3a2708" d="M-6 4 L-6 -3 L-3 0 L0 -5 L3 0 L6 -3 L6 4 Z" />;
    default:
      return <g {...s}><circle r="5.2" /><circle r="2.6" /></g>;
  }
}

function segName(id: string | undefined, fallback: string, t: Translate): string {
  return id ? t(`wheel.seg.${id}`, { defaultValue: fallback }) : fallback;
}

function previewReward(seg: Segment, t: Translate): string {
  if (seg.kind === 'gold' || seg.kind === 'jackpot') return t('wheel.goldReward', { n: seg.amount.toLocaleString() });
  if (seg.kind === 'xp') return t('wheel.xpReward', { n: seg.amount.toLocaleString() });
  if (seg.kind === 'energy') return t('wheel.energyReward', { n: seg.amount });
  if (seg.kind === 'potion') return t('wheel.potionReward');
  return t('wheel.ringReward');
}

function formatChance(p: number): string {
  const pct = p * 100;
  return `${pct >= 10 ? Math.round(pct) : pct.toFixed(1).replace(/\.0$/, '')}%`;
}

function describeReward(r: SpinResult, t: Translate): string {
  const parts: string[] = [];
  if (r.goldDelta > 0) parts.push(t('wheel.goldReward', { n: r.goldDelta.toLocaleString() }));
  if (r.xpDelta > 0) parts.push(t('wheel.xpReward', { n: r.xpDelta.toLocaleString() }));
  if (r.energyDelta > 0) parts.push(t('wheel.energyReward', { n: r.energyDelta }));
  if (r.itemSlug) parts.push(r.kind === 'potion' ? t('wheel.potionReward') : t('wheel.ringReward'));
  // Енергия при пълна лента: сървърът дава 0 — казваме го, вместо празен тост.
  if (!parts.length && r.kind === 'energy') parts.push(t('wheel.energyFull'));
  return parts.join('  ·  ');
}
