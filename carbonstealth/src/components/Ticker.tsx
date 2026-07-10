// Безкраен хоризонтален тикер (tokens.animations.tickerMove).
import { useContent } from '@/lib/content-context';

export default function Ticker(): React.JSX.Element {
  const { content } = useContent();
  const text = content.ui.ticker;
  return (
    <div
      style={{
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        borderTop: '1px solid rgba(0,229,255,.12)',
        borderBottom: '1px solid rgba(0,229,255,.12)',
        padding: '14px 0',
        background: '#000',
      }}
    >
      <div style={{ display: 'inline-block', animation: 'cs-ticker 30s linear infinite' }}>
        {[0, 1].map((i) => (
          <span
            key={i}
            style={{
              display: 'inline-block',
              fontSize: 11,
              letterSpacing: '.2em',
              color: 'var(--cyan)',
              paddingRight: 40,
            }}
          >
            {text}&nbsp;&nbsp;{text}
          </span>
        ))}
      </div>
    </div>
  );
}
