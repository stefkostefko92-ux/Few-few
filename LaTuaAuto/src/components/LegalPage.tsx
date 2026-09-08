import { getTranslations } from 'next-intl/server';
import { CONTACT_EMAIL } from '@/lib/seo';

// Правните страници са ЧЕРНОВИ (правило на продукта) — минават през Правния
// Разбирач преди пускане; бележката „Bozza“ стои, докато не е одобрено.
export async function LegalPage({ ns, updated }: { ns: 'privacy' | 'terms' | 'cookies'; updated: string }) {
  const t = await getTranslations(`legal.${ns}`);
  const tc = await getTranslations('common');
  const sections = t.raw('sections') as Array<{ h: string; p: string }>;
  return (
    <article className="container-page max-w-3xl py-12">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-sm text-slate-500">
        {tc('lastUpdated')}: <time dateTime={updated}>{updated}</time> · {tc('draftNotice')}
      </p>
      <div className="mt-8 space-y-6">
        {sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-xl font-semibold">{s.h}</h2>
            <p className="mt-2 text-slate-700">{s.p.replace('{email}', CONTACT_EMAIL)}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
