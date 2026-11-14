// Потвърждение на поръчка за план на траен носител (чл. 8(7) и чл. 6(1) Дир.
// 2011/83; ЗЗП) — праща се веднъж след платена поръчка (P14). Чисто, тества
// се. Правни низове: родни bg/en/it/es/de/fr (останалите → en до родния превод
// през Преводача + Правния Разбирач — никога машинен превод на правен текст).

const SELLER =
  'Carbon Stealth VCC · ЕИК/EIK 208725180 · ДДС/VAT BG208725180 · ул. „Самуил“ 3 / 3 Samuil St, 2670 Бобов дол / Bobov Dol, България / Bulgaria · info@carbonstealth.eu';

const PLAN_NAMES: Record<string, string> = { PRO: 'Pro', BUSINESS: 'Business', FOUNDER: 'Founder' };

interface Strings {
  subject: (plan: string) => string;
  hello: (name: string | null) => string;
  intro: string;
  seller: string;
  planLabel: string;
  periodLabel: string;
  periods: Record<string, string>;
  paidUntil: (date: string) => string;
  forever: string;
  total: (amount: string, vat: string, rate: string) => string;
  noAuto: string;
  withdrawalTitle: string;
  withdrawal: string;
  formTitle: string;
  form: string;
  terms: string;
  orderRef: string;
  /** Ред за бутона „Откажете се от договора тук“ (чл. 11а); липсващ език → без реда. */
  withdrawButton?: (date: string, url: string) => string;
}

const STRINGS: Record<string, Strings> = {
  bg: {
    subject: (p) => `Linketto ${p}: потвърждение на плащането`,
    hello: (n) => (n ? `Здравей, ${n}!` : 'Здравей!'),
    intro: 'Благодарим ти! Плащането е получено и планът ти е активен. Това писмо е потвърждението на договора — запази го.',
    seller: 'Търговец',
    planLabel: 'План',
    periodLabel: 'Период',
    periods: { monthly: '1 месец', quarterly: '3 месеца', semiannual: '6 месеца', annual: '12 месеца', lifetime: 'завинаги' },
    paidUntil: (d) => `Платен до: <strong>${d}</strong>`,
    forever: '„Основател“ — без срок на плащане.',
    total: (a, v, r) => `Обща сума: <strong>${a}</strong> (с вкл. ДДС ${r} — ${v})`,
    noAuto: 'Еднократно плащане, без автоматично подновяване — не те таксуваме повече, освен ако сам не удължиш.',
    withdrawalTitle: 'Право на отказ',
    withdrawal:
      'Ако си потребител, можеш да се откажеш от договора в срок от 14 дни, считано от деня след плащането, без да посочваш причина и без разноски. Планът започва веднага; при отказ в срока връщаме цялата сума, без да удържаме нищо за използваните дни, не по-късно от 14 дни от получаването на отказа, по същия начин на плащане. Изпрати ни ясно изявление на info@carbonstealth.eu — можеш да ползваш формуляра по-долу, но не е задължително. При отказ отпада само платеното с това плащане — планът и срокът отпреди него се възстановяват.',
    formTitle: 'Стандартен формуляр за отказ',
    form:
      'До: Carbon Stealth VCC, ул. „Самуил“ 3, 2670 Бобов дол, България, info@carbonstealth.eu. С настоящото уведомявам, че се отказвам от договора за следната услуга: … / Поръчана на: … / Име: … / Адрес: … / Имейл на акаунта: … / Подпис (само на хартия) / Дата: …',
    terms: 'Общи условия',
    orderRef: 'Номер на поръчката',
    withdrawButton: (d, u) =>
      `Можеш да се откажеш и с бутона „Откажете се от договора тук“ в <a href="${u}" style="color:#3b82c4">таблото</a> (секция „План“) до ${d} включително.`,
  },
  en: {
    subject: (p) => `Linketto ${p}: payment confirmation`,
    hello: (n) => (n ? `Hi ${n}!` : 'Hi!'),
    intro: 'Thank you! Your payment has been received and your plan is active. This email confirms the contract — please keep it.',
    seller: 'Trader',
    planLabel: 'Plan',
    periodLabel: 'Period',
    periods: { monthly: '1 month', quarterly: '3 months', semiannual: '6 months', annual: '12 months', lifetime: 'forever' },
    paidUntil: (d) => `Paid until: <strong>${d}</strong>`,
    forever: 'Founder — no payment end date.',
    total: (a, v, r) => `Total: <strong>${a}</strong> (incl. ${r} VAT — ${v})`,
    noAuto: 'One-time payment, no automatic renewal — we will not charge you again unless you extend yourself.',
    withdrawalTitle: 'Right of withdrawal',
    withdrawal:
      'If you are a consumer, you may withdraw from the contract within 14 days starting from the day after the payment, without giving any reason and at no cost. The plan starts immediately; if you withdraw in time, we refund the full amount, with no deduction for days used, no later than 14 days from receiving your notice, using the same means of payment. Send us a clear statement at info@carbonstealth.eu — you may use the form below, but you do not have to. Withdrawal removes only what this payment bought — the plan and period you had before it are restored.',
    formTitle: 'Model withdrawal form',
    form:
      'To: Carbon Stealth VCC, 3 Samuil St, 2670 Bobov Dol, Bulgaria, info@carbonstealth.eu. I hereby give notice that I withdraw from my contract for the provision of the following service: … / Ordered on: … / Name: … / Address: … / Account email: … / Signature (only if on paper) / Date: …',
    terms: 'Terms of service',
    orderRef: 'Order number',
    withdrawButton: (d, u) =>
      `You can also withdraw with the “Withdraw from contract here” button in your <a href="${u}" style="color:#3b82c4">dashboard</a> (section “Plan”) until ${d} inclusive.`,
  },
  it: {
    subject: (p) => `Linketto ${p}: conferma del pagamento`,
    hello: (n) => (n ? `Ciao ${n}!` : 'Ciao!'),
    intro: 'Grazie! Abbiamo ricevuto il pagamento e il tuo piano è attivo. Questa email è la conferma del contratto — conservala.',
    seller: 'Professionista',
    planLabel: 'Piano',
    periodLabel: 'Periodo',
    periods: { monthly: '1 mese', quarterly: '3 mesi', semiannual: '6 mesi', annual: '12 mesi', lifetime: 'per sempre' },
    paidUntil: (d) => `Pagato fino al <strong>${d}</strong>`,
    forever: 'Founder — senza scadenza di pagamento.',
    total: (a, v, r) => `Importo totale: <strong>${a}</strong> (IVA ${r} inclusa — ${v})`,
    noAuto: 'Pagamento unico, senza rinnovo automatico — non ti addebiteremo altro, a meno che non sia tu a prolungare.',
    withdrawalTitle: 'Diritto di recesso',
    withdrawal:
      'Se sei un consumatore, puoi recedere dal contratto entro 14 giorni dal giorno del pagamento, senza indicarne le ragioni e senza costi. Il piano inizia subito; in caso di recesso nei termini ti rimborsiamo l’intero importo, senza trattenere nulla per i giorni utilizzati, entro 14 giorni dal ricevimento del recesso, con lo stesso mezzo di pagamento. Inviaci una dichiarazione esplicita a info@carbonstealth.eu — puoi usare il modulo qui sotto, ma non è obbligatorio. Con il recesso viene meno solo ciò che è stato acquistato con questo pagamento — il piano e il periodo precedenti vengono ripristinati.',
    formTitle: 'Modulo di recesso tipo',
    form:
      'Destinatario: Carbon Stealth VCC, ul. Samuil 3, 2670 Bobov Dol, Bulgaria, info@carbonstealth.eu. Con la presente notifico il recesso dal mio contratto di vendita dei seguenti servizi: … / Ordinato il: … / Nome: … / Indirizzo: … / Email dell’account: … / Firma (solo se il presente modulo è notificato in versione cartacea) / Data: …',
    terms: 'Termini di servizio',
    orderRef: 'Numero d’ordine',
    withdrawButton: (d, u) =>
      `Puoi recedere anche con il pulsante «Recedere dal contratto qui» nel <a href="${u}" style="color:#3b82c4">pannello</a> (sezione «Piano») fino al ${d} incluso.`,
  },
  es: {
    subject: (p) => `Linketto ${p}: confirmación del pago`,
    hello: (n) => (n ? `¡Hola, ${n}!` : '¡Hola!'),
    intro: '¡Gracias! Hemos recibido el pago y tu plan está activo. Este email es la confirmación del contrato; guárdalo.',
    seller: 'Comerciante',
    planLabel: 'Plan',
    periodLabel: 'Período',
    periods: { monthly: '1 mes', quarterly: '3 meses', semiannual: '6 meses', annual: '12 meses', lifetime: 'para siempre' },
    paidUntil: (d) => `Pagado hasta el <strong>${d}</strong>`,
    forever: 'Founder: sin fecha de fin de pago.',
    total: (a, v, r) => `Importe total: <strong>${a}</strong> (IVA del ${r} incluido: ${v})`,
    noAuto: 'Pago único, sin renovación automática: no te cobraremos nada más, salvo que tú mismo amplíes el plan.',
    withdrawalTitle: 'Derecho de desistimiento',
    withdrawal:
      'Si eres consumidor, puedes desistir del contrato en un plazo de 14 días desde el día del pago, sin indicar el motivo y sin ningún coste. El plan empieza de inmediato; si desistes dentro del plazo, te devolvemos el importe íntegro, sin descontar nada por los días utilizados, a más tardar 14 días después de recibir tu desistimiento, por el mismo medio de pago. Envíanos una declaración inequívoca a info@carbonstealth.eu; puedes usar el formulario de abajo, aunque no es obligatorio. Con el desistimiento se retira solo lo adquirido con este pago: se restablecen el plan y el período que tenías antes.',
    formTitle: 'Modelo de formulario de desistimiento',
    form:
      'A la atención de: Carbon Stealth VCC, ul. Samuil 3, 2670 Bobov Dol, Bulgaria, info@carbonstealth.eu. Por la presente le comunico que desisto de mi contrato de prestación del siguiente servicio: … / Pedido el: … / Nombre: … / Domicilio: … / Email de la cuenta: … / Firma (solo si el presente formulario se presenta en papel) / Fecha: …',
    terms: 'Términos del servicio',
    orderRef: 'Número de pedido',
    withdrawButton: (d, u) =>
      `También puedes desistir con el botón «Desistir del contrato aquí» de tu <a href="${u}" style="color:#3b82c4">panel</a> (sección «Plan») hasta el ${d} inclusive.`,
  },
  de: {
    subject: (p) => `Linketto ${p}: Zahlungsbestätigung`,
    hello: (n) => (n ? `Hallo ${n}!` : 'Hallo!'),
    intro: 'Danke! Deine Zahlung ist eingegangen und dein Plan ist aktiv. Diese E-Mail ist die Bestätigung des Vertrags — bitte bewahre sie auf.',
    seller: 'Unternehmer',
    planLabel: 'Plan',
    periodLabel: 'Zeitraum',
    periods: { monthly: '1 Monat', quarterly: '3 Monate', semiannual: '6 Monate', annual: '12 Monate', lifetime: 'für immer' },
    paidUntil: (d) => `Bezahlt bis: <strong>${d}</strong>`,
    forever: 'Founder — ohne Laufzeitende.',
    total: (a, v, r) => `Gesamtbetrag: <strong>${a}</strong> (inkl. ${r} MwSt. — ${v})`,
    noAuto: 'Einmalzahlung, keine automatische Verlängerung — wir buchen nichts weiter ab, außer du verlängerst selbst.',
    withdrawalTitle: 'Widerrufsrecht',
    withdrawal:
      'Wenn du Verbraucher bist, kannst du den Vertrag binnen 14 Tagen ab dem Tag der Zahlung ohne Angabe von Gründen und ohne Kosten widerrufen. Der Plan beginnt sofort; bei fristgerechtem Widerruf erstatten wir dir den vollen Betrag, ohne etwas für die genutzten Tage einzubehalten, spätestens binnen 14 Tagen ab Eingang deines Widerrufs, über dasselbe Zahlungsmittel. Sende uns eine eindeutige Erklärung an info@carbonstealth.eu — du kannst das untenstehende Formular verwenden, musst es aber nicht. Durch den Widerruf entfällt nur, was mit dieser Zahlung bezahlt wurde — der Plan und der Zeitraum von davor werden wiederhergestellt.',
    formTitle: 'Muster-Widerrufsformular',
    form:
      'An: Carbon Stealth VCC, ul. Samuil 3, 2670 Bobov Dol, Bulgarien, info@carbonstealth.eu. Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: … / Bestellt am: … / Name: … / Anschrift: … / E-Mail-Adresse des Kontos: … / Unterschrift (nur bei Mitteilung auf Papier) / Datum: …',
    terms: 'Nutzungsbedingungen',
    orderRef: 'Bestellnummer',
    withdrawButton: (d, u) =>
      `Du kannst auch über die Schaltfläche „Vertrag widerrufen“ in deinem <a href="${u}" style="color:#3b82c4">Dashboard</a> (Bereich „Plan“) bis einschließlich ${d} widerrufen.`,
  },
  fr: {
    subject: (p) => `Linketto ${p} : confirmation du paiement`,
    hello: (n) => (n ? `Bonjour ${n} !` : 'Bonjour !'),
    intro: 'Merci ! Votre paiement a bien été reçu et votre plan est actif. Cet e-mail confirme le contrat — conservez-le.',
    seller: 'Professionnel',
    planLabel: 'Plan',
    periodLabel: 'Période',
    periods: { monthly: '1 mois', quarterly: '3 mois', semiannual: '6 mois', annual: '12 mois', lifetime: 'pour toujours' },
    paidUntil: (d) => `Payé jusqu’au <strong>${d}</strong>`,
    forever: 'Founder — sans date de fin de paiement.',
    total: (a, v, r) => `Montant total : <strong>${a}</strong> (dont TVA ${r} — ${v})`,
    noAuto: 'Paiement unique, sans renouvellement automatique — nous ne vous facturerons rien de plus, sauf si vous prolongez vous-même.',
    withdrawalTitle: 'Droit de rétractation',
    withdrawal:
      'Si vous êtes un consommateur, vous pouvez vous rétracter du contrat dans un délai de 14 jours à compter du jour du paiement, sans avoir à motiver votre décision et sans frais. Le plan démarre immédiatement ; en cas de rétractation dans le délai, nous vous remboursons l’intégralité du montant, sans rien retenir pour les jours utilisés, au plus tard 14 jours après réception de votre rétractation, en utilisant le même moyen de paiement. Envoyez-nous une déclaration dénuée d’ambiguïté à info@carbonstealth.eu — vous pouvez utiliser le formulaire ci-dessous, mais ce n’est pas obligatoire. La rétractation ne retire que ce qui a été acheté avec ce paiement — le plan et la période dont vous disposiez auparavant sont rétablis.',
    formTitle: 'Modèle de formulaire de rétractation',
    form:
      'À l’attention de : Carbon Stealth VCC, ul. Samuil 3, 2670 Bobov Dol, Bulgarie, info@carbonstealth.eu. Je vous notifie par la présente ma rétractation du contrat pour la prestation de services ci-dessous : … / Commandé le : … / Nom : … / Adresse : … / E-mail du compte : … / Signature (uniquement en cas de notification du présent formulaire sur papier) / Date : …',
    terms: 'Conditions d’utilisation',
    orderRef: 'Numéro de commande',
    withdrawButton: (d, u) =>
      `Vous pouvez également vous rétracter avec le bouton « Renoncer au contrat ici » dans votre <a href="${u}" style="color:#3b82c4">tableau de bord</a> (section « Plan ») jusqu’au ${d} inclus.`,
  },
};

const esc = (value: string) =>
  value.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;

export function planConfirmationEmail(input: {
  locale: string;
  name: string | null;
  plan: string;
  interval: string;
  amountCents: number;
  vatCents: number;
  vatRateBp: number;
  paidUntil: Date | null;
  orderRef: string;
  termsUrl: string;
  /** Последният ден на срока за отказ и адресът на таблото (бутонът за отказ). */
  withdrawUntil?: Date;
  dashboardUrl?: string;
}): { subject: string; html: string } {
  const s = STRINGS[input.locale] ?? STRINGS.en;
  const lang = STRINGS[input.locale] ? input.locale : 'en';
  const plan = PLAN_NAMES[input.plan] ?? input.plan;
  const rate = `${input.vatRateBp / 100}%`;
  const until = input.paidUntil
    ? s.paidUntil(new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(input.paidUntil))
    : s.forever;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <h1 style="font-size:20px">Linketto</h1>
  <p>${esc(s.hello(input.name))}</p>
  <p>${s.intro}</p>
  <p style="line-height:1.7">${s.planLabel}: <strong>${plan}</strong><br>${s.periodLabel}: ${s.periods[input.interval] ?? esc(input.interval)}<br>${until}<br>${s.total(eur(input.amountCents), eur(input.vatCents), rate)}<br>${s.orderRef}: ${esc(input.orderRef)}</p>
  <p>${s.noAuto}</p>
  <h2 style="font-size:16px;margin-top:24px">${s.withdrawalTitle}</h2>
  <p style="font-size:14px;line-height:1.6">${s.withdrawal}</p>
  ${
    s.withdrawButton && input.withdrawUntil && input.dashboardUrl
      ? `<p style="font-size:14px;line-height:1.6">${s.withdrawButton(
          new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(input.withdrawUntil),
          esc(input.dashboardUrl),
        )}</p>`
      : ''
  }
  <p style="font-size:13px;color:#475569"><strong>${s.formTitle}</strong><br>${s.form}</p>
  <p><a href="${esc(input.termsUrl)}" style="color:#3b82c4;font-weight:600">${s.terms} →</a></p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#64748b;font-size:12px">${s.seller}: ${SELLER}</p>
</div>`;
  return { subject: s.subject(plan), html };
}
