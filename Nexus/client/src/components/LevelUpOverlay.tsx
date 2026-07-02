import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  level: number;
  statPoints: number;
  skillPoints: number;
  onDone: () => void;
}

/**
 * Full-screen grand reveal — gold burst, confetti, big level number.
 * Auto-dismisses after 3.6s, can be skipped by clicking.
 */
export default function LevelUpOverlay({ level, statPoints, skillPoints, onDone }: Props): React.ReactElement {
  const { t } = useTranslation();
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setClosing(true), 3200);
    const u = setTimeout(onDone, 3600);
    return () => { clearTimeout(t); clearTimeout(u); };
  }, [onDone]);

  // Deterministically place 60 confetti bits with random directions/colors.
  const confetti = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => {
        const angle = (i / 60) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 200 + Math.random() * 360;
        const tx = Math.cos(angle) * dist;
        const ty = Math.sin(angle) * dist - Math.random() * 200;
        const rot = (Math.random() - 0.5) * 720;
        const colors = ['#f5d28a', '#d6a13d', '#ffe88a', '#6ad8a4', '#e85a4f', '#c294ff'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const delay = Math.random() * 0.25;
        return { tx, ty, rot, color, delay };
      }),
    [],
  );

  return (
    <div
      className="levelup-overlay"
      style={{ opacity: closing ? 0 : 1, transition: closing ? 'opacity .4s' : undefined }}
      onClick={onDone}
    >
      <div className="levelup-burst" />
      <div className="levelup-confetti">
        {confetti.map((c, i) => (
          <div
            key={i}
            className="confetti-bit"
            style={{
              ['--tx' as any]: `${c.tx}px`,
              ['--ty' as any]: `${c.ty}px`,
              ['--rot' as any]: `${c.rot}deg`,
              ['--bit-color' as any]: c.color,
              animationDelay: `${c.delay}s`,
            }}
          />
        ))}
      </div>
      <div className="levelup-card">
        <div className="label">{t('levelUp.title')}</div>
        <div className="number">{level}</div>
        <div className="sub">
          {t('levelUp.points', { statPoints, skillPoints })}
        </div>
      </div>
    </div>
  );
}
