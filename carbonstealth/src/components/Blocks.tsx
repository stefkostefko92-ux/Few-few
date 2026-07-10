// Генеричен рендер на структурирани блокове (visibleBlocks / blog / geo sections).
// Рендерира само безопасни семантични тагове — без dangerouslySetInnerHTML.
import type { Block } from '@/lib/types';

const HEADING_STYLE: Record<string, React.CSSProperties> = {
  h1: { fontSize: 'clamp(2rem,5vw,3.2rem)', margin: '0 0 24px', color: 'var(--off-white)' },
  h2: {
    fontSize: '1.2rem',
    textTransform: 'uppercase',
    letterSpacing: '.05em',
    color: 'var(--cyan)',
    margin: '40px 0 16px',
  },
  h3: { fontSize: '1rem', color: 'var(--off-white)', margin: '28px 0 12px' },
};

export default function Blocks({ blocks }: { blocks: Block[] }): React.JSX.Element {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.tag === 'ul' && b.items) {
          return (
            <ul key={i} style={{ margin: '12px 0 20px', paddingLeft: 20 }}>
              {b.items.map((it, j) => (
                <li key={j} style={{ margin: '6px 0', color: 'var(--text)' }}>
                  {it}
                </li>
              ))}
            </ul>
          );
        }
        const text = b.text ?? '';
        if (b.tag === 'h1' || b.tag === 'h2' || b.tag === 'h3') {
          const Tag = b.tag;
          return (
            <Tag key={i} style={HEADING_STYLE[b.tag]}>
              {text}
            </Tag>
          );
        }
        if (b.tag === 'li') {
          return (
            <li key={i} style={{ margin: '6px 0 6px 20px', color: 'var(--text)' }}>
              {text}
            </li>
          );
        }
        if (b.class === 'tag') {
          return (
            <div key={i} className="cs-tag" style={{ marginTop: 8 }}>
              {text}
            </div>
          );
        }
        return (
          <p key={i} style={{ margin: '0 0 16px', color: 'var(--text)', lineHeight: 1.9 }}>
            {text}
          </p>
        );
      })}
    </>
  );
}
