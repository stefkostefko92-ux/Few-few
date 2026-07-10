// WF-004 „SVG LIQUID DISTORTION" — анимиран feTurbulence + feDisplacementMap филтър
// върху заглавие. baseFrequency осцилира бавно през rAF → „течен" ефект. Пауза когато
// заглавието е извън екрана (useInView). Осцилацията е плавна и бавна — без строб.
import { useEffect, useRef } from 'react';
import { useInView } from '@/hooks/useInView';

interface Props {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  /** уникален id на филтъра (при няколко инстанции) */
  id?: string;
  /** сила на изместването (px) — умерена, за да остане четимо */
  scale?: number;
}

export default function LiquidHeading({
  text,
  className,
  style,
  id = 'cs-liquid',
  scale = 9,
}: Props): React.JSX.Element {
  const [wrapRef, inView] = useInView<HTMLDivElement>('80px');
  const turbRef = useRef<SVGFETurbulenceElement>(null);

  useEffect(() => {
    if (!inView) return;
    const turb = turbRef.current;
    if (!turb) return;
    let raf = 0;
    let t = 0;
    const loop = (): void => {
      t += 0.006;
      // бавна осцилация на честотата → мека вълна (без резки скокове/строб)
      const fx = 0.008 + 0.004 * Math.sin(t);
      const fy = 0.014 + 0.005 * Math.cos(t * 0.8);
      turb.setAttribute('baseFrequency', `${fx.toFixed(4)} ${fy.toFixed(4)}`);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [inView]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Скрит SVG носи само дефиницията на филтъра */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <filter id={id} x="-20%" y="-40%" width="140%" height="180%">
            <feTurbulence
              ref={turbRef}
              type="fractalNoise"
              baseFrequency="0.008 0.014"
              numOctaves={2}
              seed={42}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={scale}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <h2
        className={className}
        style={{ filter: `url(#${id})`, ...style }}
        aria-label={text}
      >
        {text}
      </h2>
    </div>
  );
}
