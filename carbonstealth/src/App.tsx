// Корен на приложението: Lenis скрол, custom cursor, роутинг + резолвер.
// Цялата информационна архитектура е data-driven — резолверът картографира
// pathname към страница по данните (content.pages / blog / geo), без route таблица.
import { useEffect } from 'react';
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

  if (!state.data) return <BootScreen />;

  return (
    <ContentProvider value={{ lang, content: state.data.content, site: state.data.site }}>
      <Nav />
      {resolvePage(location.pathname)}
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
