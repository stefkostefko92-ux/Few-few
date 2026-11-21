// Изложение на мотивите при спиране на профил — чл. 17 Регл. (ЕС) 2022/2065
// (DSA). Праща се на собственика при всеки бан: решението и обхватът му,
// фактите (вкл. дали е по сигнал), че не е ползвано автоматизирано решение,
// основанието в Общите условия/закона и пътищата за обжалване. Чисто, тества се.
// Правни низове — родни bg/en/it/es/de/fr (останалите → en до родния превод).

// Само основания, които ОУ („Съдържание и модерация“) реално забраняват.
export const BAN_CATEGORIES = ['impersonation', 'phishing', 'illegal', 'spam', 'other'] as const;
export type BanCategory = (typeof BAN_CATEGORIES)[number];

export function isBanCategory(value: string): value is BanCategory {
  return (BAN_CATEGORIES as readonly string[]).includes(value);
}

// ОУ: „Профили не се спират без предизвестие, освен при тежки злоупотреби“.
// Тежките (фишинг, представяне за друг, незаконно) — веднага; леките (спам,
// друго) — първо предупреждение със срок за поправка.
export const SEVERE_CATEGORIES: readonly BanCategory[] = ['impersonation', 'phishing', 'illegal'];
export const WARNING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function banAllowed(input: {
  category: BanCategory;
  warnedAt: Date | null;
  now: Date;
}): 'ok' | 'warn-first' | 'wait' {
  if (SEVERE_CATEGORIES.includes(input.category)) return 'ok';
  if (!input.warnedAt) return 'warn-first';
  return input.now.getTime() - input.warnedAt.getTime() >= WARNING_DAYS * DAY_MS ? 'ok' : 'wait';
}

interface Strings {
  subject: (slug: string) => string;
  decision: (slug: string, date: string) => string;
  categories: Record<BanCategory, string>;
  categoryLabel: string;
  legalGround: string;
  facts: string;
  source: (fromReport: boolean) => string;
  automated: string;
  ground: string;
  redressTitle: string;
  redress: string[];
}

const STRINGS: Record<string, Strings> = {
  bg: {
    subject: (s) => `Linketto: профилът /u/${s} е спрян — мотиви`,
    decision: (s, d) =>
      `На ${d} спряхме профила /u/${s} за неопределен срок, във всички държави: той не се показва публично (вкл. на собствен домейн и кратки линкове), докато не отменим решението — например след обжалване. Акаунтът и данните ти остават: можеш да влизаш в таблото и да поискаш копие на данните си на info@carbonstealth.eu.`,
    categories: {
      impersonation: 'представяне за друго лице или марка',
      phishing: 'фишинг или измамни линкове',
      illegal: 'незаконно съдържание',
      spam: 'спам или подвеждащи линкове',
      other: 'друго нарушение на Общите условия',
    },
    categoryLabel: 'Вид нарушение',
    legalGround: 'Правно основание',
    facts: 'Факти и обстоятелства',
    source: (r) => (r ? 'Решението е взето след сигнал от трето лице (чл. 16 DSA).' : 'Решението е взето по наша собствена инициатива.'),
    automated: 'Не са ползвани автоматизирани средства — решението е взето и прегледано от човек.',
    ground:
      'Основание: Общите условия на Linketto, раздел „Съдържание и модерация“ (забрана на незаконно съдържание, представяне за друг, фишинг, злонамерени и подвеждащи линкове); при незаконно съдържание — и съответният закон, посочен в обосновката по-горе.',
    redressTitle: 'Как да обжалваш',
    redress: [
      'Отговори на info@carbonstealth.eu с твоите доводи — разглеждаме обжалването безплатно, от човек, без неоправдано забавяне.',
      'Можеш да подадеш жалба до Координатора за цифрови услуги в твоята държава.',
      'Можеш да потърсиш защита и пред компетентния съд.',
    ],
  },
  en: {
    subject: (s) => `Linketto: profile /u/${s} has been suspended — statement of reasons`,
    decision: (s, d) =>
      `On ${d} we suspended the profile /u/${s} for an indefinite period, in all countries: it is not shown publicly (including on a custom domain and short links) until we lift the decision, for example after an appeal. Your account and data remain: you can sign in to your dashboard and request a copy of your data at info@carbonstealth.eu.`,
    categories: {
      impersonation: 'impersonation of another person or brand',
      phishing: 'phishing or fraudulent links',
      illegal: 'illegal content',
      spam: 'spam or misleading links',
      other: 'another breach of the Terms of Service',
    },
    categoryLabel: 'Type of breach',
    legalGround: 'Legal ground',
    facts: 'Facts and circumstances',
    source: (r) => (r ? 'The decision was taken following a notice from a third party (Art. 16 DSA).' : 'The decision was taken on our own initiative.'),
    automated: 'No automated means were used — the decision was taken and reviewed by a human.',
    ground:
      'Ground: the Linketto Terms of Service, section “Content and moderation” (prohibition of illegal content, impersonation, phishing, malicious and misleading links); for illegal content, also the law referred to in the explanation above.',
    redressTitle: 'How to appeal',
    redress: [
      'Reply to info@carbonstealth.eu with your arguments — we handle appeals free of charge, by a human, without undue delay.',
      'You can lodge a complaint with the Digital Services Coordinator in your country.',
      'You can also seek redress before the competent court.',
    ],
  },
  it: {
    subject: (s) => `Linketto: il profilo /u/${s} è stato sospeso — motivazione`,
    decision: (s, d) =>
      `Il ${d} abbiamo sospeso il profilo /u/${s} a tempo indeterminato, in tutti i paesi: non viene mostrato pubblicamente (nemmeno sul dominio personalizzato e sui link brevi) finché non revochiamo la decisione — ad esempio dopo un ricorso. Il tuo account e i tuoi dati restano: puoi accedere al pannello e chiedere una copia dei tuoi dati a info@carbonstealth.eu.`,
    categories: {
      impersonation: 'spacciarsi per un’altra persona o un marchio',
      phishing: 'phishing o link fraudolenti',
      illegal: 'contenuti illegali',
      spam: 'spam o link ingannevoli',
      other: 'altra violazione dei Termini di servizio',
    },
    categoryLabel: 'Tipo di violazione',
    legalGround: 'Base giuridica',
    facts: 'Fatti e circostanze',
    source: (r) => (r ? 'La decisione è stata presa a seguito di una segnalazione di terzi (art. 16 DSA).' : 'La decisione è stata presa di nostra iniziativa.'),
    automated: 'Non sono stati utilizzati mezzi automatizzati — la decisione è stata presa e verificata da una persona.',
    ground:
      'Base: i Termini di servizio di Linketto, sezione «Contenuti e moderazione» (divieto di contenuti illegali, sostituzione di persona, phishing, link dannosi e ingannevoli); per i contenuti illegali, anche la legge indicata nella motivazione qui sopra.',
    redressTitle: 'Come presentare ricorso',
    redress: [
      'Rispondi a info@carbonstealth.eu con le tue ragioni — esaminiamo il ricorso gratuitamente, tramite una persona, senza indebito ritardo.',
      'Puoi proporre reclamo al Coordinatore dei servizi digitali del tuo paese.',
      'Puoi anche rivolgerti all’autorità giudiziaria competente.',
    ],
  },
  es: {
    subject: (s) => `Linketto: el perfil /u/${s} ha sido suspendido — declaración de motivos`,
    decision: (s, d) =>
      `El ${d} suspendimos el perfil /u/${s} por tiempo indefinido y en todos los países: no se muestra públicamente (tampoco en un dominio propio ni en enlaces cortos) hasta que revoquemos la decisión, por ejemplo, tras un recurso. Tu cuenta y tus datos se mantienen: puedes iniciar sesión en el panel y solicitar una copia de tus datos en info@carbonstealth.eu.`,
    categories: {
      impersonation: 'suplantación de otra persona o de una marca',
      phishing: 'phishing o enlaces fraudulentos',
      illegal: 'contenido ilegal',
      spam: 'spam o enlaces engañosos',
      other: 'otra infracción de los Términos del servicio',
    },
    categoryLabel: 'Tipo de infracción',
    legalGround: 'Fundamento jurídico',
    facts: 'Hechos y circunstancias',
    source: (r) => (r ? 'La decisión se tomó a raíz de una denuncia de un tercero (art. 16 DSA).' : 'La decisión se tomó por iniciativa propia.'),
    automated: 'No se han utilizado medios automatizados: la decisión la ha tomado y revisado una persona.',
    ground:
      'Fundamento: los Términos del servicio de Linketto, sección «Contenido y moderación» (prohibición del contenido ilegal, la suplantación de identidad, el phishing y los enlaces maliciosos y engañosos); en caso de contenido ilegal, también la ley indicada en la explicación anterior.',
    redressTitle: 'Cómo recurrir',
    redress: [
      'Responde a info@carbonstealth.eu con tus argumentos: tramitamos los recursos de forma gratuita, por una persona y sin demoras indebidas.',
      'Puedes presentar una reclamación ante el coordinador de servicios digitales de tu país.',
      'También puedes acudir al tribunal competente.',
    ],
  },
  de: {
    subject: (s) => `Linketto: Profil /u/${s} wurde gesperrt — Begründung`,
    decision: (s, d) =>
      `Am ${d} haben wir das Profil /u/${s} auf unbestimmte Zeit und in allen Ländern gesperrt: Es wird nicht öffentlich angezeigt (auch nicht auf einer eigenen Domain oder über Kurzlinks), bis wir die Entscheidung aufheben — zum Beispiel nach einer Beschwerde. Dein Konto und deine Daten bleiben bestehen: Du kannst dich im Dashboard anmelden und unter info@carbonstealth.eu eine Kopie deiner Daten anfordern.`,
    categories: {
      impersonation: 'Ausgeben als andere Person oder Marke',
      phishing: 'Phishing oder betrügerische Links',
      illegal: 'rechtswidrige Inhalte',
      spam: 'Spam oder irreführende Links',
      other: 'sonstiger Verstoß gegen die Nutzungsbedingungen',
    },
    categoryLabel: 'Art des Verstoßes',
    legalGround: 'Rechtsgrundlage',
    facts: 'Tatsachen und Umstände',
    source: (r) => (r ? 'Die Entscheidung erfolgte aufgrund der Meldung eines Dritten (Art. 16 DSA).' : 'Die Entscheidung erfolgte aus eigener Initiative.'),
    automated: 'Es wurden keine automatisierten Mittel eingesetzt — die Entscheidung wurde von einem Menschen getroffen und geprüft.',
    ground:
      'Grundlage: die Nutzungsbedingungen von Linketto, Abschnitt „Inhalte und Moderation“ (Verbot rechtswidriger Inhalte, des Ausgebens als eine andere Person, von Phishing sowie schädlicher und irreführender Links); bei rechtswidrigen Inhalten zusätzlich das in der Begründung oben genannte Gesetz.',
    redressTitle: 'So legst du Beschwerde ein',
    redress: [
      'Antworte an info@carbonstealth.eu mit deinen Argumenten — wir prüfen Beschwerden kostenlos, durch einen Menschen und ohne unangemessene Verzögerung.',
      'Du kannst dich beim Koordinator für digitale Dienste in deinem Land beschweren.',
      'Du kannst auch das zuständige Gericht anrufen.',
    ],
  },
  fr: {
    subject: (s) => `Linketto : le profil /u/${s} a été suspendu — exposé des motifs`,
    decision: (s, d) =>
      `Le ${d}, nous avons suspendu le profil /u/${s} pour une durée indéterminée, dans tous les pays : il n’est pas affiché publiquement (y compris sur un domaine personnalisé et via des liens courts) tant que nous n’avons pas levé la décision, par exemple à la suite d’un recours. Votre compte et vos données sont conservés : vous pouvez vous connecter à votre tableau de bord et demander une copie de vos données à info@carbonstealth.eu.`,
    categories: {
      impersonation: 'usurpation de l’identité d’une personne ou d’une marque',
      phishing: 'hameçonnage ou liens frauduleux',
      illegal: 'contenus illicites',
      spam: 'spam ou liens trompeurs',
      other: 'autre manquement aux Conditions d’utilisation',
    },
    categoryLabel: 'Type de manquement',
    legalGround: 'Fondement juridique',
    facts: 'Faits et circonstances',
    source: (r) => (r ? 'La décision a été prise à la suite du signalement d’un tiers (art. 16 DSA).' : 'La décision a été prise de notre propre initiative.'),
    automated: 'Aucun moyen automatisé n’a été utilisé — la décision a été prise et examinée par une personne.',
    ground:
      'Fondement : les Conditions d’utilisation de Linketto, section « Contenu et modération » (interdiction des contenus illicites, de l’usurpation d’identité, de l’hameçonnage et des liens malveillants et trompeurs) ; pour les contenus illicites, également la loi mentionnée dans l’explication ci-dessus.',
    redressTitle: 'Comment former un recours',
    redress: [
      'Répondez à info@carbonstealth.eu en exposant vos arguments — nous examinons les recours gratuitement, par une personne et sans retard injustifié.',
      'Vous pouvez introduire une réclamation auprès du coordinateur pour les services numériques de votre pays.',
      'Vous pouvez également saisir la juridiction compétente.',
    ],
  },
};

const esc = (value: string) =>
  value.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));

export function banNoticeEmail(input: {
  locale: string;
  slug: string;
  category: BanCategory;
  reason: string;
  /** Задължително при „незаконно съдържание“ — кой закон и защо (чл. 17(3)(г)). */
  legalGround?: string;
  decidedAt: Date;
  fromReport: boolean;
}): { subject: string; html: string } {
  const lang = STRINGS[input.locale] ? input.locale : 'en';
  const s = STRINGS[lang];
  const slug = esc(input.slug);
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(input.decidedAt);
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <h1 style="font-size:20px">Linketto</h1>
  <p>${s.decision(slug, date)}</p>
  <p><strong>${s.categoryLabel}:</strong> ${s.categories[input.category]}</p>
  ${input.legalGround ? `<p><strong>${s.legalGround}:</strong> ${esc(input.legalGround)}</p>` : ''}
  <p><strong>${s.facts}:</strong><br>${esc(input.reason).replace(/\n/g, '<br>')}</p>
  <p>${s.source(input.fromReport)}</p>
  <p>${s.automated}</p>
  <p style="font-size:14px">${s.ground}</p>
  <h2 style="font-size:16px;margin-top:24px">${s.redressTitle}</h2>
  <ul style="line-height:1.6">${s.redress.map((r) => `<li>${r}</li>`).join('')}</ul>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#64748b;font-size:12px">Carbon Stealth VCC · ЕИК/EIK 208725180 · info@carbonstealth.eu</p>
</div>`;
  return { subject: s.subject(input.slug), html };
}

// ── Предупреждение преди спиране (леки нарушения) ─────────────────────
const WARN: Record<string, {
  subject: (slug: string) => string;
  intro: (slug: string, deadline: string) => string;
  source: (fromReport: boolean) => string;
  reply: string;
}> = {
  bg: {
    subject: (s) => `Linketto: предупреждение за профила /u/${s}`,
    intro: (s, d) =>
      `Профилът /u/${s} нарушава Общите условия (раздел „Съдържание и модерация“). Моля, поправи го до ${d} — иначе ще спрем профила. Засега той остава публичен.`,
    source: (r) => (r ? 'Предупреждението е след сигнал от трето лице.' : 'Предупреждението е по наша собствена инициатива.'),
    reply: 'Ако смяташ, че грешим, отговори на info@carbonstealth.eu — разглежда го човек, безплатно.',
  },
  en: {
    subject: (s) => `Linketto: warning about profile /u/${s}`,
    intro: (s, d) =>
      `The profile /u/${s} breaches the Terms of Service (section “Content and moderation”). Please fix it by ${d} — otherwise we will suspend the profile. For now it stays public.`,
    source: (r) => (r ? 'This warning follows a notice from a third party.' : 'This warning is on our own initiative.'),
    reply: 'If you think we are wrong, reply to info@carbonstealth.eu — a human reviews it, free of charge.',
  },
  it: {
    subject: (s) => `Linketto: avvertimento per il profilo /u/${s}`,
    intro: (s, d) =>
      `Il profilo /u/${s} viola i Termini di servizio (sezione «Contenuti e moderazione»). Correggilo entro il ${d} — altrimenti sospenderemo il profilo. Per ora resta pubblico.`,
    source: (r) => (r ? 'L’avvertimento fa seguito a una segnalazione di terzi.' : 'L’avvertimento è di nostra iniziativa.'),
    reply: 'Se ritieni che abbiamo sbagliato, rispondi a info@carbonstealth.eu — lo esamina una persona, gratuitamente.',
  },
  es: {
    subject: (s) => `Linketto: advertencia sobre el perfil /u/${s}`,
    intro: (s, d) =>
      `El perfil /u/${s} infringe los Términos del servicio (sección «Contenido y moderación»). Corrígelo a más tardar el ${d}; de lo contrario, suspenderemos el perfil. Por ahora sigue siendo público.`,
    source: (r) => (r ? 'Esta advertencia se debe a una denuncia de un tercero.' : 'Esta advertencia es por iniciativa propia.'),
    reply: 'Si crees que nos equivocamos, responde a info@carbonstealth.eu: lo revisa una persona, de forma gratuita.',
  },
  de: {
    subject: (s) => `Linketto: Verwarnung zum Profil /u/${s}`,
    intro: (s, d) =>
      `Das Profil /u/${s} verstößt gegen die Nutzungsbedingungen (Abschnitt „Inhalte und Moderation“). Bitte behebe das bis zum ${d} — sonst sperren wir das Profil. Vorerst bleibt es öffentlich.`,
    source: (r) => (r ? 'Diese Verwarnung folgt auf die Meldung eines Dritten.' : 'Diese Verwarnung erfolgt aus eigener Initiative.'),
    reply: 'Wenn du meinst, dass wir uns irren, antworte an info@carbonstealth.eu — ein Mensch prüft das, kostenlos.',
  },
  fr: {
    subject: (s) => `Linketto : avertissement concernant le profil /u/${s}`,
    intro: (s, d) =>
      `Le profil /u/${s} enfreint les Conditions d’utilisation (section « Contenu et modération »). Veuillez le corriger d’ici le ${d} — à défaut, nous suspendrons le profil. Pour l’instant, il reste public.`,
    source: (r) => (r ? 'Cet avertissement fait suite au signalement d’un tiers.' : 'Cet avertissement est pris de notre propre initiative.'),
    reply: 'Si vous pensez que nous nous trompons, répondez à info@carbonstealth.eu — une personne l’examine, gratuitement.',
  },
};

export function warningNoticeEmail(input: {
  locale: string;
  slug: string;
  category: BanCategory;
  reason: string;
  decidedAt: Date;
  fromReport: boolean;
}): { subject: string; html: string } {
  const lang = WARN[input.locale] ? input.locale : 'en';
  const w = WARN[lang];
  const s = STRINGS[lang];
  const deadline = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(input.decidedAt.getTime() + WARNING_DAYS * DAY_MS),
  );
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <h1 style="font-size:20px">Linketto</h1>
  <p>${w.intro(esc(input.slug), deadline)}</p>
  <p><strong>${s.categoryLabel}:</strong> ${s.categories[input.category]}</p>
  <p><strong>${s.facts}:</strong><br>${esc(input.reason).replace(/\n/g, '<br>')}</p>
  <p>${w.source(input.fromReport)}</p>
  <p>${w.reply}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#64748b;font-size:12px">Carbon Stealth VCC · ЕИК/EIK 208725180 · info@carbonstealth.eu</p>
</div>`;
  return { subject: w.subject(input.slug), html };
}
