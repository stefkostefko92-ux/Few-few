// Лек двуезичен слой (български / английски) за спешно-критичните екрани.
// Изборът се пази в бисквитка `lang`; може да се сменя с ?lang=bg|en.
export const LANGS = ['bg', 'en'];
export const DEFAULT_LANG = 'bg';

const DICT = {
  // Навигация / общи
  'nav.profile': { bg: 'Моят профил', en: 'My profile' },
  'nav.login': { bg: 'Вход', en: 'Log in' },
  'nav.register': { bg: 'Регистрация', en: 'Sign up' },
  'nav.logout': { bg: 'Изход', en: 'Log out' },
  'common.back_home': { bg: 'Към началото', en: 'Back to home' },
  'lang.bg': { bg: 'БГ', en: 'BG' },
  'lang.en': { bg: 'EN', en: 'EN' },
  'lang.switch': { bg: 'Език', en: 'Language' },

  // Начало (hero)
  'home.badge': { bg: 'Криптирано · GDPR · хостинг в ЕС', en: 'Encrypted · GDPR · EU hosting' },
  'home.h1a': { bg: 'Животоспасяваща информация', en: 'Life-saving information' },
  'home.h1b': { bg: 'на едно сканиране', en: 'one scan away' },
  'home.lead': {
    bg: 'MedQR създава защитен спешен медицински профил, който носите със себе си като QR код. При злополука спешен екип сканира кода и веднага вижда кръвна група, алергии, заболявания и контакт на близък — дори ако не можете да говорите.',
    en: 'MedQR creates a secure emergency medical profile you carry as a QR code. In an emergency, responders scan it and instantly see blood type, allergies, conditions and a next-of-kin contact — even if you cannot speak.',
  },
  'home.cta_register': { bg: 'Създай профил безплатно', en: 'Create a free profile' },
  'home.cta_login': { bg: 'Вход', en: 'Log in' },

  // Спешен изглед
  'emerg.banner': { bg: 'СПЕШНА МЕДИЦИНСКА ИНФОРМАЦИЯ', en: 'EMERGENCY MEDICAL INFORMATION' },
  'emerg.comm_warn': {
    bg: 'Това лице може да не чува и/или да не говори — общувайте писмено.',
    en: 'This person may be unable to hear and/or speak — communicate in writing.',
  },
  'emerg.hearing': { bg: 'Слух', en: 'Hearing' },
  'emerg.speech': { bg: 'Говор', en: 'Speech' },
  'emerg.sign': { bg: 'Жестов език', en: 'Sign language' },
  'emerg.prefers': { bg: 'Предпочита', en: 'Prefers' },
  'emerg.interpreter': {
    bg: 'Жестов преводач / релейна услуга',
    en: 'Sign-language interpreter / relay service',
  },
  'emerg.open_comm': {
    bg: 'Отвори общуване (за нечуващ/неговорещ човек)',
    en: 'Open communication (for a deaf/non-speaking person)',
  },
  'emerg.ready_phrases': {
    bg: 'Готови изречения (работят и без интернет)',
    en: 'Ready phrases (work offline too)',
  },
  'emerg.blood': { bg: 'Кръвна група', en: 'Blood type' },
  'emerg.blood_unknown': { bg: 'Неизвестна', en: 'Unknown' },
  'emerg.allergies': { bg: 'Алергии към лекарства', en: 'Drug allergies' },
  'emerg.allergies_none': { bg: 'Не са посочени', en: 'None listed' },
  'emerg.conditions': { bg: 'Хронични заболявания', en: 'Chronic conditions' },
  'emerg.meds': { bg: 'Текущи медикаменти', en: 'Current medications' },
  'emerg.notes': { bg: 'Друга важна информация', en: 'Other important information' },
  'emerg.dob': { bg: 'Дата на раждане', en: 'Date of birth' },
  'emerg.language': { bg: 'Език', en: 'Language' },
  'emerg.contact': { bg: 'Спешен контакт', en: 'Emergency contact' },
  'emerg.call': { bg: 'Обади се', en: 'Call' },
  'emerg.notified': {
    bg: 'Близък контакт е автоматично уведомен, че този профил е отворен.',
    en: 'A next-of-kin contact has been automatically notified that this profile was opened.',
  },
  'emerg.share_location': {
    bg: 'Сподели местоположението с близкия',
    en: 'Share location with the contact',
  },
  'emerg.updated': { bg: 'Актуализирано', en: 'Updated' },
  'emerg.logged': { bg: 'Достъпът е регистриран.', en: 'This access has been logged.' },

  // Помощник за общуване
  'comm.title': { bg: 'Общуване', en: 'Communication' },
  'comm.close': { bg: 'Затвори', en: 'Close' },
  'comm.stage_default': {
    bg: 'Докоснете изречение или напишете съобщение. Натиснете „Прочети на глас“, за да го озвучите.',
    en: 'Tap a phrase or type a message. Press “Read aloud” to speak it.',
  },
  'comm.write_h': { bg: 'Напишете — и прочетете на глас', en: 'Type — and read aloud' },
  'comm.write_ph': {
    bg: 'Напишете тук. Това дава „глас“ на човек, който не може да говори.',
    en: 'Type here. This gives a “voice” to someone who cannot speak.',
  },
  'comm.read_aloud': { bg: 'Прочети на глас', en: 'Read aloud' },
  'comm.show_big': { bg: 'Покажи едро', en: 'Show large' },
  'comm.clear': { bg: 'Изчисти', en: 'Clear' },
  'comm.patient_h': { bg: 'Бързи отговори (от пациента)', en: 'Quick answers (from the patient)' },
  'comm.team_h': { bg: 'Въпроси (от екипа)', en: 'Questions (from the team)' },
  'comm.body_h': {
    bg: 'Къде боли? Докоснете върху тялото',
    en: 'Where does it hurt? Tap on the body',
  },
  'comm.pain_h': { bg: 'Колко силна е болката? (0–10)', en: 'How strong is the pain? (0–10)' },

  // Бързи отговори / въпроси
  'p.yes': { bg: 'ДА', en: 'YES' },
  'p.no': { bg: 'НЕ', en: 'NO' },
  'p.dont_understand': { bg: 'Не разбирам.', en: 'I do not understand.' },
  'p.it_hurts': { bg: 'Боли ме.', en: 'I am in pain.' },
  'p.need_meds': { bg: 'Имам нужда от лекарството си.', en: 'I need my medication.' },
  'p.need_meds_s': { bg: 'Нужно ми е лекарството', en: 'I need my medication' },
  'p.call_contact': { bg: 'Моля, обадете се на моя близък.', en: 'Please call my next of kin.' },
  'p.call_contact_s': { bg: 'Обадете се на близкия ми', en: 'Call my contact' },
  'p.call_interpreter': {
    bg: 'Моля, извикайте жестов преводач.',
    en: 'Please call a sign-language interpreter.',
  },
  'p.call_interpreter_s': { bg: 'Извикайте преводач', en: 'Call an interpreter' },
  'p.cant_hear': { bg: 'Не чувам. Моля, пишете ми.', en: 'I cannot hear. Please write to me.' },
  'p.cant_hear_s': { bg: 'Не чувам — пишете', en: 'Can’t hear — write' },
  'p.here_to_help': {
    bg: 'Тук съм, за да помогна. Ще пиша, за да общуваме.',
    en: 'I am here to help. I will write so we can communicate.',
  },
  'p.here_to_help_s': { bg: 'Тук съм да помогна', en: 'Here to help' },
  'p.where_hurts': {
    bg: 'Боли ли ви някъде? Покажете къде.',
    en: 'Are you in pain anywhere? Show me where.',
  },
  'p.where_hurts_s': { bg: 'Боли ли ви?', en: 'In pain?' },
  'p.meds_allergies': {
    bg: 'Приемате ли лекарства? Имате ли алергии?',
    en: 'Do you take medication? Any allergies?',
  },
  'p.meds_allergies_s': { bg: 'Лекарства? Алергии?', en: 'Meds? Allergies?' },
  'p.call_relative_q': {
    bg: 'Да се обадя ли на ваш близък?',
    en: 'Shall I call a relative for you?',
  },
  'p.call_relative_q_s': { bg: 'Да звънна ли на близък?', en: 'Call a relative?' },
  'p.ambulance': {
    bg: 'Линейката идва. Останете спокойни.',
    en: 'The ambulance is coming. Stay calm.',
  },
  'p.ambulance_s': { bg: 'Линейката идва', en: 'Ambulance coming' },
  'p.pain_head': { bg: 'Боли ме главата.', en: 'My head hurts.' },
  'p.pain_chest': { bg: 'Боли ме в гърдите.', en: 'My chest hurts.' },
  'p.pain_abdomen': { bg: 'Боли ме коремът.', en: 'My abdomen hurts.' },
  'p.pain_arm': { bg: 'Боли ме ръката.', en: 'My arm hurts.' },
  'p.pain_leg': { bg: 'Боли ме кракът.', en: 'My leg hurts.' },
  'p.pain_back': { bg: 'Боли ме гърбът.', en: 'My back hurts.' },
  'p.pain_all': { bg: 'Боли ме навсякъде.', en: 'It hurts everywhere.' },
  'p.region_back': { bg: 'Гръб', en: 'Back' },
  'p.region_all': { bg: 'Навсякъде', en: 'Everywhere' },
  'bm.head': { bg: 'Глава', en: 'Head' },
  'bm.chest': { bg: 'Гърди', en: 'Chest' },
  'bm.abdomen': { bg: 'Корем', en: 'Abdomen' },
  'bm.arm_l': { bg: 'Лява ръка', en: 'Left arm' },
  'bm.arm_r': { bg: 'Дясна ръка', en: 'Right arm' },
  'bm.leg_l': { bg: 'Ляв крак', en: 'Left leg' },
  'bm.leg_r': { bg: 'Десен крак', en: 'Right leg' },
  'pain.scale': { bg: 'Болка: {n} от 10.', en: 'Pain: {n} out of 10.' },

  // SOS
  'sos.title': { bg: 'Спешна помощ', en: 'Emergency help' },
  'sos.bystander': {
    bg: 'Имам спешен медицински проблем и не чувам/не говоря. Моля, обадете се на 112 за мен.',
    en: 'I have a medical emergency and cannot hear/speak. Please call 112 for me.',
  },
  'sos.i_am': { bg: 'Аз съм', en: 'I am' },
  'sos.call112': { bg: 'Обадете се на 112', en: 'Call 112' },
  'sos.alarm': {
    bg: 'Сирена + мигане (привлечи внимание)',
    en: 'Siren + flashing (attract attention)',
  },
  'sos.alarm_stop': { bg: 'Спри сирената', en: 'Stop the siren' },
  'sos.people': {
    bg: 'SOS до близките ми (SMS + локация)',
    en: 'SOS to my contacts (SMS + location)',
  },
  'sos.note': {
    bg: 'MedQR не е заместител на 112 — това е помощно средство. Съвет: добави тази страница на началния екран на телефона за достъп с едно докосване.',
    en: 'MedQR is not a substitute for 112 — it is an aid. Tip: add this page to your phone’s home screen for one-tap access.',
  },
  'sos.back': { bg: 'Назад към профила', en: 'Back to profile' },
  'sos.locating': { bg: 'Определяне на местоположението…', en: 'Locating…' },
  'sos.sent': {
    bg: 'Сигналът е изпратен до близките ти.',
    en: 'The alert was sent to your contacts.',
  },

  // Офлайн
  'offline.banner': {
    bg: 'Офлайн режим — показва се запазено копие.',
    en: 'Offline — showing a saved copy.',
  },

  // Footer
  'foot.privacy': { bg: 'Политика за поверителност', en: 'Privacy policy' },
  'foot.cookies': { bg: 'Бисквитки', en: 'Cookies' },
  'foot.terms': { bg: 'Общи условия', en: 'Terms of use' },
  'foot.disclaimer': {
    bg: 'MedQR не е медицинско изделие и не замества професионална медицинска оценка. Данните са специална категория лични данни (чл. 9 GDPR).',
    en: 'MedQR is not a medical device and does not replace professional medical assessment. The data is a special category of personal data (GDPR Art. 9).',
  },
};

export function pickLang(req) {
  const q = req.query && req.query.lang;
  if (q && LANGS.includes(q)) return q;
  const c = req.cookies && req.cookies.lang;
  if (c && LANGS.includes(c)) return c;
  const al = String((req.headers && req.headers['accept-language']) || '').toLowerCase();
  if (al.startsWith('en')) return 'en';
  return DEFAULT_LANG;
}

export function makeT(lang) {
  return (key, vars) => {
    const entry = DICT[key];
    let out = entry ? (entry[lang] ?? entry.bg ?? key) : key;
    if (vars) for (const k of Object.keys(vars)) out = out.replace(`{${k}}`, vars[k]);
    return out;
  };
}
