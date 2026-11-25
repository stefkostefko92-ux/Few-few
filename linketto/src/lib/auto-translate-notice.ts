// Предварителното уведомление до създателите отпреди автоматичния превод
// (правен преглед, ОРЗД чл. 12–13): какво, към кого, основание, право на
// възражение и датата на включване. Правен текст — само човешки преводи;
// езиците без превод получават английския. Чисто — тества се.

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

type Strings = {
  subject: (date: string) => string;
  greeting: string;
  what: (profiles: string, date: string) => string;
  sent: string;
  basis: string;
  objection: (dashboard: string, date: string) => string;
  accuracy: string;
  docs: (privacy: string, terms: string) => string;
  complaint: string;
};

const STRINGS: Record<string, Strings> = {
  bg: {
    subject: (d) => `Промяна в Linketto: автоматичен превод на профила ти за посетители на други езици (от ${d})`,
    greeting: 'Здравей,',
    what: (p, d) =>
      `от ${d} включваме нова функция: посетител, на чийто език нямаш свой превод, ще вижда профила ти (${p}) машинно преведен, с етикет „Машинен превод (ИИ)“ и връзка към оригинала. Твоите преводи винаги имат предимство.`,
    sent: 'Какво се изпраща и към кого: публичното съдържание на профила — име, описание, заглавия на блоковете и заглавия на продуктите (описанията на продуктите не се превеждат) — и езикът на превода, към Google LLC (Gemini API, САЩ), който го обработва от наше име като обработващ и не го използва за обучение на моделите си. Трансферът е по Рамката за защита на данните ЕС–САЩ. Данни за посетителите ти не се изпращат. Преводите пазим при нас в ЕС, докато не промениш съдържанието, не изключиш функцията или не изтриеш профила.',
    basis: 'Основание: легитимен интерес (чл. 6(1)(е) ОРЗД).',
    objection: (u, d) =>
      `Имаш право да възразиш по всяко време: изключи функцията с един бутон в таблото (<a href="${u}">${u}</a>). Ако го направиш преди ${d}, нищо от профила ти няма да бъде изпратено; ако го направиш по-късно, пазените преводи се изтриват веднага.`,
    accuracy: 'Машинният превод може да съдържа неточности — за важни текстове добави свой превод.',
    docs: (p, t) => `Обновените <a href="${p}">Политика за поверителност</a> и <a href="${t}">Общи условия</a>. Въпроси: info@carbonstealth.eu.`,
    complaint: 'Имаш право на жалба до Комисията за защита на личните данни (www.cpdp.bg).',
  },
  en: {
    subject: (d) => `Change at Linketto: automatic translation of your profile for visitors in other languages (from ${d})`,
    greeting: 'Hello,',
    what: (p, d) =>
      `from ${d} we are switching on a new feature: a visitor whose language you have not translated your profile into will see your profile (${p}) machine-translated, labelled “Machine translation (AI)” with a link to the original. Your own translations always take precedence.`,
    sent: 'What is sent and to whom: the public content of the profile — name, description, block titles and product titles (product descriptions are not translated) — and the target language, to Google LLC (Gemini API, USA), which processes it on our behalf as a processor and does not use it to train its models. The transfer relies on the EU–US Data Privacy Framework. No data about your visitors is sent. We keep the translations with us in the EU until you change the content, switch the feature off or delete the profile.',
    basis: 'Legal basis: legitimate interest (Art. 6(1)(f) GDPR).',
    objection: (u, d) =>
      `You can object at any time: switch the feature off with one button in your dashboard (<a href="${u}">${u}</a>). If you do so before ${d}, nothing from your profile will be sent; if you do so later, the stored translations are deleted immediately.`,
    accuracy: 'Machine translation may contain inaccuracies — add your own translation for important texts.',
    docs: (p, t) => `The updated <a href="${p}">Privacy Policy</a> and <a href="${t}">Terms</a>. Questions: info@carbonstealth.eu.`,
    complaint: 'You have the right to lodge a complaint with a supervisory authority (in Bulgaria: www.cpdp.bg, or the one where you live).',
  },
  it: {
    subject: (d) => `Novità su Linketto: traduzione automatica del tuo profilo per i visitatori di altre lingue (dal ${d})`,
    greeting: 'Ciao,',
    what: (p, d) =>
      `dal ${d} attiviamo una nuova funzionalità: un visitatore nella cui lingua non hai una tua traduzione vedrà il tuo profilo (${p}) tradotto automaticamente, con l’etichetta «Traduzione automatica (AI)» e un link all’originale. Le tue traduzioni hanno sempre la precedenza.`,
    sent: 'Cosa viene inviato e a chi: il contenuto pubblico del profilo — nome, descrizione, titoli dei blocchi e titoli dei prodotti (le descrizioni dei prodotti non vengono tradotte) — e la lingua di destinazione, a Google LLC (Gemini API, USA), che lo tratta per nostro conto come responsabile del trattamento e non lo usa per addestrare i propri modelli. Il trasferimento si basa sul quadro UE-USA per la protezione dei dati personali. Nessun dato sui tuoi visitatori viene inviato. Conserviamo le traduzioni presso di noi nell’UE finché non modifichi il contenuto, non disattivi la funzionalità o non elimini il profilo.',
    basis: 'Base giuridica: legittimo interesse (art. 6(1)(f) GDPR).',
    objection: (u, d) =>
      `Hai il diritto di opporti in qualsiasi momento: disattiva la funzionalità con un solo pulsante nel pannello (<a href="${u}">${u}</a>). Se lo fai prima del ${d}, nulla del tuo profilo verrà inviato; se lo fai dopo, le traduzioni conservate vengono cancellate subito.`,
    accuracy: 'La traduzione automatica può contenere imprecisioni — per i testi importanti aggiungi una tua traduzione.',
    docs: (p, t) => `L’<a href="${p}">Informativa sulla privacy</a> e i <a href="${t}">Termini di servizio</a> aggiornati. Domande: info@carbonstealth.eu.`,
    complaint: 'Hai il diritto di proporre reclamo a un’autorità di controllo (in Bulgaria: www.cpdp.bg, oppure quella del paese in cui vivi).',
  },
  es: {
    subject: (d) => `Cambio en Linketto: traducción automática de tu perfil para visitantes de otros idiomas (desde el ${d})`,
    greeting: 'Hola:',
    what: (p, d) =>
      `Desde el ${d} activamos una nueva función: un visitante en cuyo idioma no tienes traducción propia verá tu perfil (${p}) traducido automáticamente, con la etiqueta «Traducción automática (IA)» y un enlace al original. Tus traducciones siempre tienen prioridad.`,
    sent: 'Qué se envía y a quién: el contenido público del perfil — nombre, descripción, títulos de los bloques y títulos de los productos (las descripciones de los productos no se traducen) — y el idioma de destino, a Google LLC (Gemini API, EE. UU.), que lo trata por cuenta nuestra como encargado del tratamiento y no lo utiliza para entrenar sus modelos. La transferencia se basa en el Marco de Privacidad de Datos UE-EE. UU. No se envía ningún dato de tus visitantes. Conservamos las traducciones en nuestros sistemas en la UE hasta que cambies el contenido, desactives la función o elimines el perfil.',
    basis: 'Base jurídica: interés legítimo (art. 6(1)(f) RGPD).',
    objection: (u, d) =>
      `Tienes derecho a oponerte en cualquier momento: desactiva la función con un solo botón en el panel (<a href="${u}">${u}</a>). Si lo haces antes del ${d}, no se enviará nada de tu perfil; si lo haces después, las traducciones guardadas se eliminan de inmediato.`,
    accuracy: 'La traducción automática puede contener imprecisiones — para los textos importantes añade tu propia traducción.',
    docs: (p, t) => `La <a href="${p}">Política de privacidad</a> y los <a href="${t}">Términos del servicio</a> actualizados. Preguntas: info@carbonstealth.eu.`,
    complaint: 'Tienes derecho a presentar una reclamación ante una autoridad de control (en Bulgaria: www.cpdp.bg, o la del país en el que vives).',
  },
  de: {
    subject: (d) => `Änderung bei Linketto: automatische Übersetzung deines Profils für Besucher mit anderen Sprachen (ab ${d})`,
    greeting: 'Hallo,',
    what: (p, d) =>
      `ab ${d} schalten wir eine neue Funktion ein: Besucher, für deren Sprache du keine eigene Übersetzung hast, sehen dein Profil (${p}) maschinell übersetzt, mit dem Hinweis „Maschinelle Übersetzung (KI)“ und einem Link zum Original. Deine eigenen Übersetzungen haben immer Vorrang.`,
    sent: 'Was an wen gesendet wird: die öffentlichen Inhalte des Profils — Name, Beschreibung, Titel der Blöcke und Titel der Produkte (Produktbeschreibungen werden nicht übersetzt) — und die Zielsprache, an Google LLC (Gemini API, USA), die sie in unserem Auftrag als Auftragsverarbeiter verarbeitet und nicht zum Training ihrer Modelle verwendet. Die Übermittlung erfolgt auf Grundlage des EU-US-Datenschutzrahmens. Daten über deine Besucher werden nicht gesendet. Die Übersetzungen speichern wir bei uns in der EU, bis du die Inhalte änderst, die Funktion ausschaltest oder das Profil löschst.',
    basis: 'Rechtsgrundlage: berechtigtes Interesse (Art. 6(1)(f) DSGVO).',
    objection: (u, d) =>
      `Du kannst jederzeit widersprechen: Schalte die Funktion mit einem Klick im Dashboard aus (<a href="${u}">${u}</a>). Tust du das vor dem ${d}, wird nichts aus deinem Profil gesendet; tust du es später, werden die gespeicherten Übersetzungen sofort gelöscht.`,
    accuracy: 'Maschinelle Übersetzungen können Ungenauigkeiten enthalten — füge für wichtige Texte eine eigene Übersetzung hinzu.',
    docs: (p, t) => `Die aktualisierte <a href="${p}">Datenschutzerklärung</a> und die aktualisierten <a href="${t}">Nutzungsbedingungen</a>. Fragen: info@carbonstealth.eu.`,
    complaint: 'Du hast das Recht, dich bei einer Aufsichtsbehörde zu beschweren (in Bulgarien: www.cpdp.bg, oder bei der Behörde deines Wohnsitzlandes).',
  },
  fr: {
    subject: (d) => `Changement chez Linketto : traduction automatique de votre profil pour les visiteurs d’autres langues (à partir du ${d})`,
    greeting: 'Bonjour,',
    what: (p, d) =>
      `à partir du ${d}, nous activons une nouvelle fonctionnalité : un visiteur dont vous n’avez pas traduit la langue verra votre profil (${p}) traduit automatiquement, avec la mention « Traduction automatique (IA) » et un lien vers l’original. Vos propres traductions ont toujours la priorité.`,
    sent: 'Ce qui est envoyé et à qui : le contenu public du profil — nom, description, titres des blocs et titres des produits (les descriptions des produits ne sont pas traduites) — et la langue cible, à Google LLC (Gemini API, États-Unis), qui le traite pour notre compte en tant que sous-traitant et ne l’utilise pas pour entraîner ses modèles. Le transfert repose sur le cadre de protection des données UE–États-Unis. Aucune donnée concernant vos visiteurs n’est envoyée. Nous conservons les traductions chez nous, dans l’UE, jusqu’à ce que vous modifiiez le contenu, désactiviez la fonctionnalité ou supprimiez le profil.',
    basis: 'Base juridique : intérêt légitime (art. 6(1)(f) RGPD).',
    objection: (u, d) =>
      `Vous pouvez vous y opposer à tout moment : désactivez la fonctionnalité en un clic depuis votre tableau de bord (<a href="${u}">${u}</a>). Si vous le faites avant le ${d}, rien de votre profil ne sera envoyé ; si vous le faites plus tard, les traductions conservées sont supprimées immédiatement.`,
    accuracy: 'La traduction automatique peut comporter des inexactitudes — pour les textes importants, ajoutez votre propre traduction.',
    docs: (p, t) => `La <a href="${p}">Politique de confidentialité</a> et les <a href="${t}">Conditions d’utilisation</a> mises à jour. Questions : info@carbonstealth.eu.`,
    complaint: 'Vous avez le droit d’introduire une réclamation auprès d’une autorité de contrôle (en Bulgarie : www.cpdp.bg, ou celle de votre pays de résidence).',
  },
};

export function autoTranslateNoticeEmail(input: {
  locale: string;
  slugs: string[];
  startsAt: Date;
  baseUrl: string;
}): { subject: string; html: string } {
  const lang = STRINGS[input.locale] ? input.locale : 'en';
  const s = STRINGS[lang]!;
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(input.startsAt);
  const base = input.baseUrl.replace(/\/$/, '');
  const profiles = input.slugs.map((slug) => esc(`/u/${slug}`)).join(', ');
  const dashboard = esc(`${base}/${lang}/dashboard#languages`);
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;line-height:1.55">
  <h1 style="font-size:20px">Linketto</h1>
  <p>${s.greeting}</p>
  <p>${s.what(profiles, esc(date))}</p>
  <p>${s.sent}</p>
  <p>${s.basis}</p>
  <p>${s.objection(dashboard, esc(date))}</p>
  <p>${s.accuracy}</p>
  <p>${s.docs(esc(`${base}/${lang}/privacy`), esc(`${base}/${lang}/terms`))}</p>
  <p style="font-size:14px">${s.complaint}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#64748b;font-size:12px">Carbon Stealth VCC · ЕИК/EIK 208725180 · ул. „Самуил“ 3, 2670 Бобов дол · info@carbonstealth.eu</p>
</div>`;
  return { subject: s.subject(date), html };
}

/** Кога да се включи: ≥14 пълни дни след уведомлението (полунощ UTC). */
export function autoTranslateStartDate(notifiedAt: Date, days = 14): Date {
  const start = new Date(notifiedAt.getTime() + (days + 1) * 86_400_000);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}
