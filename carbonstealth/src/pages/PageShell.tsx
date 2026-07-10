// Обвивка за вътрешните (не-начални) страници: отстъп под нав + „назад" линк.
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContent } from '@/lib/content-context';
import { homePath } from '@/lib/i18n';

export default function PageShell({ children }: { children: ReactNode }): React.JSX.Element {
  const { lang } = useContent();
  const navigate = useNavigate();
  // <main> ориентирът е един — в App; тук е обикновен контейнер.
  return (
    <div style={{ minHeight: '80dvh', paddingTop: 100 }}>
      <div className="cs-container" style={{ maxWidth: 900 }}>
        <button
          onClick={() => navigate(homePath(lang))}
          data-cursor
          style={{
            fontSize: 10,
            letterSpacing: '.2em',
            color: 'var(--cyan)',
            cursor: 'pointer',
            marginBottom: 32,
            textTransform: 'uppercase',
          }}
        >
          ← Carbon Stealth
        </button>
        {children}
      </div>
    </div>
  );
}
