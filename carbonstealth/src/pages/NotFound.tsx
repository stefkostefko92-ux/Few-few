import { useNavigate } from 'react-router-dom';
import { useContent } from '@/lib/content-context';
import { homePath } from '@/lib/i18n';
import MatrixRain from '@/components/effects/MatrixRain';

export default function NotFound(): React.JSX.Element {
  const { lang, content } = useContent();
  const navigate = useNavigate();
  return (
    <div
      style={{
        position: 'relative',
        minHeight: '80dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        paddingTop: 80,
        overflow: 'hidden',
      }}
    >
      {/* Matrix Rain — дискретен ASCII фон (каталог на стария сайт) */}
      <MatrixRain />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          fontFamily: 'var(--font-display)',
          fontWeight: 900,
          fontSize: 'clamp(4rem,15vw,10rem)',
          color: 'var(--cyan)',
          letterSpacing: '-.05em',
        }}
      >
        404
      </div>
      <p
        style={{
          position: 'relative',
          zIndex: 1,
          fontSize: 12,
          letterSpacing: '.15em',
          color: 'var(--text)',
          textTransform: 'uppercase',
        }}
      >
        {content.ui.nf_text ?? 'Not found'}
      </p>
      <button
        onClick={() => navigate(homePath(lang))}
        data-cursor
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '14px 28px',
          border: '1px solid var(--cyan)',
          color: 'var(--cyan)',
          fontSize: 12,
          letterSpacing: '.15em',
          cursor: 'pointer',
          textTransform: 'uppercase',
        }}
      >
        ← Carbon Stealth
      </button>
    </div>
  );
}
