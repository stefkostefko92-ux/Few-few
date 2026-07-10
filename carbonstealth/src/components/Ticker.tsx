// Безкраен хоризонтален тикер (tokens.animations.tickerMove).
import { useContent } from '@/lib/content-context';

export default function Ticker(): React.JSX.Element {
  const { content } = useContent();
  const text = content.ui.ticker;
  // WCAG 2.2.2 (ниво A): авто-движението има механизъм за пауза — hover/фокус
  // (класът .cs-ticker-track спира анимацията през global.css).
  return (
    <div
      tabIndex={0}
      style={{
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        borderTop: '1px solid rgba(0,229,255,.12)',
        borderBottom: '1px solid rgba(0,229,255,.12)',
        padding: '14px 0',
        background: '#000',
      }}
    >
      <div className="cs-ticker-track" style={{ display: 'inline-block', animation: 'cs-ticker 30s linear infinite' }}>
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
