// GEO — индекс на градовете + единичен град. Данни от geo.json (20 града × 3 езика).
import { useNavigate } from 'react-router-dom';
import { useContent } from '@/lib/content-context';
import { useAsync } from '@/hooks/useAsync';
import { loadGeo } from '@/lib/data';
import { useSeo } from '@/lib/seo';
import { pathOf } from '@/lib/i18n';
import Blocks from '@/components/Blocks';
import PageShell from './PageShell';
import NotFound from './NotFound';
import BootScreen from '@/components/BootScreen';

export function GeoIndex({ pathname }: { pathname: string }): React.JSX.Element {
  const { lang, content } = useContent();
  const navigate = useNavigate();
  const { data } = useAsync(loadGeo, []);
  // Локализирани заглавие/описание от content.pages вместо хардкоднат текст
  const pageMeta = content.pages['geo'];
  useSeo(pathname, {
    title: pageMeta?.title,
    description: pageMeta?.metaDescription,
  });

  if (!data) return <BootScreen />;

  return (
    <PageShell>
      <h1 style={{ fontSize: 'clamp(2rem,5vw,3.2rem)', marginBottom: 40 }}>
        {pageMeta?.h1 ?? 'Geo'}
      </h1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 1,
          background: 'rgba(245,245,240,.06)',
          border: '1px solid rgba(245,245,240,.06)',
        }}
      >
        {Object.keys(data.cities).map((city) => {
          const c = data.cities[city][lang];
          if (!c) return null;
          return (
            <button
              key={city}
              onClick={() => navigate(pathOf(c.url))}
              data-cursor
              className="cs-card"
              style={{ textAlign: 'left', cursor: 'pointer' }}
            >
              <div style={{ fontSize: 9, color: 'var(--cyan)', letterSpacing: '.2em' }}>
                {c.coordinates.latitude.toFixed(2)}°N
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  color: 'var(--off-white)',
                  textTransform: 'uppercase',
                  marginTop: 6,
                }}
              >
                {city}
              </div>
            </button>
          );
        })}
      </div>
    </PageShell>
  );
}

export function GeoCity({
  slug,
  pathname,
}: {
  slug: string;
  pathname: string;
}): React.JSX.Element {
  const { lang } = useContent();
  const { data } = useAsync(loadGeo, []);

  const city = data?.cities[slug]?.[lang];
  useSeo(pathname, {
    title: city?.title,
    description: city?.metaDescription,
    jsonLd: city?.jsonLd,
  });

  if (!data) return <BootScreen />;
  if (!city) return <NotFound />;

  return (
    <PageShell>
      <article>
        <div className="cs-tag">{city.heroTag}</div>
        <h1 style={{ fontSize: 'clamp(2rem,5vw,3rem)', margin: '8px 0 20px', color: 'var(--off-white)' }}>
          {city.h1}
        </h1>
        <p style={{ color: 'var(--text)', lineHeight: 2, marginBottom: 32, maxWidth: 700 }}>
          {city.heroIntro}
        </p>
        <Blocks blocks={city.sections} />
      </article>
    </PageShell>
  );
}
