// Magnetic Text Repulsion: буквите се отблъскват физически от курсора.
// Плюс Proximity Variable Weight — теглото на буквата расте при близост (Inter Tight 100–900).
import { Fragment, useEffect, useRef } from 'react';
import { pointer } from '@/lib/pointer';

interface Props {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  radius?: number;
  push?: number;
}

export default function MagneticText({
  text,
  className,
  style,
  radius = 130,
  push = 42,
}: Props): React.JSX.Element {
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const letters = Array.from(el.querySelectorAll<HTMLElement>('[data-l]'));
    let raf = 0;

    const loop = (): void => {
      for (const l of letters) {
        const r = l.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = cx - pointer.x;
        const dy = cy - pointer.y;
        const dist = Math.hypot(dx, dy);
        if (dist < radius) {
          const f = (1 - dist / radius) ** 2;
          const ang = Math.atan2(dy, dx);
          const tx = Math.cos(ang) * push * f;
          const ty = Math.sin(ang) * push * f;
          const w = Math.round(400 + 500 * f); // 400→900
          l.style.transform = `translate(${tx}px, ${ty}px)`;
          l.style.fontWeight = String(w);
        } else {
          l.style.transform = 'translate(0,0)';
          l.style.fontWeight = '900';
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [radius, push, text]);

  // Буквите се групират по думи (nowrap), за да не се чупи редът посред дума —
  // пренасянето става само на интервалите между word-span-овете.
  return (
    <span ref={wrap} className={className} style={style} aria-label={text}>
      {text.split(' ').map((word, wi, words) => (
        <Fragment key={wi}>
          <span aria-hidden style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
            {word.split('').map((ch, i) => (
              <span
                key={i}
                data-l
                style={{
                  display: 'inline-block',
                  transition: 'font-weight .15s ease',
                  willChange: 'transform',
                }}
              >
                {ch}
              </span>
            ))}
          </span>
          {wi < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </span>
  );
}
