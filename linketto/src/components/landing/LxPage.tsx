import { SiteFooter } from '@/components/SiteChrome';
import { LxHeader } from '@/components/landing/LxHeader';
import '@/components/landing/lx.css';
import type { Locale } from '@/i18n/locales';

/**
 * Обвивката на вътрешните публични страници: същият хедър, лого, фон и футър
 * като лендинга, винаги тъмна (вложеният data-theme дава тъмните токени на
 * общите компоненти вътре). Статична — без шейдър и без автоматично движение.
 */
export function LxPage({
  locale,
  currentPath,
  children,
}: {
  locale: Locale;
  currentPath: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="lx lx-page text-fg" data-theme="dark">
        <div aria-hidden className="lx-page-bg">
          <div className="lx-grain" />
        </div>
        <LxHeader locale={locale} />
        {children}
      </div>
      <div className="lx-foot" data-theme="dark">
        <SiteFooter locale={locale} currentPath={currentPath} />
      </div>
    </>
  );
}
