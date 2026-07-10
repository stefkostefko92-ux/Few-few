// Ghost/Echo заглавие: 5 наслагващи се cyan копия с offset и намаляваща
// прозрачност — „следа" зад главния текст. Основният текст остава плътен и четим.
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

const ECHOES = [1, 2, 3, 4, 5];

export default function GhostHeading({
  children,
  text,
  className,
  style,
}: Props): React.JSX.Element {
  return (
    <h2
      className={className}
      style={{ position: 'relative', ...style }}
      aria-label={text}
    >
      {ECHOES.map((n) => (
        <span
          key={n}
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            color: 'rgba(0,229,255,1)',
            opacity: 0.12 / n,
            transform: `translate(${n * -3}px, ${n * 2}px)`,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {text}
        </span>
      ))}
      <span style={{ position: 'relative' }}>{children}</span>
    </h2>
  );
}
