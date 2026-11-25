import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';

import { Icon } from '@/components/Icon';
import { ThraexDescent } from '@/components/ThraexDescent';
import { ThraexFilm } from '@/components/ThraexFilm';
import { ThraexRail } from '@/components/ThraexRail';
import { getDictionary, resolveLocale } from '@/i18n';
import { readEnv } from '@/lib/env';
import { pageMetadata } from '@/lib/seo';
import { DISCORD_INVITE, PUBLISHER } from '@/lib/site';

// Адресът за влизане се чете при заявка: сменя се без нов билд.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

/** Цялото видео от loading екрана на сървъра (`thraex_loading/ui/media/arena.webm`), без рязане. */
const VIDEO = '/media/arena.webm';
const POSTER = '/media/arena-poster.webp';
/** Двата слоя са един кадър: трябва да се режат еднакво, иначе сабята се разминава с пясъка. */
const HERO_FIT = 'object-cover object-[50%_72%]';
/** Същите граници като `RANKS` в `thraex_match/ui/app.js`. Имената са като в играта и не се превеждат. */
const RANKS: [string, number][] = [
  ['Komat', 0], ['Peltast', 400], ['Zeirophor', 1000], ['Alopek', 1800], ['Rhomphaist', 2800],
  ['Strateg', 4000], ['Tarabost', 5400], ['Zibyth', 7000], ['Paradynast', 9000], ['Heros', 12000],
];

/** Показва бутон за влизане само при истински адрес: сървърът още е скрит от публичния списък. */
function joinUrl(): string | null {
  const value = readEnv('THRAEX_JOIN_URL');
  return value && /^https:\/\/cfx\.re\/join\/[a-z0-9]+$/i.test(value) ? value : null;
}

export async function generateMetadata({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale).thraex;
  // `absolute`: шаблонът на сайта би залепил името на директорията към марката на сървъра.
  return {
    ...pageMetadata({ locale, title: t.metaTitle, description: t.metaDescription, path: '/thraex' }),
    title: { absolute: t.metaTitle },
  };
}

export default async function ThraexPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale).thraex;
  const join = joinUrl();

  const actions = (
    <>
      {join ? (
        <a href={join} rel="noopener nofollow" className="btn-forged">
          {t.joinCta}
        </a>
      ) : null}
      <a href={DISCORD_INVITE} rel="noopener nofollow" className={join ? 'btn-ghost btn-lg' : 'btn-forged'}>
        <Icon group="brand" name="discord" size={20} />
        {t.discordCta}
      </a>
    </>
  );

  return (
    <>
      {/* ── Герой: името минава между фона и забитата сабя ─────────────────── */}
      <section className="thraex-bleed relative isolate -mt-10 h-[calc(100dvh-4.5rem)] min-h-[38rem] overflow-hidden sm:-mt-14">
        <Image src="/thraex/hero-bg.webp" alt="" fill priority sizes="100vw" className={`-z-30 ${HERO_FIT}`} />
        <div aria-hidden="true" className="absolute inset-0 -z-20 bg-gradient-to-b from-ink-950/70 via-ink-950/5 via-40% to-ink-950" />
        <h1 className="thraex-giant thraex-drift absolute inset-x-0 top-[7%] text-center font-display font-bold">
          <span className="text-chrome">Thraex</span>
          <span className="sr-only"> PVP. {t.heroTitle}</span>
        </h1>
        <Image src="/thraex/hero-blade.webp" alt="" fill priority sizes="100vw" className={`pointer-events-none z-10 ${HERO_FIT}`} />
        {/* Над сабята: острието потъва в тъмното и не пречи на текста. */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 z-[15] h-[46%] bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-20 mx-auto flex max-w-[110rem] flex-col items-start gap-6 px-5 pb-10 sm:px-10 sm:pb-14 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p aria-hidden="true" className="font-display text-[clamp(1.75rem,4.2vw,4rem)] font-bold leading-none text-ivory-100">
              {t.heroTitle}
            </p>
            <p className="lead mt-4 max-w-xl text-ivory-200">{t.heroLead}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {actions}
            <a href="#video" className="btn-ghost btn-lg">
              {t.watchCta}
            </a>
          </div>
        </div>
        <div aria-hidden="true" className="flag-rule-x absolute inset-x-0 bottom-0 z-20 h-1.5" />
      </section>

      {/* ── Спускането в арената: кадри от Blender, следват превъртането ───── */}
      <ThraexDescent lines={t.manifesto} poster="/thraex/descent-poster.webp" />

      {/* ── Цялото видео ───────────────────────────────────────────────────── */}
      <section id="video" className="thraex-bleed scroll-mt-20 bg-black" aria-labelledby="thraex-video">
        <div className="mx-auto flex max-w-[110rem] flex-col gap-4 px-5 pb-8 pt-20 sm:px-10 lg:flex-row lg:items-end lg:justify-between">
          <h2 id="thraex-video" className="arena-title">
            {t.videoTitle}
          </h2>
          <p className="lead lg:max-w-md lg:text-end">{t.videoLead}</p>
        </div>
        <ThraexFilm src={VIDEO} poster={POSTER} fallback={t.videoFallback} label={t.videoTitle} />
      </section>

      {/* ── Режимите: плакати в цял ръст ───────────────────────────────────── */}
      <ThraexRail
        label={t.modesTitle}
        lead={
          <>
            <h2 className="thraex-beat font-display font-bold text-ivory-100">{t.modesTitle}</h2>
            <p className="lead mt-6">{t.modesLead}</p>
          </>
        }
      >
        {t.modes.map((mode, index) => (
          <article
            key={mode.id}
            className={`relative isolate flex aspect-[14/17] h-[68vh] shrink-0 snap-center flex-col justify-end overflow-hidden p-6 sm:p-8 lg:h-[80vh] ${index % 2 ? 'lg:translate-y-[3.5vh]' : 'lg:-translate-y-[3.5vh]'}`}
          >
            <Image src={`/thraex/modes/mode-${mode.id}.webp`} alt="" fill sizes="(min-width: 1024px) 66vh, 56vh" className="-z-20 object-cover" />
            <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-950 via-ink-950/35 via-40% to-transparent" />
            <h3 className="font-display text-[clamp(2.25rem,4.4vw,4.5rem)] font-bold leading-[0.95] text-ivory-100">{mode.label}</h3>
            <p className="mt-3 max-w-md leading-relaxed text-ivory-200">{mode.body}</p>
          </article>
        ))}
      </ThraexRail>

      {/* ── Стълбата: значките се качват по редовете на трибуните ──────────── */}
      <section className="thraex-bleed relative isolate overflow-hidden" aria-labelledby="thraex-ranks">
        <Image src="/thraex/tiers.webp" alt="" fill sizes="100vw" className="-z-20 object-cover object-[70%_40%]" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-ink-950 via-ink-950/55 to-ink-950" />
        <div className="mx-auto max-w-[110rem] px-5 py-24 sm:px-10 lg:py-36">
          <h2 id="thraex-ranks" className="arena-title">
            {t.ranksTitle}
          </h2>
          <p className="lead mt-5">{t.ranksLead}</p>
          <ol className="mt-14 flex flex-col-reverse gap-5 lg:mt-4 lg:flex-row lg:items-end lg:gap-0">
            {RANKS.map(([name, from], index) => (
              <li key={name} className="thraex-rung flex items-center gap-5 lg:flex-1 lg:flex-col lg:gap-2 lg:text-center" style={{ '--rung': index } as CSSProperties}>
                <Image src={`/thraex/ranks/rank-${name.toLowerCase()}.webp`} alt="" width={256} height={256} sizes="150px" className="thraex-rung-badge size-20 shrink-0" />
                <div>
                  <p className="font-display text-lg font-bold leading-tight text-ivory-100">{name}</p>
                  <p className="mt-1 text-sm tabular-nums text-ivory-300">
                    {t.ranksFrom} {from.toLocaleString(locale === 'bg' ? 'bg-BG' : 'en-US')}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Още: чист шрифт върху черно ────────────────────────────────────── */}
      <section className="thraex-bleed bg-black">
        <ul className="mx-auto max-w-[110rem] px-5 py-10 sm:px-10">
          {t.more.map((item) => (
            <li key={item.title} className="thraex-row grid gap-3 border-b border-bronze-400/25 py-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end lg:gap-10">
              <h3 className="thraex-outline font-display font-bold">{item.title}</h3>
              <p className="lead">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Финал: пътят към знамето ───────────────────────────────────────── */}
      <section className="thraex-bleed relative isolate -mb-10 overflow-hidden sm:-mb-14" aria-labelledby="thraex-final">
        <Image src="/thraex/final.webp" alt="" fill sizes="100vw" className="-z-20 object-cover object-[55%_22%]" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-ink-950/30 via-transparent via-35% to-ink-950" />
        <div className="mx-auto flex min-h-[100dvh] max-w-[110rem] flex-col items-center justify-end px-5 pb-10 pt-[46vh] text-center sm:px-10">
          <h2 id="thraex-final" className="thraex-beat font-display font-bold text-ivory-100">
            {t.finalTitle}
          </h2>
          <p className="lead mt-5">{t.finalLead}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">{actions}</div>

          <div className="mt-16 max-w-3xl border-t border-bronze-400/25 pt-6 text-sm leading-relaxed text-ivory-300">
            <p>
              {t.operator}{' '}
              <Link href={`mailto:${PUBLISHER.email}`} className="link">
                {PUBLISHER.email}
              </Link>
            </p>
            {/* Текстът се изисква от лиценза на платформата (§2.3) и остава на английски и в двата езика. */}
            <p className="mt-3 font-semibold text-ivory-200">THRAEX PVP IS NOT APPROVED, SPONSORED, OR ENDORSED BY ROCKSTAR GAMES.</p>
          </div>
        </div>
      </section>
    </>
  );
}
