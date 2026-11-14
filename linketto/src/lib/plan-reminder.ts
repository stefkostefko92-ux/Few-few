// Напомняне преди изтичане на предплатен план (spec §7.1 P8) — чисто, тества
// се. bg е източникът; родни низове за 6 езика, останалите → en. Няма
// автоматично таксуване — писмото е единственият път към подновяване.

interface Strings {
  subject: (plan: string, days: number) => string;
  hello: (name: string) => string;
  body: (plan: string, date: string) => string;
  noAuto: string;
  cta: string;
}

const PLAN_NAMES: Record<string, string> = { PRO: 'Pro', BUSINESS: 'Business' };

const STRINGS: Record<string, Strings> = {
  bg: {
    subject: (p, d) => `Linketto ${p}: остават ${d === 1 ? '1 ден' : `${d} дни`}`,
    hello: (n) => (n ? `Здравей, ${n}!` : 'Здравей!'),
    body: (p, date) => `Платеният ти период на плана <strong>${p}</strong> изтича на <strong>${date}</strong>. След това профилът минава на безплатния план и платените функции (собствен домейн, без бадж, допълнителните профили) спират.`,
    noAuto: 'Не те таксуваме автоматично — подновяваш само ако искаш.',
    cta: 'Поднови плана',
  },
  en: {
    subject: (p, d) => `Linketto ${p}: ${d === 1 ? '1 day' : `${d} days`} left`,
    hello: (n) => (n ? `Hi ${n}!` : 'Hi!'),
    body: (p, date) => `Your paid period on the <strong>${p}</strong> plan ends on <strong>${date}</strong>. After that your profile moves to the free plan and the paid features (custom domain, no badge, extra profiles) stop.`,
    noAuto: 'We never charge you automatically — you renew only if you want to.',
    cta: 'Renew your plan',
  },
  it: {
    subject: (p, d) => `Linketto ${p}: ${d === 1 ? 'manca 1 giorno' : `mancano ${d} giorni`}`,
    hello: (n) => (n ? `Ciao ${n}!` : 'Ciao!'),
    body: (p, date) => `Il periodo pagato del piano <strong>${p}</strong> scade il <strong>${date}</strong>. Dopo, il profilo passa al piano gratuito e le funzioni a pagamento (dominio personalizzato, senza badge, profili aggiuntivi) si fermano.`,
    noAuto: 'Non ti addebitiamo nulla automaticamente — rinnovi solo se vuoi.',
    cta: 'Rinnova il piano',
  },
  es: {
    subject: (p, d) => `Linketto ${p}: ${d === 1 ? 'queda 1 día' : `quedan ${d} días`}`,
    hello: (n) => (n ? `¡Hola, ${n}!` : '¡Hola!'),
    body: (p, date) => `Tu periodo pagado del plan <strong>${p}</strong> termina el <strong>${date}</strong>. Después, tu perfil pasa al plan gratuito y las funciones de pago (dominio propio, sin insignia, perfiles adicionales) se detienen.`,
    noAuto: 'Nunca te cobramos automáticamente: renuevas solo si quieres.',
    cta: 'Renovar el plan',
  },
  de: {
    subject: (p, d) => `Linketto ${p}: noch ${d === 1 ? '1 Tag' : `${d} Tage`}`,
    hello: (n) => (n ? `Hallo ${n}!` : 'Hallo!'),
    body: (p, date) => `Dein bezahlter Zeitraum im Plan <strong>${p}</strong> endet am <strong>${date}</strong>. Danach wechselt dein Profil in den kostenlosen Plan und die bezahlten Funktionen (eigene Domain, ohne Badge, zusätzliche Profile) enden.`,
    noAuto: 'Wir buchen nie automatisch ab — du verlängerst nur, wenn du willst.',
    cta: 'Plan verlängern',
  },
  fr: {
    subject: (p, d) => `Linketto ${p} : ${d === 1 ? 'plus que 1 jour' : `plus que ${d} jours`}`,
    hello: (n) => (n ? `Bonjour ${n} !` : 'Bonjour !'),
    body: (p, date) => `Votre période payée du plan <strong>${p}</strong> se termine le <strong>${date}</strong>. Ensuite, votre profil passe au plan gratuit et les fonctions payantes (domaine personnalisé, sans badge, profils supplémentaires) s’arrêtent.`,
    noAuto: 'Nous ne vous débitons jamais automatiquement — vous renouvelez seulement si vous le souhaitez.',
    cta: 'Renouveler le plan',
  },
};

const esc = (value: string) =>
  value.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );

export function planReminderEmail(input: {
  locale: string;
  name: string | null;
  plan: string;
  daysLeft: 7 | 1;
  expiresAt: Date;
  renewUrl: string;
}): { subject: string; html: string } {
  const s = STRINGS[input.locale] ?? STRINGS.en;
  const plan = PLAN_NAMES[input.plan] ?? input.plan;
  let date: string;
  try {
    date = new Intl.DateTimeFormat(input.locale, { dateStyle: 'long', timeZone: 'Europe/Sofia' }).format(input.expiresAt);
  } catch {
    date = input.expiresAt.toISOString().slice(0, 10);
  }
  const html = `<!doctype html><html lang="${esc(input.locale)}"><body style="margin:0;background:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#3b82c4;font-weight:700">Linketto</p>
<p style="font-size:18px;font-weight:600">${esc(s.hello(input.name ?? ''))}</p>
<p>${s.body(esc(plan), esc(date))}</p>
<p>${esc(s.noAuto)}</p>
<p style="margin:28px 0"><a href="${esc(input.renewUrl)}" style="background:#3b82c4;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;display:inline-block">${esc(s.cta)}</a></p>
</div></body></html>`;
  return { subject: s.subject(plan, input.daysLeft), html };
}
