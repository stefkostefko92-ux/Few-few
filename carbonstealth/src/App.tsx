// Корен на приложението: Lenis скрол, custom cursor, роутинг + резолвер.
// Цялата информационна архитектура е data-driven — резолверът картографира
// pathname към страница по данните (content.pages / blog / geo), без route таблица.
import { useEffect, useMemo } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { useLenis } from '@/hooks/useLenis';
import { useAsync } from '@/hooks/useAsync';
import { loadContent, loadSite } from '@/lib/data';
import { langFromPath, langPrefix, normalizePath } from '@/lib/i18n';
import { ContentProvider } from '@/lib/content-context';
import { scrollTop } from '@/lib/scroll';
import Cursor from '@/components/Cursor';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import Ticker from '@/components/Ticker';
import CookieBanner from '@/components/CookieBanner';
import BootScreen from '@/components/BootScreen';
import Home from '@/pages/Home';
import ContentPage from '@/pages/ContentPage';
import { BlogIndex, BlogPost } from '@/pages/Blog';
import { GeoIndex, GeoCity } from '@/pages/Geo';

/** Избира кой изглед да рендерира според текущия път + езика. */
function resolvePage(pathname: string): React.JSX.Element {
  const norm = normalizePath(pathname);
  const lang = langFromPath(norm);
  const prefix = langPrefix(lang);
  let rest = prefix ? norm.slice(prefix.length) : norm;
  rest = normalizePath(rest || '/');
  const segs = rest.split('/').filter(Boolean);

  if (segs.length === 0) return <Home />;
  if (segs[0] === 'blog') {
    return segs.length === 1 ? (
      <BlogIndex pathname={norm} />
    ) : (
      <BlogPost slug={segs[1]} pathname={norm} />
    );
  }
  if (segs[0] === 'geo') {
    return segs.length === 1 ? (
      <GeoIndex pathname={norm} />
    ) : (
      <GeoCity slug={segs[1]} pathname={norm} />
    );
  }
  return <ContentPage pathname={norm} />;
}

function Layout(): React.JSX.Element {
  const location = useLocation();
  const lang = langFromPath(location.pathname);
  const state = useAsync(
    () =>
      Promise.all([loadContent(lang), loadSite()]).then(([content, site]) => ({
        content,
        site,
      })),
    [lang],
  );

  // Скрол към върха при смяна на маршрут (освен при навигация с #hash)
  useEffect(() => {
    if (!location.hash) scrollTop();
  }, [location.pathname, location.hash]);

  const ctx = useMemo(
    () =>
      state.data
        ? { lang, content: state.data.content, site: state.data.site }
        : null,
    [lang, state.data],
  );

  // Провал при зареждане на данните → ясно съобщение вместо вечен boot екран
  if (state.error) {
    return (
      <main
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          color: 'var(--red)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ fontSize: 14, letterSpacing: '.1em' }}>CONNECTION ERROR</div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '12px 24px',
            border: '1px solid var(--cyan)',
            color: 'var(--cyan)',
            cursor: 'pointer',
            letterSpacing: '.15em',
            fontSize: 12,
          }}
        >
          RETRY ↻
        </button>
      </main>
    );
  }

  if (!ctx) return <BootScreen />;

  return (
    <ContentProvider value={ctx}>
      <a href="#main" className="cs-skip-link">
        {ctx.content.ui.skip_link ?? 'Skip to content'}
      </a>
      <Nav />
      <main id="main">{resolvePage(location.pathname)}</main>
      <Ticker />
      <Footer />
      <CookieBanner />
    </ContentProvider>
  );
}

export default function App(): React.JSX.Element {
  useLenis();
  return (
    <BrowserRouter>
      <Cursor />
      <Layout />
    </BrowserRouter>
  );
}
