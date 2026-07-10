// Cookie банер — localStorage ключ „cs_cookie" (accept | reject).
import { useEffect, useState } from 'react';
import { useContent } from '@/lib/content-context';

const KEY = 'cs_cookie';

export default function CookieBanner(): React.JSX.Element | null {
  const { content, lang } = useContent();
  const ui = content.ui;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!localStorage.getItem(KEY));
  }, []);

  const decide = (v: 'accept' | 'reject'): void => {
    localStorage.setItem(KEY, v);
    setVisible(false);
  };

  if (!visible) return null;

  const cookieHref = lang === 'it' ? '/cookie/' : `/${lang}/cookie/`;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1200,
        background: 'rgba(0,0,0,.97)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid rgba(0,229,255,.2)',
        padding: '18px 20px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 16,
        justifyContent: 'center',
      }}
    >
      <p style={{ maxWidth: 640, fontSize: 11, color: 'var(--text)', margin: 0 }}>
        {ui.cookie_text}{' '}
        <a href={cookieHref} style={{ color: 'var(--cyan)' }}>
          {ui.cookie_more}
        </a>
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => decide('reject')}
          style={{
            fontSize: 10,
            letterSpacing: '.15em',
            padding: '10px 18px',
            border: '1px solid rgba(245,245,240,.2)',
            color: 'var(--text)',
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
        >
          {ui.cookie_reject}
        </button>
        <button
          onClick={() => decide('accept')}
          style={{
            fontSize: 10,
            letterSpacing: '.15em',
            padding: '10px 18px',
            border: '1px solid rgba(0,229,255,.4)',
            background: 'rgba(0,229,255,.1)',
            color: 'var(--cyan)',
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
        >
          {ui.cookie_accept}
        </button>
      </div>
    </div>
  );
}
