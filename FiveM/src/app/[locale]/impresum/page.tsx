import Link from 'next/link';

import { getLegal } from '@/content/legal';
import { getDictionary } from '@/i18n';
import { CONTACT_LANGUAGES_LABEL } from '@/lib/site';
import { isLocale } from '@/i18n/config';
import { pageMetadata } from '@/lib/seo';
import { ADDRESS_ONE_LINE, DISCORD_INVITE, PUBLISHER } from '@/lib/site';

export const revalidate = 86_400;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const l = getLegal(locale).impresumLabels;
  return pageMetadata({ locale, title: l.title, description: l.lead, path: '/impresum' });
}

// Импресум — чл. 4 ЗЕТ / чл. 5 от Директива 2000/31/ЕО. Външна препратка към
// сайта на издателя НЕ изпълнява „лесно, пряко и постоянно достъпна“, затова
// данните живеят тук, а не само на carbonstealth.eu.
export default async function ImpresumPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const t = getDictionary(locale);
  const l = getLegal(locale).impresumLabels;

  const row = 'flex flex-col gap-0.5 sm:flex-row sm:gap-4';
  const key = 'min-w-[13rem] font-medium text-silver-100';
  const link = 'text-cyan-300 underline underline-offset-2';

  return (
    <article className="max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">
        <span className="text-chrome">{l.title}</span>
      </h1>
      <p className="mt-2 text-sm text-silver-500">{l.lead}</p>

      <section className="mt-8 space-y-2 text-silver-300">
        <h2 className="text-xl font-semibold text-silver-100">{l.publisher}</h2>
        <div className={row}>
          <span className={key}>{l.legalName}</span>
          <span>{PUBLISHER.legalName}</span>
        </div>
        <div className={row}>
          <span className={key}>{l.address}</span>
          <span>{ADDRESS_ONE_LINE}</span>
        </div>
        <div className={row}>
          <span className={key}>{l.eik}</span>
          <span>
            {PUBLISHER.eik} · {l.eikNote}
          </span>
        </div>
        <div className={row}>
          <span className={key}>{l.vat}</span>
          <span>{PUBLISHER.vat}</span>
        </div>
        <div className={row}>
          <span className={key}>{l.email}</span>
          <span>
            <a className={link} href={`mailto:${PUBLISHER.email}`}>
              {PUBLISHER.email}
            </a>
          </span>
        </div>
        <div className={row}>
          <span className={key}>Discord</span>
          <span>
            <a className={link} href={DISCORD_INVITE} rel="noopener nofollow">
              {DISCORD_INVITE.replace('https://', '')}
            </a>
          </span>
        </div>
        <div className={row}>
          <span className={key}>{l.phone}</span>
          <span>
            <a className={link} href={`tel:${PUBLISHER.phone.replace(/\s/g, '')}`}>
              {PUBLISHER.phone}
            </a>
          </span>
        </div>
      </section>

      <section className="mt-10 space-y-3 text-silver-300">
        <h2 className="text-xl font-semibold text-silver-100">{l.dsaHeading}</h2>
        <p>
          {l.dsaBody} {CONTACT_LANGUAGES_LABEL[locale]}.{' '}
          <a className={link} href={`mailto:${PUBLISHER.email}`}>
            {PUBLISHER.email}
          </a>
        </p>
        <p>
          {l.dsaReport}{' '}
          <Link href={`/${locale}/report`} className={link}>
            {t.footer.report}
          </Link>
        </p>
      </section>

      <section className="mt-10 space-y-3 text-silver-300">
        <h2 className="text-xl font-semibold text-silver-100">{l.authorities}</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Комисия за защита на потребителите (КЗП) — kzp.bg</li>
          <li>Комисия за защита на личните данни (КЗЛД) — cpdp.bg</li>
          <li>Комисия за регулиране на съобщенията (КРС) — crc.bg</li>
        </ul>
        <p className="text-sm text-silver-500">
          {l.odr}{' '}
          <a className={link} href="https://ec.europa.eu/consumers/odr" rel="noopener">
            ec.europa.eu/consumers/odr
          </a>
        </p>
      </section>

      <section className="mt-10 space-y-3 text-silver-300">
        <h2 className="text-xl font-semibold text-silver-100">{l.trademarks}</h2>
        <p>{t.footer.disclaimer}</p>
      </section>
    </article>
  );
}
