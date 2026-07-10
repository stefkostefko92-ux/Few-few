import { useNavigate } from 'react-router-dom';
import { useContent } from '@/lib/content-context';
import { homePath } from '@/lib/i18n';

export default function NotFound(): React.JSX.Element {
  const { lang } = useContent();
  const navigate = useNavigate();
  return (
    <main
      style={{
        minHeight: '80dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        paddingTop: 80,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 900,
          fontSize: 'clamp(4rem,15vw,10rem)',
          color: 'var(--cyan)',
          letterSpacing: '-.05em',
        }}
      >
        404
      </div>
      <button
        onClick={() => navigate(homePath(lang))}
        data-cursor
        style={{
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
    </main>
  );
}
