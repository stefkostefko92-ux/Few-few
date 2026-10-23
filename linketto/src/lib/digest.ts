// Седмичен отчет „езикова дупка“ по имейл — чисти функции (тестват се).
// Съдържание: посещенията за 7 дни + до 3 езика, които посетителите говорят,
// а профилът още НЕ — с бутон към превода с 1 клик. Праща се само при
// реални посещения; отказ с 1 клик (RFC 8058) и от таблото.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { LanguageDemand } from '@/lib/language-gap';

export const DIGEST_MIN_GAP_DAYS = 6;

/** Подпис за линка за отписване (без вход, без запис на токен в базата). */
export function digestToken(userId: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`digest-unsubscribe:${userId}`)
    .digest('hex')
    .slice(0, 32);
}

export function verifyDigestToken(
  userId: string,
  token: string,
  secret: string,
): boolean {
  if (!userId || !/^[0-9a-f]{32}$/.test(token)) return false;
  const expected = Buffer.from(digestToken(userId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Пращаме ли на този човек сега? (има посещения и мина ~седмица) */
export function shouldSendDigest(input: {
  views: number;
  lastDigestAt: Date | null;
  now: Date;
}): boolean {
  if (input.views <= 0) return false;
  if (!input.lastDigestAt) return true;
  const gapMs = DIGEST_MIN_GAP_DAYS * 24 * 60 * 60 * 1000;
  return input.now.getTime() - input.lastDigestAt.getTime() >= gapMs;
}

interface DigestStrings {
  subject: (views: string) => string;
  hello: (name: string) => string;
  views: (views: string) => string;
  gapIntro: string;
  gapLine: (lang: string, visitors: string) => string;
  noGap: string;
  cta: string;
  ctaNoGap: string;
  footer: string;
  unsubscribe: string;
}

// bg е източникът; останалите езици на таблото падат към en.
const DIGEST_STRINGS: Record<string, DigestStrings> = {
  bg: {
    subject: (v) => `Седмицата ти в Linketto: ${v} посещения`,
    hello: (n) => (n ? `Здравей, ${n}!` : 'Здравей!'),
    views: (v) => `Страницата ти имаше <strong>${v}</strong> посещения през последните 7 дни.`,
    gapIntro: 'Посетителите ти говорят езици, на които профилът ти още не е преведен:',
    gapLine: (l, v) => `<strong>${l}</strong> — ${v} посетители`,
    noGap: 'Профилът ти вече говори езиците на посетителите си. Браво!',
    cta: 'Преведи с 1 клик',
    ctaNoGap: 'Виж аналитиката',
    footer: 'Получаваш този седмичен отчет, защото имаш профил в Linketto.',
    unsubscribe: 'Не искам повече тези отчети',
  },
  en: {
    subject: (v) => `Your week on Linketto: ${v} visits`,
    hello: (n) => (n ? `Hi ${n}!` : 'Hi!'),
    views: (v) => `Your page had <strong>${v}</strong> visits in the last 7 days.`,
    gapIntro: 'Your visitors speak languages your profile is not translated into yet:',
    gapLine: (l, v) => `<strong>${l}</strong> — ${v} visitors`,
    noGap: 'Your profile already speaks your visitors’ languages. Well done!',
    cta: 'Translate in 1 click',
    ctaNoGap: 'See your analytics',
    footer: 'You get this weekly report because you have a Linketto profile.',
    unsubscribe: 'Stop these reports',
  },
  it: {
    subject: (v) => `La tua settimana su Linketto: ${v} visite`,
    hello: (n) => (n ? `Ciao ${n}!` : 'Ciao!'),
    views: (v) => `La tua pagina ha avuto <strong>${v}</strong> visite negli ultimi 7 giorni.`,
    gapIntro: 'I tuoi visitatori parlano lingue in cui il tuo profilo non è ancora tradotto:',
    gapLine: (l, v) => `<strong>${l}</strong> — ${v} visitatori`,
    noGap: 'Il tuo profilo parla già le lingue dei tuoi visitatori. Ottimo lavoro!',
    cta: 'Traduci con 1 clic',
    ctaNoGap: 'Vedi le statistiche',
    footer: 'Ricevi questo report settimanale perché hai un profilo Linketto.',
    unsubscribe: 'Non voglio più questi report',
  },
  es: {
    subject: (v) => `Tu semana en Linketto: ${v} visitas`,
    hello: (n) => (n ? `¡Hola, ${n}!` : '¡Hola!'),
    views: (v) => `Tu página tuvo <strong>${v}</strong> visitas en los últimos 7 días.`,
    gapIntro: 'Tus visitantes hablan idiomas a los que tu perfil aún no está traducido:',
    gapLine: (l, v) => `<strong>${l}</strong> — ${v} visitantes`,
    noGap: 'Tu perfil ya habla los idiomas de tus visitantes. ¡Bien hecho!',
    cta: 'Traducir con 1 clic',
    ctaNoGap: 'Ver estadísticas',
    footer: 'Recibes este informe semanal porque tienes un perfil en Linketto.',
    unsubscribe: 'No quiero más estos informes',
  },
  de: {
    subject: (v) => `Deine Woche auf Linketto: ${v} Besuche`,
    hello: (n) => (n ? `Hallo ${n}!` : 'Hallo!'),
    views: (v) => `Deine Seite hatte <strong>${v}</strong> Besuche in den letzten 7 Tagen.`,
    gapIntro: 'Deine Besucher sprechen Sprachen, in die dein Profil noch nicht übersetzt ist:',
    gapLine: (l, v) => `<strong>${l}</strong> — ${v} Besucher`,
    noGap: 'Dein Profil spricht bereits die Sprachen deiner Besucher. Super!',
    cta: 'Mit 1 Klick übersetzen',
    ctaNoGap: 'Statistik ansehen',
    footer: 'Du erhältst diesen Wochenbericht, weil du ein Linketto-Profil hast.',
    unsubscribe: 'Keine Berichte mehr',
  },
  fr: {
    subject: (v) => `Ta semaine sur Linketto : ${v} visites`,
    hello: (n) => (n ? `Bonjour ${n} !` : 'Bonjour !'),
    views: (v) => `Ta page a reçu <strong>${v}</strong> visites ces 7 derniers jours.`,
    gapIntro: 'Tes visiteurs parlent des langues dans lesquelles ton profil n’est pas encore traduit :',
    gapLine: (l, v) => `<strong>${l}</strong> — ${v} visiteurs`,
    noGap: 'Ton profil parle déjà les langues de tes visiteurs. Bravo !',
    cta: 'Traduire en 1 clic',
    ctaNoGap: 'Voir les statistiques',
    footer: 'Tu reçois ce rapport hebdomadaire parce que tu as un profil Linketto.',
    unsubscribe: 'Ne plus recevoir ces rapports',
  },
};

const esc = (value: string) =>
  value.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );

export function digestEmail(input: {
  locale: string;
  name: string | null;
  views: number;
  missing: readonly LanguageDemand[];
  dashboardUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  const s = DIGEST_STRINGS[input.locale] ?? DIGEST_STRINGS.en;
  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat(input.locale).format(n);
    } catch {
      return String(n);
    }
  };
  const views = fmt(input.views);
  const top = input.missing.slice(0, 3);
  const gapHtml = top.length
    ? `<p>${s.gapIntro}</p><ul>${top
        .map((item) => `<li>${s.gapLine(esc(item.name), fmt(item.visitors))}</li>`)
        .join('')}</ul>`
    : `<p>${s.noGap}</p>`;
  const cta = top.length ? s.cta : s.ctaNoGap;
  const ctaUrl = `${input.dashboardUrl}${top.length ? '#languages' : '#stats'}`;
  const html = `<!doctype html><html lang="${esc(input.locale)}"><body style="margin:0;background:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#3b82c4;font-weight:700">Linketto</p>
<p style="font-size:18px;font-weight:600">${esc(s.hello(input.name ?? ''))}</p>
<p>${s.views(views)}</p>
${gapHtml}
<p style="margin:28px 0"><a href="${esc(ctaUrl)}" style="background:#3b82c4;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;display:inline-block">${esc(cta)}</a></p>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0">
<p style="font-size:12px;color:#64748b">${esc(s.footer)} <a href="${esc(input.unsubscribeUrl)}" style="color:#64748b">${esc(s.unsubscribe)}</a></p>
</div></body></html>`;
  return { subject: s.subject(views), html };
}

/** Страница след отписване / потвърждение (на езика на потребителя). */
export function digestUnsubscribeStrings(locale: string): {
  title: string;
  confirm: string;
  done: string;
} {
  const map: Record<string, { title: string; confirm: string; done: string }> = {
    bg: { title: 'Седмичен отчет', confirm: 'Отпиши ме', done: 'Готово — няма да получаваш повече седмични отчети. Можеш да ги включиш отново от таблото.' },
    en: { title: 'Weekly report', confirm: 'Unsubscribe me', done: 'Done — you will not receive weekly reports anymore. You can turn them back on in your dashboard.' },
    it: { title: 'Report settimanale', confirm: 'Annulla iscrizione', done: 'Fatto — non riceverai più i report settimanali. Puoi riattivarli dalla dashboard.' },
    es: { title: 'Informe semanal', confirm: 'Darme de baja', done: 'Listo — ya no recibirás informes semanales. Puedes reactivarlos desde tu panel.' },
    de: { title: 'Wochenbericht', confirm: 'Abmelden', done: 'Erledigt — du erhältst keine Wochenberichte mehr. Du kannst sie im Dashboard wieder aktivieren.' },
    fr: { title: 'Rapport hebdomadaire', confirm: 'Me désabonner', done: 'C’est fait — tu ne recevras plus de rapports hebdomadaires. Tu peux les réactiver depuis ton tableau de bord.' },
  };
  return map[locale] ?? map.en;
}
