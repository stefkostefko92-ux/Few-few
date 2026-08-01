import { ADDRESS_ONE_LINE, CONTACT_LANGUAGES, PUBLISHER } from '@/lib/site';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Импресум и контакти',
  description:
    'Задължителна идентификация на доставчика по чл. 4 от Закона за електронната търговия: Carbon Stealth VCC — юридически данни, адрес, ЕИК, ДДС и контакти.',
  path: '/impresum',
});

// Импресум — чл. 4 ЗЕТ / чл. 5 от Директива 2000/31/ЕО. Външна препратка към
// сайта на издателя НЕ изпълнява „лесно, пряко и постоянно достъпна“, затова
// данните живеят тук, а не само на carbonstealth.eu.
export default function ImpresumPage() {
  const row = 'flex flex-col gap-0.5 sm:flex-row sm:gap-4';
  const key = 'min-w-[12rem] font-medium text-slate-100';

  return (
    <article className="max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Импресум и контакти</h1>
      <p className="mt-2 text-sm text-slate-400">
        Задължителна информация по чл. 4 от Закона за електронната търговия (Директива 2000/31/ЕО).
      </p>

      <section className="mt-8 space-y-2 text-slate-300">
        <h2 className="text-xl font-semibold text-slate-100">Издател на FiveM Bulgaria</h2>
        <div className={row}>
          <span className={key}>Юридическо лице</span>
          <span>{PUBLISHER.legalName}</span>
        </div>
        <div className={row}>
          <span className={key}>Седалище и адрес</span>
          <span>{ADDRESS_ONE_LINE}</span>
        </div>
        <div className={row}>
          <span className={key}>ЕИК</span>
          <span>{PUBLISHER.eik} · Търговски регистър при Агенцията по вписванията</span>
        </div>
        <div className={row}>
          <span className={key}>ДДС №</span>
          <span>{PUBLISHER.vat}</span>
        </div>
        <div className={row}>
          <span className={key}>Имейл</span>
          <span>
            <a className="text-fivem-400 underline underline-offset-2" href={`mailto:${PUBLISHER.email}`}>
              {PUBLISHER.email}
            </a>
          </span>
        </div>
        <div className={row}>
          <span className={key}>Телефон</span>
          <span>
            <a
              className="text-fivem-400 underline underline-offset-2"
              href={`tel:${PUBLISHER.phone.replace(/\s/g, '')}`}
            >
              {PUBLISHER.phone}
            </a>
          </span>
        </div>
      </section>

      <section className="mt-10 space-y-3 text-slate-300">
        <h2 className="text-xl font-semibold text-slate-100">
          Точка за контакт по Регламент (ЕС) 2022/2065
        </h2>
        <p>
          За органи по чл. 11 (Комисия за регулиране на съобщенията като координатор на цифровите
          услуги, Европейската комисия, Европейският съвет за цифрови услуги) и за получатели на
          услугата по чл. 12:{' '}
          <a className="text-fivem-400 underline underline-offset-2" href={`mailto:${PUBLISHER.email}`}>
            {PUBLISHER.email}
          </a>
          . Езици за комуникация: {CONTACT_LANGUAGES}. Комуникацията не се обслужва изцяло от
          автоматизирани средства.
        </p>
        <p>
          Сигнал за незаконно съдържание се подава през{' '}
          <a className="text-fivem-400 underline underline-offset-2" href="/report">
            формата за сигнали
          </a>
          .
        </p>
      </section>

      <section className="mt-10 space-y-3 text-slate-300">
        <h2 className="text-xl font-semibold text-slate-100">Контролни органи</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Комисия за защита на потребителите (КЗП) — kzp.bg</li>
          <li>Комисия за защита на личните данни (КЗЛД) — cpdp.bg</li>
          <li>Комисия за регулиране на съобщенията (КРС) — crc.bg</li>
        </ul>
        <p className="text-sm text-slate-400">
          Платформа на ЕК за онлайн решаване на спорове:{' '}
          <a
            className="text-fivem-400 underline underline-offset-2"
            href="https://ec.europa.eu/consumers/odr"
            rel="noopener"
          >
            ec.europa.eu/consumers/odr
          </a>
        </p>
      </section>

      <section className="mt-10 space-y-3 text-slate-300">
        <h2 className="text-xl font-semibold text-slate-100">Марки</h2>
        <p>
          FiveM Bulgaria е независим проект и не е свързан с Rockstar Games, Take-Two Interactive
          Software, Inc. или Cfx.re. GTA V, Grand Theft Auto и Rockstar Games са марки на Take-Two
          Interactive Software, Inc.; FiveM и Cfx.re са марки на съответните им притежатели.
          Употребата им тук е само за обозначаване на платформата, за която се отнася съдържанието.
        </p>
      </section>
    </article>
  );
}
