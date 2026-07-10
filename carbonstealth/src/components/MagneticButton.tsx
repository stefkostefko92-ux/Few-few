// Магнитен елемент: съдържанието се притегля към курсора при hover (GSAP quickTo).
import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';

interface Props {
  children: ReactNode;
  strength?: number;
  as?: 'button' | 'a' | 'div';
  href?: string;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  target?: string;
  rel?: string;
}

export default function MagneticButton({
  children,
  strength = 0.4,
  as = 'button',
  href,
  onClick,
  className,
  style,
  target,
  rel,
}: Props): React.JSX.Element {
  const ref = useRef<HTMLElement>(null);
  const moveTo = useRef<((v: number) => void) | null>(null);
  const moveToY = useRef<((v: number) => void) | null>(null);

  const ensure = (): void => {
    if (!ref.current) return;
    if (!moveTo.current) {
      moveTo.current = gsap.quickTo(ref.current, 'x', { duration: 0.5, ease: 'power3' });
      moveToY.current = gsap.quickTo(ref.current, 'y', { duration: 0.5, ease: 'power3' });
    }
  };

  const onMove = (e: React.PointerEvent): void => {
    ensure();
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) * strength;
    const dy = (e.clientY - (r.top + r.height / 2)) * strength;
    moveTo.current?.(dx);
    moveToY.current?.(dy);
  };

  const onLeave = (): void => {
    moveTo.current?.(0);
    moveToY.current?.(0);
  };

  const commonProps = {
    ref: ref as never,
    className,
    style: { display: 'inline-block', ...style },
    onPointerMove: onMove,
    onPointerLeave: onLeave,
    onClick,
    'data-cursor': '',
  };

  if (as === 'a') {
    return (
      <a href={href} target={target} rel={rel} {...commonProps}>
        {children}
      </a>
    );
  }
  if (as === 'div') {
    return <div {...commonProps}>{children}</div>;
  }
  return (
    <button type="button" {...commonProps}>
      {children}
    </button>
  );
}
