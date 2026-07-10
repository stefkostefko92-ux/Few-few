// Еднократни корекции по dataset-а след правния/преводния одит (2026-07-10):
// точни политики (без несъществуващи GA/Stripe), пълни GDPR реквизити, нови ui
// ключове, типография BG, footer правни линкове, премахване на /test/.
// Идемпотентен — повторно пускане не променя нищо.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const COPIES = ['../data', '../public/data'];

/** Заменя text на блок, разпознат по начало на текста. */
function replaceBlock(blocks, startsWith, text) {
  const b = blocks.find((x) => (x.text || '').startsWith(startsWith));
  if (b) b.text = text;
  return !!b;
}
function removeBlock(blocks, startsWith) {
  const i = blocks.findIndex((x) => (x.text || '').startsWith(startsWith));
  if (i >= 0) blocks.splice(i, 1);
  return i >= 0;
}

const UI_ADD = {
  it: {
    nav_menu: 'Menu',
    nf_text: 'Pagina non trovata',
    form_error: 'Errore di invio — scrivici direttamente a',
    skip_link: 'Vai al contenuto',
  },
  en: {
    nav_menu: 'Menu',
    nf_text: 'Page not found',
    form_error: 'Sending failed — email us directly at',
    skip_link: 'Skip to content',
  },
  bg: {
    nav_menu: 'Меню',
    nf_text: 'Страницата не е намерена',
    form_error: 'Грешка при изпращане — пишете ни директно на',
    skip_link: 'Към съдържанието',
  },
};

const PRIVACY = {
  it: {
    collect: [
      'Raccogliamo: dati di contatto',
      'Raccogliamo: dati di contatto (nome, email, telefono) dai moduli; dati tecnici di base dai log del server (indirizzo IP, browser). Non utilizziamo cookie di profilazione né strumenti di analytics.',
    ],
    statsLi: 'Analisi statistiche anonime',
    share: [
      'Non vendiamo dati.',
      "Non vendiamo dati. Condividiamo solo con: hosting nell'UE (Hetzner, Germania) e, ove necessario per il progetto, fornitori vincolati da contratto ai sensi dell'Art. 28 GDPR.",
    ],
    retention: [
      'Conserviamo i dati',
      'Moduli di contatto: fino a 12 mesi dalla richiesta. Dati contrattuali e fiscali: secondo gli obblighi di legge. Log tecnici del server: fino a 30 giorni.',
    ],
    rights: [
      'Hai diritto di:',
      "Hai diritto di: accesso, rettifica, cancellazione, limitazione, opposizione, portabilità. Puoi revocare il consenso in qualsiasi momento (Art. 7(3) GDPR) e presentare reclamo a un'autorità di controllo — la CPDP in Bulgaria (cpdp.bg) o il Garante per la protezione dei dati personali in Italia. Scrivi a info@carbonstealth.eu — rispondiamo entro 30 giorni. Non effettuiamo processi decisionali automatizzati né profilazione (Art. 22); non è nominato un DPO.",
    ],
    transfers: [
      'Dati nel SEE.',
      "I dati risiedono su server nell'UE/SEE. Non trasferiamo dati verso paesi terzi; qualora fosse necessario, applicheremo una decisione di adeguatezza o le clausole contrattuali standard.",
    ],
  },
  en: {
    collect: [
      'We collect: contact data',
      'We collect: contact data (name, email, phone) from forms; basic technical data from server logs (IP address, browser). We do not use profiling cookies or analytics tools.',
    ],
    statsLi: 'Anonymous statistical analysis',
    share: [
      'We never sell your data.',
      'We never sell your data. We share only with: EU hosting (Hetzner, Germany) and, where a project requires it, providers bound by contract under Art. 28 GDPR.',
    ],
    retention: [
      'We retain personal data',
      'Contact form data: up to 12 months from the enquiry. Contractual and tax data: as required by law. Technical server logs: up to 30 days.',
    ],
    rights: [
      'You have the right to:',
      'You have the right to: access, rectification, erasure, restriction, objection, portability. You may withdraw consent at any time (Art. 7(3) GDPR) and lodge a complaint with a supervisory authority — the CPDP in Bulgaria (cpdp.bg) or the Italian Garante. Contact info@carbonstealth.eu — we reply within 30 days. We do not carry out automated decision-making or profiling (Art. 22); no DPO has been appointed.',
    ],
    transfers: [
      'Data within the EEA.',
      'Data resides on servers in the EU/EEA. We do not transfer data to third countries; should it ever be necessary, we will rely on an adequacy decision or standard contractual clauses.',
    ],
  },
  bg: {
    collect: [
      'Събираме: данни за контакт',
      'Събираме: данни за контакт (име, имейл, телефон) от формите; основни технически данни от сървърните логове (IP адрес, браузър). Не използваме профилиращи бисквитки или инструменти за аналитика.',
    ],
    statsLi: 'Анонимен статистически анализ',
    share: [
      'Не продаваме данни.',
      'Не продаваме данни. Споделяме само с: хостинг в ЕС (Hetzner, Германия) и, когато проектът го изисква, доставчици, обвързани с договор по чл. 28 от GDPR.',
    ],
    retention: [
      'Съхраняваме данни',
      'Данни от контактната форма: до 12 месеца от запитването. Договорни и данъчни данни: според законовите срокове. Технически сървърни логове: до 30 дни.',
    ],
    rights: [
      'Имате право на:',
      'Имате право на: достъп, корекция, изтриване, ограничаване, възражение, преносимост. Можете да оттеглите съгласието си по всяко време (чл. 7(3) GDPR) и да подадете жалба до надзорен орган — КЗЛД в България (cpdp.bg) или италианския Garante. Пишете на info@carbonstealth.eu — отговаряме до 30 дни. Не извършваме автоматизирано вземане на решения или профилиране (чл. 22); не е назначено ДЛЗД.',
    ],
    transfers: null, // BG няма секция „Трансфери" — добавя се по-долу
  },
};

const COOKIE = {
  it: {
    analytics: [
      'Cookie analitici:',
      'Cookie analitici o di marketing: non ne utilizziamo.',
    ],
    functional: [
      'Cookie funzionali:',
      'Preferenze funzionali (lingua, consenso): salvate in localStorage sul tuo dispositivo. Durata: fino a 12 mesi.',
    ],
    thirdParty: [
      'Google Analytics',
      'Attualmente non utilizziamo servizi di terze parti che impostano cookie: niente analytics esterni, niente pagamenti incorporati; i font sono ospitati localmente.',
    ],
    consent: [
      'Navigando il nostro sito',
      'I cookie tecnici non richiedono consenso. Eventuali cookie non essenziali verranno attivati solo dopo il tuo consenso esplicito tramite il banner (puoi rifiutare con pari facilità).',
    ],
  },
  en: {
    analytics: ['Analytics cookies:', 'Analytics or marketing cookies: we do not use any.'],
    functional: [
      'Functional cookies:',
      'Functional preferences (language, consent): stored in localStorage on your device. Duration: up to 12 months.',
    ],
    thirdParty: [
      'Google Analytics',
      'We currently use no third-party services that set cookies: no external analytics, no embedded payments; fonts are self-hosted.',
    ],
    consent: [
      'By browsing our site',
      'Technical cookies require no consent. Any non-essential cookies will only be activated after your explicit consent via the banner (refusing is just as easy).',
    ],
  },
  bg: {
    analytics: ['Аналитични:', 'Аналитични или маркетингови бисквитки: не използваме такива.'],
    functional: [
      'Функционални:',
      'Функционални предпочитания (език, съгласие): съхраняват се в localStorage на вашето устройство. Срок: до 12 месеца.',
    ],
    thirdParty: [
      'Google Analytics',
      'В момента не използваме услуги на трети страни, които поставят бисквитки: без външна аналитика, без вградени плащания; шрифтовете са локално хоствани.',
    ],
    consent: null, // BG няма секция „Съгласие"
  },
};

for (const copy of COPIES) {
  for (const lang of ['it', 'en', 'bg']) {
    const file = path.join(ROOT, copy, `content.${lang}.json`);
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    const log = [];

    // 1. Нови ui ключове
    for (const [k, v] of Object.entries(UI_ADD[lang])) {
      if (c.ui[k] !== v) { c.ui[k] = v; log.push(`ui.${k}`); }
    }

    // 2. Типография (само BG)
    if (lang === 'bg') {
      if (c.ui.form_name === 'Име и Фамилия') { c.ui.form_name = 'Име и фамилия'; log.push('form_name'); }
      if (c.ui.cookie_more === 'Политика за Бисквитки') { c.ui.cookie_more = 'Политика за бисквитки'; log.push('cookie_more'); }
      if (c.ui.about_scroll?.includes('РЕШЕНИЯ КОИТО')) {
        c.ui.about_scroll = c.ui.about_scroll.replace('РЕШЕНИЯ КОИТО', 'РЕШЕНИЯ, КОИТО');
        log.push('about_scroll');
      }
    }

    // 3. Footer правни линкове: без езиков префикс (Footer го добавя) + верни слъгове
    for (const l of c.footer.legal) {
      if (l.href?.startsWith(`/${lang}/`)) l.href = l.href.slice(lang.length + 1);
    }
    const terms = c.footer.legal.find((l) => l.href === '/termini/');
    if (terms && lang === 'en') { terms.href = '/terms/'; log.push('terms href'); }
    if (terms && lang === 'bg') { terms.href = '/usloviya/'; log.push('usloviya href'); }
    // Същото за company/services колоните, ако носят префикс
    for (const col of ['company', 'services']) {
      for (const l of c.footer[col] ?? []) {
        if (l.href?.startsWith(`/${lang}/`)) l.href = l.href.slice(lang.length + 1);
      }
    }

    // 4. Премахване на незавършената /test/ страница
    const testKey = Object.keys(c.pages).find((k) => k === 'test' || k.endsWith('/test'));
    if (testKey) { delete c.pages[testKey]; log.push('pages.test изтрит'); }

    // 5. Privacy — точност + пълни чл. 13 реквизити
    const privKey = Object.keys(c.pages).find((k) => k.endsWith('privacy'));
    const priv = c.pages[privKey].visibleBlocks;
    const P = PRIVACY[lang];
    replaceBlock(priv, P.collect[0], P.collect[1]) && log.push('priv.collect');
    removeBlock(priv, P.statsLi) && log.push('priv.stats li');
    replaceBlock(priv, P.share[0], P.share[1]) && log.push('priv.share');
    replaceBlock(priv, P.retention[0], P.retention[1]) && log.push('priv.retention');
    replaceBlock(priv, P.rights[0], P.rights[1]) && log.push('priv.rights');
    if (P.transfers) {
      replaceBlock(priv, P.transfers[0], P.transfers[1]) && log.push('priv.transfers');
    } else {
      // BG: добавяне на липсващата секция „Трансфери" преди „Контакти"
      const idx = priv.findIndex((b) => (b.text || '').includes('Контакти'));
      if (idx >= 0 && !priv.some((b) => (b.text || '').startsWith('Данните се съхраняват на сървъри'))) {
        priv[idx].text = '9. Контакти';
        priv.splice(idx, 0,
          { tag: 'h2', text: '8. Трансфери' },
          { tag: 'p', text: 'Данните се съхраняват на сървъри в ЕС/ЕИП. Не прехвърляме данни към трети държави; при необходимост ще приложим решение за адекватност или стандартни договорни клаузи.' },
        );
        log.push('priv.transfers (нова секция)');
      }
    }

    // 6. Cookie — реалните бисквитки, без implied consent
    const ckKey = Object.keys(c.pages).find((k) => k.endsWith('cookie'));
    const ck = c.pages[ckKey].visibleBlocks;
    const K = COOKIE[lang];
    replaceBlock(ck, K.analytics[0], K.analytics[1]) && log.push('ck.analytics');
    replaceBlock(ck, K.functional[0], K.functional[1]) && log.push('ck.functional');
    replaceBlock(ck, K.thirdParty[0], K.thirdParty[1]) && log.push('ck.thirdParty');
    if (K.consent) replaceBlock(ck, K.consent[0], K.consent[1]) && log.push('ck.consent');

    fs.writeFileSync(file, JSON.stringify(c, null, 2) + '\n');
    console.log(`${copy}/content.${lang}.json: ${log.join(', ') || 'без промени'}`);
  }
}
console.log('OK');
