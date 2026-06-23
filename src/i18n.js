// Лек двуезичен слой (български / английски) за спешно-критичните екрани.
// Изборът се пази в бисквитка `lang`; може да се сменя с ?lang=bg|en.
export const LANGS = ['bg', 'en'];
export const DEFAULT_LANG = 'bg';

// Превод на контролираните (избираеми) клинични стойности за показване на EN.
// Свободният текст (алергии, заболявания и т.н.) се оставя както е въведен.
const CLINICAL_EN = {
  'Без слухови проблеми': 'No hearing problems',
  'Намален слух': 'Reduced hearing',
  'Ползва слухов апарат': 'Uses a hearing aid',
  'Кохлеарен имплант': 'Cochlear implant',
  'Глух/а': 'Deaf',
  'Мога да говоря': 'Can speak',
  'Говоря ограничено': 'Speaks with difficulty',
  'Не мога да говоря': 'Cannot speak',
  'Български жестов език': 'Bulgarian Sign Language',
  'Международен жестов език': 'International Sign',
  'Не ползвам жестов език': 'Does not use sign language',
  'Не знам': 'Unknown',
};

// Връща EN етикет за известна клинична стойност; иначе оригинала (свободен текст).
export function clinicalLabel(value, lang) {
  if (lang === 'en' && value && CLINICAL_EN[value]) return CLINICAL_EN[value];
  return value;
}

const DICT = {
  // Навигация / общи
  'nav.profile': { bg: 'Моят профил', en: 'My profile' },
  'nav.login': { bg: 'Вход', en: 'Log in' },
  'nav.register': { bg: 'Регистрация', en: 'Sign up' },
  'nav.logout': { bg: 'Изход', en: 'Log out' },
  'common.back_home': { bg: 'Към началото', en: 'Back to home' },
  'common.skip': { bg: 'Прескочи към съдържанието', en: 'Skip to content' },
  'lang.bg': { bg: 'БГ', en: 'BG' },
  'lang.en': { bg: 'EN', en: 'EN' },
  'lang.switch': { bg: 'Език', en: 'Language' },
  'og.image_alt': {
    bg: 'MedQR — спешен медицински профил с QR код',
    en: 'MedQR — emergency medical profile with a QR code',
  },

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
  'home.how': { bg: 'Как работи', en: 'How it works' },
  'home.step1': {
    bg: 'Попълвате медицинския си профил за минути.',
    en: 'Fill in your medical profile in minutes.',
  },
  'home.step2': {
    bg: 'Получавате личен QR код — карта за портфейл, стикер или гривна.',
    en: 'Get a personal QR code — wallet card, sticker or bracelet.',
  },
  'home.step3': {
    bg: 'При спешност всеки телефон сканира кода и показва информацията.',
    en: 'In an emergency any phone scans the code and shows the information.',
  },
  'home.f1_h': { bg: 'Критична информация', en: 'Critical information' },
  'home.f1_p': {
    bg: 'Кръвна група, алергии към лекарства, хронични заболявания и текущи медикаменти.',
    en: 'Blood type, drug allergies, chronic conditions and current medications.',
  },
  'home.f2_h': { bg: 'Комуникационни нужди', en: 'Communication needs' },
  'home.f2_p': {
    bg: 'Профилът ясно отбелязва слухови затруднения и предпочитан начин за комуникация — така спешният екип знае да общува писмено или с жестов език.',
    en: 'The profile clearly flags hearing difficulties and the preferred way to communicate — so responders know to use writing or sign language.',
  },
  'home.f3_h': { bg: 'Максимална защита', en: 'Maximum protection' },
  'home.f3_p': {
    bg: 'Данните се криптират, връзката е защитена, достъпът се записва. Незадължителен PIN, двуфакторна автентикация и обезсилване на изгубен код.',
    en: 'Data is encrypted, the connection is secure, access is logged. Optional PIN, two-factor authentication and invalidation of a lost code.',
  },
  'home.f4_h': { bg: 'Носи го навсякъде', en: 'Carry it anywhere' },
  'home.f4_p': {
    bg: 'Отпечатайте карта за портфейл, стикер за телефона или гривна с QR кода.',
    en: 'Print a wallet card, a phone sticker or a bracelet with the QR code.',
  },
  'home.who_h': { bg: 'За кого е полезно', en: 'Who it helps' },
  'home.who_p': {
    bg: 'Хора със слухови затруднения · диабет, епилепсия, сърдечни и алергични състояния · възрастни хора · мотористи, спортисти и туристи · родители, които правят профил на дете.',
    en: 'People with hearing difficulties · diabetes, epilepsy, heart and allergic conditions · older adults · riders, athletes and travellers · parents creating a profile for a child.',
  },
  'home.start': { bg: 'Започни сега', en: 'Get started' },
  'home.faq_h': { bg: 'Често задавани въпроси', en: 'Frequently asked questions' },
  'faq.q1': { bg: 'Какво е MedQR?', en: 'What is MedQR?' },
  'faq.a1': {
    bg: 'MedQR е защитен спешен медицински профил, който носите със себе си като QR код. При злополука спешен екип сканира кода и веднага вижда кръвната ви група, алергии към лекарства, хронични заболявания, медикаменти и контакт на близък.',
    en: 'MedQR is a secure emergency medical profile you carry as a QR code. In an emergency, responders scan it and immediately see your blood type, drug allergies, chronic conditions, medications and a next-of-kin contact.',
  },
  'faq.q2': {
    bg: 'Как работи QR кодът при спешност?',
    en: 'How does the QR code work in an emergency?',
  },
  'faq.a2': {
    bg: 'QR кодът сочи към защитена страница с вашата спешна информация. Всеки телефон може да го сканира — не е нужно специално приложение. Профилът се показва само за четене, а всеки достъп се записва.',
    en: 'The QR code points to a secure page with your emergency information. Any phone can scan it — no special app needed. The profile is shown read-only and every access is logged.',
  },
  'faq.q3': { bg: 'Сигурни ли са медицинските ми данни?', en: 'Is my medical data secure?' },
  'faq.a3': {
    bg: 'Да. Чувствителните данни се криптират в покой (AES-256-GCM), връзката е по HTTPS, достъпът е чрез дълъг непредвидим токен, по избор защитен с PIN. Поддържа се и двуфакторна автентикация. Можете да обезсилите изгубен код с един бутон.',
    en: 'Yes. Sensitive data is encrypted at rest (AES-256-GCM), the connection is over HTTPS, access is via a long unpredictable token, optionally protected by a PIN. Two-factor authentication is supported. You can invalidate a lost code with one button.',
  },
  'faq.q4': { bg: 'Кой може да види данните ми?', en: 'Who can see my data?' },
  'faq.a4': {
    bg: 'Само човек, който сканира вашия QR код (например спешен екип). За по-чувствителни профили можете да добавите PIN. Не продаваме данни и не ги споделяме с трети страни.',
    en: 'Only someone who scans your QR code (e.g. a responder). For more sensitive profiles you can add a PIN. We do not sell data or share it with third parties.',
  },
  'faq.q5': { bg: 'Спазва ли MedQR GDPR?', en: 'Is MedQR GDPR-compliant?' },
  'faq.a5': {
    bg: 'Да. Обработката се основава на вашето изрично съгласие, а в спешност — на жизненоважни интереси (чл. 9 GDPR). Можете да изтеглите данните си и да изтриете профила си по всяко време. Хостингът е в ЕС (Hetzner, Германия).',
    en: 'Yes. Processing is based on your explicit consent and, in an emergency, on vital interests (GDPR Art. 9). You can download your data and delete your account at any time. Hosting is in the EU (Hetzner, Germany).',
  },
  'faq.q6': { bg: 'MedQR медицинско изделие ли е?', en: 'Is MedQR a medical device?' },
  'faq.a6': {
    bg: 'Не. MedQR е информационна услуга и не замества професионална медицинска оценка, диагноза или лечение.',
    en: 'No. MedQR is an informational service and does not replace professional medical assessment, diagnosis or treatment.',
  },

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

  // Вход / регистрация / акаунт
  'auth.login_title': { bg: 'Вход', en: 'Log in' },
  'auth.email': { bg: 'Имейл', en: 'Email' },
  'auth.password': { bg: 'Парола', en: 'Password' },
  'auth.password_min': { bg: 'Парола (минимум 10 символа)', en: 'Password (min 10 characters)' },
  'auth.remember': {
    bg: 'Остани вписан на това устройство (не искай парола следващия път)',
    en: 'Stay signed in on this device (don’t ask for a password next time)',
  },
  'auth.or': { bg: 'или', en: 'or' },
  'auth.passkey_login': { bg: 'Вход с паскей', en: 'Sign in with a passkey' },
  'auth.forgot_q': { bg: 'Забравена парола?', en: 'Forgot password?' },
  'auth.no_account': { bg: 'Нямате профил?', en: 'No account?' },
  'auth.register_link': { bg: 'Регистрация', en: 'Sign up' },
  'auth.register_title': { bg: 'Регистрация', en: 'Sign up' },
  'auth.full_name': { bg: 'Пълно име', en: 'Full name' },
  'auth.consent': {
    bg: 'Съгласявам се здравните ми данни да се обработват и да са достъпни чрез моя QR код в спешна ситуация, съгласно',
    en: 'I consent to my health data being processed and made accessible via my QR code in an emergency, in accordance with the',
  },
  'auth.consent_link': { bg: 'Политиката за поверителност', en: 'Privacy Policy' },
  'auth.create_btn': { bg: 'Създай профил', en: 'Create profile' },
  'auth.have_account': { bg: 'Вече имате профил?', en: 'Already have an account?' },
  'auth.forgot_title': { bg: 'Забравена парола', en: 'Forgot password' },
  'auth.forgot_sent': {
    bg: 'Ако този имейл съществува в системата, изпратихме линк за нулиране на паролата. Проверете пощата си (валиден 60 минути).',
    en: 'If this email exists in the system, we have sent a password reset link. Check your inbox (valid for 60 minutes).',
  },
  'auth.to_login': { bg: 'Към вход', en: 'To log in' },
  'auth.forgot_intro': {
    bg: 'Въведете имейла си и ще ви изпратим линк за задаване на нова парола.',
    en: 'Enter your email and we will send you a link to set a new password.',
  },
  'auth.send_link': { bg: 'Изпрати линк', en: 'Send link' },
  'auth.back_login': { bg: 'Назад към вход', en: 'Back to log in' },
  'auth.reset_title': { bg: 'Задайте нова парола', en: 'Set a new password' },
  'auth.new_password': {
    bg: 'Нова парола (минимум 10 символа)',
    en: 'New password (min 10 characters)',
  },
  'auth.repeat_password': { bg: 'Повторете паролата', en: 'Repeat password' },
  'auth.save_password': { bg: 'Запази новата парола', en: 'Save new password' },
  'auth.delete_title': { bg: 'Изтриване на профил', en: 'Delete account' },
  'auth.delete_warn': {
    bg: 'Това ще изтрие окончателно вашия акаунт, медицинския профил, QR кода и журнала на достъпите. Действието е необратимо и оттегля съгласието ви за обработка на данните.',
    en: 'This will permanently delete your account, medical profile, QR code and access log. The action is irreversible and withdraws your consent to data processing.',
  },
  'auth.delete_confirm_js': {
    bg: 'Сигурни ли сте? Това НЕ може да бъде отменено.',
    en: 'Are you sure? This CANNOT be undone.',
  },
  'auth.delete_confirm_pw': { bg: 'Потвърдете с паролата си', en: 'Confirm with your password' },
  'auth.delete_btn': { bg: 'Изтрий профила окончателно', en: 'Delete account permanently' },
  'auth.cancel': { bg: 'Откажи', en: 'Cancel' },

  // Табло
  'dash.title': { bg: 'Моят спешен профил', en: 'My emergency profile' },
  'dash.saved': { bg: 'Промените са запазени.', en: 'Changes saved.' },
  'dash.unverified': { bg: 'Имейлът ви не е потвърден.', en: 'Your email is not verified.' },
  'dash.resend': { bg: 'Изпрати нов линк за потвърждение', en: 'Send a new verification link' },
  'dash.allergies': { bg: 'Алергии (лекарства)', en: 'Allergies (drugs)' },
  'dash.hearing': { bg: 'Слухов статус', en: 'Hearing status' },
  'dash.communication': { bg: 'Комуникация', en: 'Communication' },
  'dash.edit_data': { bg: 'Редактирай данните', en: 'Edit details' },
  'dash.sos_sub': {
    bg: 'Екран за минувач с обаждане до 112, сирена за внимание и сигнал до близките с локация.',
    en: 'Bystander screen with a one-tap 112 call, attention siren and an alert to your contacts with location.',
  },
  'dash.qr_title': { bg: 'Вашият QR етикет', en: 'Your QR label' },
  'dash.qr_note': {
    bg: 'Етикетът винаги показва, че това са спешни медицински данни.',
    en: 'The label always states that this is emergency medical data.',
  },
  'dash.size': { bg: 'Размер', en: 'Size' },
  'size.sticker': { bg: 'Стикер', en: 'Sticker' },
  'size.small': { bg: 'Малък', en: 'Small' },
  'size.medium': { bg: 'Среден', en: 'Medium' },
  'size.large': { bg: 'Голям', en: 'Large' },
  'size.poster': { bg: 'Постер', en: 'Poster' },
  'dash.dl_label': { bg: 'Изтегли етикет (SVG)', en: 'Download label (SVG)' },
  'dash.dl_qr': { bg: 'Само QR (PNG)', en: 'QR only (PNG)' },
  'dash.wallet_card': { bg: 'Карта за портфейл', en: 'Wallet card' },
  'dash.profile_url': { bg: 'Адрес на профила:', en: 'Profile address:' },
  'dash.nfc_title': { bg: 'NFC таг', en: 'NFC tag' },
  'dash.nfc_desc': {
    bg: 'Освен QR код можете да запишете профила и на NFC таг (стикер, карта или гривна). При допиране с телефон профилът се отваря автоматично — без камера и без приложение.',
    en: 'Besides a QR code you can write the profile to an NFC tag (sticker, card or bracelet). Tapping it with a phone opens the profile automatically — no camera, no app.',
  },
  'dash.nfc_write': { bg: 'Запиши на NFC таг', en: 'Write to NFC tag' },
  'dash.copy_url': { bg: 'Копирай адреса', en: 'Copy the address' },
  'dash.nfc_hint': {
    bg: 'Записът директно от браузъра работи на Android (Chrome). На други устройства копирайте адреса по-горе и го запишете с приложение за NFC, или поръчайте предварително програмиран таг.',
    en: 'Writing directly from the browser works on Android (Chrome). On other devices copy the address above and write it with an NFC app, or order a pre-programmed tag.',
  },
  'dash.security': { bg: 'Сигурност', en: 'Security' },
  'dash.pin_label': {
    bg: 'Незадължителен PIN (4–8 цифри) за допълнителна защита',
    en: 'Optional PIN (4–8 digits) for extra protection',
  },
  'dash.pin_save': { bg: 'Запази PIN', en: 'Save PIN' },
  'dash.pin_empty': { bg: 'Празно поле премахва PIN-а.', en: 'An empty field removes the PIN.' },
  'dash.twofa': { bg: 'Двуфакторна автентикация (2FA):', en: 'Two-factor authentication (2FA):' },
  'dash.on': { bg: 'включена', en: 'on' },
  'dash.off': { bg: 'изключена', en: 'off' },
  'dash.recovery_codes': { bg: 'резервни кодове:', en: 'recovery codes:' },
  'dash.setup_2fa': { bg: 'Настрой 2FA', en: 'Set up 2FA' },
  'dash.passkeys': { bg: 'Паскейове (passkeys):', en: 'Passkeys:' },
  'dash.passkeys_sub': {
    bg: 'вход без парола, устойчив на фишинг',
    en: 'passwordless, phishing-resistant sign-in',
  },
  'dash.manage': { bg: 'Управление', en: 'Manage' },
  'dash.biometric': { bg: 'Биометрично заключване:', en: 'Biometric lock:' },
  'dash.biometric_sub': {
    bg: 'Face ID / пръстов отпечатък при отваряне на приложението',
    en: 'Face ID / fingerprint when opening the app',
  },
  'dash.enable': { bg: 'Включи', en: 'Enable' },
  'dash.rotate': {
    bg: 'Издай нов QR код (обезсили стария)',
    en: 'Issue a new QR code (invalidate the old one)',
  },
  'dash.rotate_confirm': {
    bg: 'Това ще обезсили текущия QR код и всички разпечатани карти. Сигурни ли сте?',
    en: 'This will invalidate the current QR code and all printed cards. Are you sure?',
  },
  'dash.gdpr': { bg: 'Моите данни и права (GDPR)', en: 'My data and rights (GDPR)' },
  'dash.consent_at': { bg: 'Съгласие дадено на:', en: 'Consent given on:' },
  'dash.export': { bg: 'Изтегли данните ми (JSON)', en: 'Download my data (JSON)' },
  'dash.delete_me': { bg: 'Изтрий профила ми', en: 'Delete my account' },
  'dash.devices': { bg: 'Активни устройства', en: 'Active devices' },
  'dash.device': { bg: 'Устройство', en: 'Device' },
  'dash.ip': { bg: 'IP', en: 'IP' },
  'dash.last_seen': { bg: 'Последна активност', en: 'Last activity' },
  'dash.current': { bg: 'текущо', en: 'current' },
  'dash.revoke_others': {
    bg: 'Изход от всички други устройства',
    en: 'Sign out of all other devices',
  },
  'dash.revoke_confirm': {
    bg: 'Това ще прекрати всички сесии освен текущата. Продължавате ли?',
    en: 'This will end all sessions except the current one. Continue?',
  },
  'dash.access_log': { bg: 'Журнал на достъпите', en: 'Access log' },
  'dash.no_access': {
    bg: 'Все още няма сканирания на вашия код.',
    en: 'No scans of your code yet.',
  },
  'dash.when': { bg: 'Кога', en: 'When' },

  // Редакция на профил
  'edit.title': { bg: 'Редакция на медицински профил', en: 'Edit medical profile' },
  'edit.name_required': { bg: 'Името е задължително.', en: 'Name is required.' },
  'edit.identity': { bg: 'Самоличност', en: 'Identity' },
  'edit.full_name_req': { bg: 'Пълно име *', en: 'Full name *' },
  'edit.dob': { bg: 'Дата на раждане', en: 'Date of birth' },
  'edit.pref_lang': {
    bg: 'Предпочитан език за комуникация',
    en: 'Preferred communication language',
  },
  'edit.pref_lang_ph': { bg: 'напр. български', en: 'e.g. Bulgarian' },
  'edit.medical': { bg: 'Медицинска информация', en: 'Medical information' },
  'edit.blood': { bg: 'Кръвна група', en: 'Blood type' },
  'edit.choose': { bg: '— изберете —', en: '— choose —' },
  'edit.dont_know': { bg: 'Не знам', en: 'Unknown' },
  'edit.allergies': { bg: 'Алергии към лекарства', en: 'Drug allergies' },
  'edit.allergies_ph': { bg: 'напр. пеницилин, аспирин', en: 'e.g. penicillin, aspirin' },
  'edit.allergies_common': { bg: 'Чести алергии (изберете)', en: 'Common allergies (select)' },
  'edit.allergies_other': {
    bg: 'Други алергии (свободен текст)',
    en: 'Other allergies (free text)',
  },
  'edit.conditions_common': { bg: 'Чести състояния (изберете)', en: 'Common conditions (select)' },
  'edit.conditions_other': {
    bg: 'Други състояния (свободен текст)',
    en: 'Other conditions (free text)',
  },
  'edit.meds_hint': {
    bg: 'Съвет: пишете международни/генерични имена, за да се разчитат и в чужбина.',
    en: 'Tip: use international/generic names so responders abroad can read them.',
  },
  'edit.country': { bg: 'Държава на номера', en: 'Phone country' },
  'edit.conditions': { bg: 'Хронични заболявания / състояния', en: 'Chronic conditions' },
  'edit.conditions_ph': {
    bg: 'напр. диабет тип 1, епилепсия, астма',
    en: 'e.g. type 1 diabetes, epilepsy, asthma',
  },
  'edit.meds': { bg: 'Текущи медикаменти', en: 'Current medications' },
  'edit.meds_ph': { bg: 'напр. инсулин, антикоагуланти', en: 'e.g. insulin, anticoagulants' },
  'edit.notes': { bg: 'Друга важна информация', en: 'Other important information' },
  'edit.notes_ph': {
    bg: 'напр. пейсмейкър, бременност, донор на органи',
    en: 'e.g. pacemaker, pregnancy, organ donor',
  },
  'edit.hearing_comm': { bg: 'Слух и комуникация', en: 'Hearing and communication' },
  'edit.hearing': { bg: 'Слухов статус', en: 'Hearing status' },
  'edit.can_speak': { bg: 'Мога ли да говоря', en: 'Can I speak' },
  'edit.sign': { bg: 'Жестов език', en: 'Sign language' },
  'edit.comm_pref': { bg: 'Предпочитан начин на комуникация', en: 'Preferred way to communicate' },
  'edit.comm_pref_ph': {
    bg: 'напр. писмено, четене по устни, жестов език',
    en: 'e.g. in writing, lip-reading, sign language',
  },
  'edit.interpreter': {
    bg: 'Контакт на жестов преводач / релейна услуга (по избор)',
    en: 'Sign-language interpreter / relay contact (optional)',
  },
  'edit.interpreter_ph': {
    bg: 'напр. име и телефон на личен преводач',
    en: 'e.g. name and phone of a personal interpreter',
  },
  'edit.contact': { bg: 'Спешен контакт', en: 'Emergency contact' },
  'edit.contact_name': { bg: 'Име на близък', en: 'Contact name' },
  'edit.contact_phone': { bg: 'Телефон за връзка', en: 'Contact phone' },
  'edit.contact_relation': { bg: 'Роднинска връзка', en: 'Relationship' },
  'edit.contact_relation_ph': { bg: 'напр. съпруг, дъщеря', en: 'e.g. spouse, daughter' },
  'edit.contact_email': {
    bg: 'Имейл на близък (за известия)',
    en: 'Contact email (for notifications)',
  },
  'edit.notify': {
    bg: 'Уведоми близкия по имейл, когато някой отвори спешния ми профил (без медицински данни в имейла).',
    en: 'Notify the contact by email when someone opens my emergency profile (no medical data in the email).',
  },
  'edit.save': { bg: 'Запази', en: 'Save' },

  // Footer
  'foot.privacy': { bg: 'Политика за поверителност', en: 'Privacy policy' },
  'foot.cookies': { bg: 'Бисквитки', en: 'Cookies' },
  'foot.terms': { bg: 'Общи условия', en: 'Terms of use' },
  'foot.disclaimer': {
    bg: 'MedQR не е медицинско изделие и не замества професионална медицинска оценка. Данните са специална категория лични данни (чл. 9 GDPR).',
    en: 'MedQR is not a medical device and does not replace professional medical assessment. The data is a special category of personal data (GDPR Art. 9).',
  },

  // Двуфакторна автентикация
  'tfa.title': { bg: 'Двуфакторна автентикация (2FA)', en: 'Two-factor authentication (2FA)' },
  'tfa.enabled': { bg: '2FA е включена за вашия профил.', en: '2FA is enabled for your account.' },
  'tfa.recovery_avail': { bg: 'Налични резервни кодове:', en: 'Available recovery codes:' },
  'tfa.recovery_note': {
    bg: 'Те се ползват еднократно, ако нямате достъп до приложението за автентикация.',
    en: 'Each is single-use, for when you don’t have access to your authenticator app.',
  },
  'tfa.regen': { bg: 'Генерирай нови резервни кодове', en: 'Generate new recovery codes' },
  'tfa.regen_confirm': {
    bg: 'Това ще генерира нови кодове и ще обезсили старите. Продължавате ли?',
    en: 'This will generate new codes and invalidate the old ones. Continue?',
  },
  'tfa.disable_prompt': {
    bg: 'За да изключите 2FA, потвърдете с паролата си.',
    en: 'To disable 2FA, confirm with your password.',
  },
  'tfa.disable': { bg: 'Изключи 2FA', en: 'Disable 2FA' },
  'tfa.disable_confirm': {
    bg: 'Сигурни ли сте, че искате да изключите 2FA?',
    en: 'Are you sure you want to disable 2FA?',
  },
  'tfa.pending1': {
    bg: '1. Сканирайте кода с приложение за автентикация или въведете ключа ръчно.',
    en: '1. Scan the code with an authenticator app, or enter the key manually.',
  },
  'tfa.qr_alt': { bg: 'QR код за настройка на 2FA', en: 'QR code for 2FA setup' },
  'tfa.pending2': {
    bg: '2. Въведете генерирания 6-цифрен код, за да потвърдите.',
    en: '2. Enter the generated 6-digit code to confirm.',
  },
  'tfa.code': { bg: 'Код', en: 'Code' },
  'tfa.enable': { bg: 'Включи 2FA', en: 'Enable 2FA' },
  'tfa.intro': {
    bg: 'Добавете втори фактор при вход — еднократен код от приложение за автентикация. Това силно затруднява достъпа дори при изтекла парола.',
    en: 'Add a second factor at sign-in — a one-time code from an authenticator app. This makes access much harder even if your password leaks.',
  },
  'tfa.start': { bg: 'Започни настройка', en: 'Start setup' },
  'tfa.verify_title': { bg: 'Двуфакторна проверка', en: 'Two-factor verification' },
  'tfa.verify_intro': {
    bg: 'Въведете 6-цифрения код от приложението ви за автентикация (напр. Google Authenticator, Authy).',
    en: 'Enter the 6-digit code from your authenticator app (e.g. Google Authenticator, Authy).',
  },
  'tfa.confirm': { bg: 'Потвърди', en: 'Confirm' },

  // Резервни кодове
  'rc.title': { bg: 'Резервни кодове за 2FA', en: '2FA recovery codes' },
  'rc.regenerated': {
    bg: 'Генерирани са нови кодове. Старите вече не важат.',
    en: 'New codes generated. The old ones no longer work.',
  },
  'rc.enabled': {
    bg: 'Двуфакторната автентикация е включена.',
    en: 'Two-factor authentication is enabled.',
  },
  'rc.note': {
    bg: 'Запазете тези кодове на сигурно място. Всеки код може да се използва еднократно, ако нямате достъп до приложението за автентикация. Това е единственият момент, в който ще ги видите.',
    en: 'Store these codes somewhere safe. Each code can be used once if you don’t have access to your authenticator app. This is the only time you will see them.',
  },
  'rc.print': { bg: 'Печат', en: 'Print' },
  'rc.saved': { bg: 'Запазих ги — продължи', en: 'I saved them — continue' },

  // Паскейове
  'pk.title': { bg: 'Паскейове (passkeys)', en: 'Passkeys' },
  'pk.intro': {
    bg: 'Паскейовете позволяват вход с пръстов отпечатък, лице или хардуерен ключ — без парола и устойчиво на фишинг.',
    en: 'Passkeys let you sign in with a fingerprint, face or hardware key — passwordless and phishing-resistant.',
  },
  'pk.none': {
    bg: 'Все още нямате регистрирани паскейове.',
    en: 'You have no registered passkeys yet.',
  },
  'pk.default_label': { bg: 'Паскей', en: 'Passkey' },
  'pk.remove': { bg: 'Премахни', en: 'Remove' },
  'pk.remove_confirm': { bg: 'Да премахна ли този паскей?', en: 'Remove this passkey?' },
  'pk.device_name': { bg: 'Име на устройството', en: 'Device name' },
  'pk.device_ph': { bg: 'напр. Телефонът ми', en: 'e.g. My phone' },
  'pk.add': { bg: 'Добави паскей', en: 'Add passkey' },

  // Общи навигационни/връзки
  'nav.back_profile': { bg: 'Назад към профила', en: 'Back to profile' },

  // Системни съобщения (от сървъра)
  'msg.link_invalid_title': { bg: 'Невалиден или изтекъл линк', en: 'Invalid or expired link' },
  'msg.verify_invalid': {
    bg: 'Линкът за потвърждение е невалиден или е изтекъл. Влезте и поискайте нов.',
    en: 'The verification link is invalid or has expired. Log in and request a new one.',
  },
  'msg.to_login': { bg: 'Към вход', en: 'To log in' },
  'msg.email_verified_title': { bg: 'Имейлът е потвърден', en: 'Email verified' },
  'msg.email_verified': {
    bg: 'Благодарим! Вашият имейл е потвърден успешно.',
    en: 'Thank you! Your email has been verified successfully.',
  },
  'msg.to_profile': { bg: 'Към профила', en: 'To profile' },
  'msg.resend_title': { bg: 'Изпратихме нов линк', en: 'We sent a new link' },
  'msg.resend_body': {
    bg: 'Изпратихме линк за потвърждение на {email}. Проверете пощата си.',
    en: 'We sent a verification link to {email}. Check your inbox.',
  },
  'msg.reset_invalid': {
    bg: 'Линкът за нулиране е невалиден или изтекъл. Поискайте нов.',
    en: 'The reset link is invalid or has expired. Request a new one.',
  },
  'msg.request_new': { bg: 'Поискай нов линк', en: 'Request a new link' },
  'msg.password_changed_title': { bg: 'Паролата е сменена', en: 'Password changed' },
  'msg.password_changed': {
    bg: 'Можете да влезете с новата си парола.',
    en: 'You can now log in with your new password.',
  },
  'msg.account_deleted': {
    bg: 'Профилът и всички данни са изтрити окончателно.',
    en: 'Your account and all data have been permanently deleted.',
  },
  'msg.not_found': { bg: 'Страницата не е намерена.', en: 'Page not found.' },
  'msg.unexpected': {
    bg: 'Възникна неочаквана грешка. Опитайте отново.',
    en: 'An unexpected error occurred. Please try again.',
  },
  'msg.csrf': {
    bg: 'Невалидна или изтекла заявка (CSRF). Презаредете страницата и опитайте пак.',
    en: 'Invalid or expired request (CSRF). Reload the page and try again.',
  },
  'msg.emerg_invalid': { bg: 'Невалиден или изтекъл код.', en: 'Invalid or expired code.' },
  // Грешки при вход/регистрация/2FA
  'err.bad_login': { bg: 'Грешен имейл или парола.', en: 'Wrong email or password.' },
  'err.locked': {
    bg: 'Профилът е временно заключен след твърде много опити. Опитайте по-късно.',
    en: 'Account temporarily locked after too many attempts. Try again later.',
  },
  'err.required_all': {
    bg: 'Имейл, парола и име са задължителни.',
    en: 'Email, password and name are required.',
  },
  'err.password_min': {
    bg: 'Паролата трябва да е поне {n} символа.',
    en: 'The password must be at least {n} characters.',
  },
  'err.consent_needed': {
    bg: 'Трябва да се съгласите с обработката на данните, за да продължите.',
    en: 'You must agree to the processing of your data to continue.',
  },
  'err.email_taken': {
    bg: 'Вече има регистрация с този имейл.',
    en: 'This email is already registered.',
  },
  'err.bad_code': { bg: 'Грешен код.', en: 'Wrong code.' },
  'err.passwords_mismatch': { bg: 'Паролите не съвпадат.', en: 'The passwords do not match.' },
  'err.wrong_password': { bg: 'Грешна парола.', en: 'Wrong password.' },
  'err.name_required': { bg: 'Името е задължително.', en: 'Name is required.' },
  'err.bad_coords': { bg: 'Невалидни координати.', en: 'Invalid coordinates.' },
  'err.challenge_expired': { bg: 'Изтекло предизвикателство.', en: 'Challenge expired.' },
  'err.webauthn_failed': { bg: 'Неуспешна проверка.', en: 'Verification failed.' },
  'err.unknown_passkey': { bg: 'Непознат passkey.', en: 'Unknown passkey.' },

  // Общи / карта за печат
  'common.home': { bg: 'Начало', en: 'Home' },
  'common.back': { bg: 'Назад', en: 'Back' },
  'card.title': { bg: 'Карта за печат', en: 'Print card' },
  'card.qr_alt': {
    bg: 'QR код за спешна медицинска информация',
    en: 'QR code for emergency medical information',
  },

  // Спешен PIN / страница за грешка
  'pin.title': { bg: 'Изисква се PIN', en: 'PIN required' },
  'pin.heading': { bg: 'Защитен профил', en: 'Protected profile' },
  'pin.intro': {
    bg: 'Този спешен профил е защитен с PIN. Въведете го, за да видите информацията.',
    en: 'This emergency profile is protected with a PIN. Enter it to view the information.',
  },
  'pin.locked': {
    bg: 'Достъпът е временно блокиран след твърде много опити. Опитайте по-късно.',
    en: 'Access is temporarily blocked after too many attempts. Try again later.',
  },
  'pin.show': { bg: 'Покажи информацията', en: 'Show information' },
  'pin.too_many': {
    bg: 'Твърде много опити. Опитайте отново по-късно.',
    en: 'Too many attempts. Try again later.',
  },
  'pin.wrong': { bg: 'Грешен PIN.', en: 'Wrong PIN.' },
  'err.page_title': { bg: 'Грешка', en: 'Error' },
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
